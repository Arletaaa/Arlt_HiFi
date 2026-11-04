import electron from "electron";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppSettings,
  AudioFileSelectionResult,
  FolderImportResult,
  ImportSkippedFile,
  LibraryImportProgress,
  LibraryImportResult,
  LibraryRescanResult,
  LibraryLocation,
  Track
} from "@arlt-hifi/shared";
import { appEntryUrl, createAppProtocolHandler, registerAppProtocolPrivileges } from "./app-protocol.js";
import { readInstalledLibraryRoot } from "./install-paths.js";
import { importAudioFiles } from "./library-import.js";
import { applyLibraryEdits, editLibraryTrack, removeLibraryTrack, renameLibraryTrack, setLibraryTrackCover } from "./library-manage.js";
import { filterEntriesByLibraryRoot, mergeEntryUpdates, pruneMissingEntriesUnderRoot, readLibraryManifest, writeLibraryManifest, type LibraryEntry, type LibraryManifest } from "./library-manifest.js";
import {
  inspectLibraryDirectory,
  isPathInside,
  normalizeLibraryRoot,
  resolveLibraryRoot,
  type ResolvedLibraryRoot
} from "./library-root.js";
import { createMediaProtocolAccess, registerMediaProtocolPrivileges } from "./media-protocol.js";
import { collectAudioFilePaths } from "./music-scanner.js";
import { rescanLibraryEntries } from "./library-rescan.js";
import { mergeSettings, readSettings, writeSettings } from "./settings-store.js";

const { app, BrowserWindow, dialog, ipcMain, shell } = electron;

// 统一 dev / start / 打包产物的 userData；dev 直接跑 main.js 时默认是 %APPDATA%\Electron。
app.setName("Arlt-HiFi");

const currentDir = dirname(fileURLToPath(import.meta.url));
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
// 开发期窗口/任务栏图标；打包后图标由 electron-builder 写进 exe，无需再传。
const devWindowIcon = app.isPackaged ? null : join(currentDir, "../build/icon.png");
const selectAudioFilesChannel = "library:select-files";
const importAudioFilesChannel = "library:import-files";
const importAudioFolderChannel = "library:import-folder";
const cancelLibraryImportChannel = "library:cancel-import";
const loadLibraryChannel = "library:load";
const rescanLibraryChannel = "library:rescan";
const renameTrackChannel = "library:rename-track";
const editTrackChannel = "library:edit-track";
const applyTrackEditsChannel = "library:apply-edits";
const setTrackCoverChannel = "library:set-track-cover";
const deleteTrackChannel = "library:delete-track";
const openLibraryFolderChannel = "library:open-folder";
const getLibraryLocationChannel = "library:get-location";
const chooseLibraryDirectoryChannel = "library:choose-directory";
const libraryChangedChannel = "library:changed";
const libraryImportProgressChannel = "library:import-progress";
const loadSettingsChannel = "settings:load";
const saveSettingsChannel = "settings:save";
const mediaProtocolAccess = createMediaProtocolAccess();
let activeImportController: AbortController | null = null;
let libraryWatcher: FSWatcher | null = null;
let libraryRefreshTimer: NodeJS.Timeout | null = null;

const audioDialogFilters: electron.FileFilter[] = [
  { name: "音频", extensions: ["flac", "wav", "mp3", "m4a", "ogg"] }
];
const imageDialogFilters: electron.FileFilter[] = [
  { name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }
];

registerMediaProtocolPrivileges();
registerAppProtocolPrivileges();

const appProtocolAccess = createAppProtocolHandler(join(currentDir, "../dist"));

const getActiveWindow = (): electron.BrowserWindow | null =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;

const getCoversDirectory = (): string => join(app.getPath("userData"), "covers");
// 优先级：settings.libraryRoot > 安装器 install.ini > userData/library。
let installedLibraryRoot: string | null = null;
let libraryRoot: ResolvedLibraryRoot = { directory: join(app.getPath("userData"), "library"), source: "default" };
const getLibraryDirectory = (): string => libraryRoot.directory;
const getLibraryLocation = (): LibraryLocation => ({ directory: libraryRoot.directory, source: libraryRoot.source });
const getLibraryManifestPath = (): string => join(app.getPath("userData"), "library.json");

/** 删除走系统回收站；文件已被手工删掉时仍允许移除条目。 */
const trashFile = async (filePath: string): Promise<void> => {
  try {
    await shell.trashItem(filePath);
  } catch (error) {
    if (!existsSync(filePath)) {
      return;
    }

    throw error;
  }
};

