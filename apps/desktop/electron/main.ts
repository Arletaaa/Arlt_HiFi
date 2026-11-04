import electron from "electron";
import { watch, type FSWatcher } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppSettings,
  AudioFileSelectionResult,
  FolderImportResult,
  LibraryImportProgress,
  LibraryImportResult,
  LibraryRescanResult,
  Track
} from "@arlt-hifi/shared";
import { appEntryUrl, createAppProtocolHandler, registerAppProtocolPrivileges } from "./app-protocol.js";
import { readInstalledLibraryRoot } from "./install-paths.js";
import { importAudioFiles } from "./library-import.js";
import { applyLibraryEdits, editLibraryTrack, removeLibraryTrack, renameLibraryTrack, setLibraryTrackCover } from "./library-manage.js";
import { pruneMissingEntries, readLibraryManifest, writeLibraryManifest } from "./library-manifest.js";
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
// 安装器写下的曲库目录优先；开发模式没有安装记录时退回 userData/library。
let installedLibraryRoot: string | null = null;
const getLibraryDirectory = (): string => installedLibraryRoot ?? join(app.getPath("userData"), "library");
const getLibraryManifestPath = (): string => join(app.getPath("userData"), "library.json");

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

/** 读取托管曲库：以 manifest 为准，顺手剔除已被手工删除的文件。 */
const loadManagedLibrary = async (): Promise<readonly Track[]> => {
  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifest(manifestPath);
  const pruned = await pruneMissingEntries(manifest.entries);

  if (pruned.removed > 0) {
    await writeLibraryManifest(manifestPath, { entries: pruned.entries, version: manifest.version });
  }

  const tracks = pruned.entries.map((entry) => entry.track);

  applyMediaAccess(tracks);

  return tracks;
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

    void loadManagedLibrary()
      .then((tracks) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send(libraryChangedChannel, tracks);
          }
        }
      })
      .catch(() => undefined);
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
    const manifest = await readLibraryManifest(manifestPath);
    const outcome = await importAudioFiles({
      coversDirectory: getCoversDirectory(),
      entries: manifest.entries,
      filePaths,
      libraryDirectory: getLibraryDirectory(),
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
      skipped: outcome.skipped
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
  const manifest = await readLibraryManifest(manifestPath);
  const outcome = await rescanLibraryEntries({ entries: manifest.entries });

  if (outcome.updated > 0) {
    await writeLibraryManifest(manifestPath, { entries: outcome.entries, version: manifest.version });
  }

  const tracks = outcome.entries.map((entry) => entry.track);
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
  const manifest = await readLibraryManifest(manifestPath);
  const outcome = await renameLibraryTrack({ entries: manifest.entries, title, trackId: rawTrackId });

  if (!outcome) {
    throw new Error("找不到该曲目。");
  }

  await writeLibraryManifest(manifestPath, { entries: outcome.entries, version: manifest.version });
  applyMediaAccess(outcome.entries.map((entry) => entry.track));

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
  const manifest = await readLibraryManifest(manifestPath);
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
  applyMediaAccess(outcome.entries.map((entry) => entry.track));

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
  const manifest = await readLibraryManifest(manifestPath);
  const entries = applyLibraryEdits({ edits, entries: manifest.entries });

  await writeLibraryManifest(manifestPath, { entries, version: manifest.version });
  applyMediaAccess(entries.map((entry) => entry.track));

  return entries.map((entry) => entry.track);
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
  const manifest = await readLibraryManifest(manifestPath);
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
  applyMediaAccess(outcome.entries.map((entry) => entry.track));

  return outcome.track;
});

ipcMain.handle(deleteTrackChannel, async (_event, rawTrackId: unknown): Promise<boolean> => {
  if (typeof rawTrackId !== "string") {
    throw new Error("曲目 id 不能为空。");
  }

  const manifestPath = getLibraryManifestPath();
  const manifest = await readLibraryManifest(manifestPath);
  const outcome = await removeLibraryTrack({
    coversDirectory: getCoversDirectory(),
    entries: manifest.entries,
    trackId: rawTrackId
  });

  if (!outcome) {
    return false;
  }

  await writeLibraryManifest(manifestPath, { entries: outcome.entries, version: manifest.version });
  applyMediaAccess(outcome.entries.map((entry) => entry.track));

  return true;
});

ipcMain.handle(loadSettingsChannel, async (): Promise<AppSettings> => {
  return readSettings(app.getPath("userData"));
});

ipcMain.handle(saveSettingsChannel, async (_event, next: unknown): Promise<AppSettings> => {
  const settings = mergeSettings(next);
  await writeSettings(app.getPath("userData"), settings);

  return settings;
});

ipcMain.handle(openLibraryFolderChannel, async (): Promise<void> => {
  const directory = getLibraryDirectory();
  await mkdir(directory, { recursive: true });

  const errorMessage = await shell.openPath(directory);

  if (errorMessage) {
    throw new Error(errorMessage);
  }
});

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
  installedLibraryRoot = await readInstalledLibraryRoot(app.getPath("userData"));

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