/** 按当前 settings / install.ini 重新解析根目录；返回是否发生变化。 */
const syncLibraryRoot = (settings: AppSettings): boolean => {
  const next = resolveLibraryRoot({
    installedRoot: installedLibraryRoot,
    settingsRoot: settings.libraryRoot,
    userDataDirectory: app.getPath("userData")
  });
  const changed = next.directory !== libraryRoot.directory;

  libraryRoot = next;

  return changed;
};

/** 读取完整清单（保留其它曲库目录下的条目，切换目录时不丢记录）。 */
const readLibraryManifestForCurrentRoot = async (manifestPath: string): Promise<LibraryManifest> => {
  return readLibraryManifest(manifestPath);
};

/** 当前根目录下可展示的条目；其它根的记录留在清单里，但不读取、不展示。 */
const selectVisibleEntries = (entries: readonly LibraryEntry[]): readonly LibraryEntry[] =>
  filterEntriesByLibraryRoot(entries, getLibraryDirectory());

const toVisibleTracks = (entries: readonly LibraryEntry[]): readonly Track[] =>
  selectVisibleEntries(entries).map((entry) => entry.track);

/** 曲库整体变化后刷新媒体协议白名单（音频整体替换，封面累加）。 */
const applyMediaAccess = (tracks: readonly Track[]): void => {
  mediaProtocolAccess.allowAudioFilePaths(tracks.map((track) => track.filePath));
  mediaProtocolAccess.addImageFilePaths(
    tracks.map((track) => track.coverPath).filter((coverPath): coverPath is string => coverPath !== null)
  );
};

const showDialog = async (
  options: electron.OpenDialogOptions
): Promise<electron.OpenDialogReturnValue> => {
  const activeWindow = getActiveWindow();

  return activeWindow ? dialog.showOpenDialog(activeWindow, options) : dialog.showOpenDialog(options);
};

const showMessageBox = async (
  options: electron.MessageBoxOptions
): Promise<electron.MessageBoxReturnValue> => {
  const activeWindow = getActiveWindow();

  return activeWindow ? dialog.showMessageBox(activeWindow, options) : dialog.showMessageBox(options);
};

/** 读取托管曲库：以 manifest 为准，只清理当前根目录下已被手工删除的文件。 */
const loadManagedLibrary = async (): Promise<readonly Track[]> => {
  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifestForCurrentRoot(manifestPath);
  const pruned = await pruneMissingEntriesUnderRoot(manifest.entries, getLibraryDirectory());

  if (pruned.removed > 0) {
    await writeLibraryManifest(manifestPath, { entries: pruned.entries, version: manifest.version });
  }

  // 只在展示与媒体白名单里按当前曲库目录过滤，清单本身保留其它目录的记录。
  const tracks = toVisibleTracks(pruned.entries);

  applyMediaAccess(tracks);

  return tracks;
};

const broadcastLibrary = (tracks: readonly Track[]): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(libraryChangedChannel, tracks);
    }
  }
};

/** 重新读取当前根目录的曲库并推给窗口（切换根目录后立即生效）。 */
const refreshLibraryAndBroadcast = async (): Promise<void> => {
  broadcastLibrary(await loadManagedLibrary());
};

/** 外部改动了托管目录后，稍等文件操作稳定再重读清单并通知窗口。 */
const scheduleLibraryChanged = (): void => {
  if (activeImportController) {
    return;
  }

  if (libraryRefreshTimer) {
    clearTimeout(libraryRefreshTimer);
  }

  libraryRefreshTimer = setTimeout(() => {
    libraryRefreshTimer = null;

    void refreshLibraryAndBroadcast().catch(() => undefined);
  }, 600);
};

const startLibraryWatcher = async (): Promise<void> => {
  const directory = getLibraryDirectory();

  try {
    await mkdir(directory, { recursive: true });

    libraryWatcher = watch(directory, { recursive: true }, () => {
      scheduleLibraryChanged();
    });
    libraryWatcher.on("error", () => {
      libraryWatcher?.close();
      libraryWatcher = null;
    });
  } catch {
    // 盘符不可用或平台不支持递归监听时，仍可在切回窗口时刷新。
  }
};

/** 换曲库根目录后把监听器指到新目录。 */
const restartLibraryWatcher = async (): Promise<void> => {
  libraryWatcher?.close();
  libraryWatcher = null;

  if (libraryRefreshTimer) {
    clearTimeout(libraryRefreshTimer);
    libraryRefreshTimer = null;
  }

  await startLibraryWatcher();
};

/** 复制入库并落盘 manifest；新文件立刻放行给媒体协议，不用重启。 */
const importPaths = async (
  event: electron.IpcMainInvokeEvent,
  filePaths: readonly string[]
): Promise<LibraryImportResult> => {
  if (activeImportController) {
    throw new Error("已有导入正在进行，请稍候。");
  }

  const controller = new AbortController();
  activeImportController = controller;

  try {
    const manifestPath = getLibraryManifestPath();
    const manifest = await readLibraryManifestForCurrentRoot(manifestPath);
    const libraryDirectory = getLibraryDirectory();
    // 从曲库目录内部再导入只会生成 ` (2)` 副本，直接跳过并计入 skipped。
    const blockedSkipped = filePaths
      .filter((filePath) => isPathInside(libraryDirectory, filePath))
      .map((filePath): ImportSkippedFile => ({ filePath, reason: "in-library" }));
    const acceptedFilePaths = filePaths.filter((filePath) => !isPathInside(libraryDirectory, filePath));

    if (acceptedFilePaths.length === 0) {
      return { imported: [], skipped: blockedSkipped };
    }

    const outcome = await importAudioFiles({
      coversDirectory: getCoversDirectory(),
      entries: manifest.entries,
      filePaths: acceptedFilePaths,
      libraryDirectory,
      signal: controller.signal,
      onProgress: (completed, total) => {
        if (event.sender.isDestroyed()) {
          return;
        }

        const progress: LibraryImportProgress = { completed, total };

        event.sender.send(libraryImportProgressChannel, progress);
      }
    });

    await writeLibraryManifest(manifestPath, {
      entries: [...manifest.entries, ...outcome.entries],
      version: manifest.version
    });

    mediaProtocolAccess.addAudioFilePaths(outcome.imported.map((track) => track.filePath));
    mediaProtocolAccess.addImageFilePaths(
      outcome.imported.map((track) => track.coverPath).filter((coverPath): coverPath is string => coverPath !== null)
    );

    return {
      imported: outcome.imported,
      interrupted: controller.signal.aborted,
      remainingFilePaths: outcome.remainingFilePaths,
      skipped: [...blockedSkipped, ...outcome.skipped]
    };
  } finally {
    if (activeImportController === controller) {
      activeImportController = null;
    }
  }
};

ipcMain.handle(selectAudioFilesChannel, async (): Promise<AudioFileSelectionResult> => {
  const result = await showDialog({
    title: "选择音频文件",
    properties: ["openFile", "multiSelections"],
    filters: audioDialogFilters
  });

  return {
    canceled: result.canceled,
    filePaths: result.canceled ? [] : result.filePaths
  };
});

ipcMain.handle(importAudioFilesChannel, async (event, rawFilePaths: unknown): Promise<LibraryImportResult> => {
  if (
    !Array.isArray(rawFilePaths) ||
    rawFilePaths.length === 0 ||
    rawFilePaths.some((filePath) => typeof filePath !== "string" || filePath.trim().length === 0)
  ) {
    throw new Error("至少需要一个有效的音频文件路径。");
  }

  return importPaths(event, rawFilePaths as readonly string[]);
});

ipcMain.handle(importAudioFolderChannel, async (event): Promise<FolderImportResult> => {
  const result = await showDialog({
    title: "选择音乐文件夹",
    properties: ["openDirectory"]
  });
  const directoryPath = result.filePaths[0] ?? null;

  if (result.canceled || !directoryPath) {
    return { canceled: true, imported: [], skipped: [] };
  }

  const filePaths = await collectAudioFilePaths(directoryPath);
  const imported = await importPaths(event, filePaths);

  return { canceled: false, ...imported };
});

ipcMain.handle(cancelLibraryImportChannel, async (): Promise<boolean> => {
  if (!activeImportController) {
    return false;
  }

  activeImportController.abort();

  return true;
});

ipcMain.handle(loadLibraryChannel, async (): Promise<readonly Track[]> => loadManagedLibrary());

ipcMain.handle(rescanLibraryChannel, async (): Promise<LibraryRescanResult> => {
  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifestForCurrentRoot(manifestPath);
  const visible = selectVisibleEntries(manifest.entries);
  const outcome = await rescanLibraryEntries({ entries: visible });
  const merged = mergeEntryUpdates(manifest.entries, outcome.entries);

  if (outcome.updated > 0) {
    await writeLibraryManifest(manifestPath, { entries: merged, version: manifest.version });
  }

  const tracks = toVisibleTracks(merged);
  applyMediaAccess(tracks);

  return { failed: outcome.failed, tracks, updated: outcome.updated };
});

ipcMain.handle(renameTrackChannel, async (_event, rawTrackId: unknown, rawTitle: unknown): Promise<Track> => {
  if (typeof rawTrackId !== "string" || typeof rawTitle !== "string") {
    throw new Error("曲目 id 与标题不能为空。");
  }

  const title = rawTitle.trim();

  if (title.length === 0) {
    throw new Error("标题不能为空。");
  }

  if (title.length > 200) {
    throw new Error("标题过长。");
  }

  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifestForCurrentRoot(manifestPath);
  const outcome = await renameLibraryTrack({ entries: manifest.entries, title, trackId: rawTrackId });

  if (!outcome) {
    throw new Error("找不到该曲目。");
  }

  await writeLibraryManifest(manifestPath, { entries: outcome.entries, version: manifest.version });
  applyMediaAccess(toVisibleTracks(outcome.entries));

  return outcome.track;
});

ipcMain.handle(editTrackChannel, async (_event, rawTrackId: unknown, rawEdit: unknown): Promise<Track> => {
  if (typeof rawTrackId !== "string") {
    throw new Error("曲目 id 不能为空。");
  }

  const edit = typeof rawEdit === "object" && rawEdit !== null ? (rawEdit as Record<string, unknown>) : {};
  const album = typeof edit.album === "string" ? edit.album : "";
  const albumArtist = typeof edit.albumArtist === "string" ? edit.albumArtist : "";
  const discNumber = typeof edit.discNumber === "number" ? edit.discNumber : 0;
  const trackNumber = typeof edit.trackNumber === "number" ? edit.trackNumber : 0;

  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifestForCurrentRoot(manifestPath);
  const outcome = editLibraryTrack({
    album,
    albumArtist,
    discNumber,
    entries: manifest.entries,
    trackId: rawTrackId,
    trackNumber
  });

  if (!outcome) {
    throw new Error("找不到该曲目。");
  }

  await writeLibraryManifest(manifestPath, { entries: outcome.entries, version: manifest.version });
  applyMediaAccess(toVisibleTracks(outcome.entries));

  return outcome.track;
});

ipcMain.handle(applyTrackEditsChannel, async (_event, rawEdits: unknown): Promise<readonly Track[]> => {
  if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
    throw new Error("至少需要一条曲目编辑。");
  }

  const edits = rawEdits.map((raw) => {
    const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const trackId = typeof record.trackId === "string" ? record.trackId : "";

    if (trackId.length === 0) {
      throw new Error("曲目 id 不能为空。");
    }

    return {
      album: typeof record.album === "string" ? record.album : "",
      albumArtist: typeof record.albumArtist === "string" ? record.albumArtist : "",
      cdId: typeof record.cdId === "string" ? record.cdId : null,
      discNumber: typeof record.discNumber === "number" ? record.discNumber : 0,
      trackId,
      trackNumber: typeof record.trackNumber === "number" ? record.trackNumber : 0
    };
  });

  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifestForCurrentRoot(manifestPath);
  const entries = applyLibraryEdits({ edits, entries: manifest.entries });

  await writeLibraryManifest(manifestPath, { entries, version: manifest.version });
  const tracks = toVisibleTracks(entries);
  applyMediaAccess(tracks);

  return tracks;
});

ipcMain.handle(setTrackCoverChannel, async (_event, rawTrackId: unknown): Promise<Track | null> => {
  if (typeof rawTrackId !== "string") {
    throw new Error("曲目 id 不能为空。");
  }

  const result = await showDialog({
    title: "选择封面图片",
    properties: ["openFile"],
    filters: imageDialogFilters
  });
  const sourcePath = result.filePaths[0] ?? null;

  if (result.canceled || !sourcePath) {
    return null;
  }

  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifestForCurrentRoot(manifestPath);
  const outcome = await setLibraryTrackCover({
    coversDirectory: getCoversDirectory(),
    entries: manifest.entries,
    sourcePath,
    trackId: rawTrackId
  });

  if (!outcome) {
    throw new Error("找不到该曲目。");
  }

  await writeLibraryManifest(manifestPath, { entries: outcome.entries, version: manifest.version });
  applyMediaAccess(toVisibleTracks(outcome.entries));

  return outcome.track;
});

ipcMain.handle(deleteTrackChannel, async (_event, rawTrackId: unknown): Promise<boolean> => {
  if (typeof rawTrackId !== "string") {
    throw new Error("曲目 id 不能为空。");
  }

  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifestForCurrentRoot(manifestPath);
  const outcome = await removeLibraryTrack({
    coversDirectory: getCoversDirectory(),
    entries: manifest.entries,
    trackId: rawTrackId,
    trashFile
  });

  if (!outcome) {
    return false;
  }

  await writeLibraryManifest(manifestPath, { entries: outcome.entries, version: manifest.version });
  applyMediaAccess(toVisibleTracks(outcome.entries));

  return true;
});

ipcMain.handle(loadSettingsChannel, async (): Promise<AppSettings> => {
  return readSettings(app.getPath("userData"));
});

ipcMain.handle(saveSettingsChannel, async (_event, next: unknown): Promise<AppSettings> => {
  // 曲库根目录只由 library:choose-directory 改写；这里保留磁盘上的值，
  // 避免渲染层一份旧设置把刚切换的目录覆盖回去。
  const current = await readSettings(app.getPath("userData"));
  const settings = { ...mergeSettings(next), libraryRoot: current.libraryRoot };

  await writeSettings(app.getPath("userData"), settings);

  if (syncLibraryRoot(settings)) {
    await restartLibraryWatcher();
  }

  return settings;
});

/**
 * 只允许切到「没有音频文件的目录」或「已登记的曲库」：
 * 普通音乐文件夹没有清单条目，切过去也不会显示任何歌，直接拒绝并让用户重选。
 */
const chooseLibraryDirectory = async (): Promise<LibraryLocation> => {
  let defaultPath = getLibraryDirectory();

  for (;;) {
    const result = await showDialog({
      title: "选择曲库目录",
      properties: ["openDirectory", "createDirectory"],
      defaultPath
    });
    const selected = result.filePaths[0] ?? null;

    if (result.canceled || !selected) {
      return getLibraryLocation();
    }

    const directory = normalizeLibraryRoot(selected);

    if (!directory) {
      throw new Error("请选择绝对路径的目录。");
    }

    if (directory === getLibraryDirectory()) {
      return getLibraryLocation();
    }

    const manifest = await readLibraryManifestForCurrentRoot(getLibraryManifestPath());
    const kind = await inspectLibraryDirectory({ directory, entries: manifest.entries });

    if (kind === "audio") {
      const retry = await showMessageBox({
        type: "warning",
        buttons: ["重新选择", "取消"],
        cancelId: 1,
        defaultId: 0,
        message: "无法使用这个文件夹",
        detail: "里面已有音频文件，但不是 Arlt-HiFi 托管的曲库；切换过去这些文件不会显示，也不会自动导入。\n请选择没有音频文件的文件夹，或之前用过的曲库目录。"
      });

      if (retry.response !== 0) {
        return getLibraryLocation();
      }

      defaultPath = directory;
      continue;
    }

    const settings = await readSettings(app.getPath("userData"));
    const next = { ...settings, libraryRoot: directory };

    await writeSettings(app.getPath("userData"), next);
    syncLibraryRoot(next);
    await restartLibraryWatcher();
    await refreshLibraryAndBroadcast();

    return getLibraryLocation();
  }
};

ipcMain.handle(chooseLibraryDirectoryChannel, async (): Promise<LibraryLocation> => chooseLibraryDirectory());

ipcMain.handle(openLibraryFolderChannel, async (): Promise<void> => {
  const directory = getLibraryDirectory();
  await mkdir(directory, { recursive: true });

  const errorMessage = await shell.openPath(directory);

  if (errorMessage) {
    throw new Error(errorMessage);
  }
});

ipcMain.handle(getLibraryLocationChannel, async (): Promise<LibraryLocation> => getLibraryLocation());

const createWindow = async (): Promise<void> => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0a0d16",
    title: "Arlt-HiFi",
    ...(devWindowIcon ? { icon: devWindowIcon } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return;
  }

  // 生产包用自定义 scheme 提供 dist，避免 file:// 的 module script 限制与绝对资源路径失效。
  await window.loadURL(appEntryUrl);
};

app.whenReady().then(async () => {
  // 安装目录也放了一份 install.ini，避免 $APPDATA 指向其他账户时读不到配置。
  const installDirectory = app.isPackaged ? dirname(process.resourcesPath) : null;
  installedLibraryRoot = await readInstalledLibraryRoot(app.getPath("userData"), installDirectory);
  syncLibraryRoot(await readSettings(app.getPath("userData")));

  mediaProtocolAccess.registerHandler();
  appProtocolAccess.registerHandler();
  void startLibraryWatcher();
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  libraryWatcher?.close();
  libraryWatcher = null;

  if (libraryRefreshTimer) {
    clearTimeout(libraryRefreshTimer);
    libraryRefreshTimer = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
