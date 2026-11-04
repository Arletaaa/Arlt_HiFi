import { createHash } from "node:crypto";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { Track } from "@arlt-hifi/shared";
import type { LibraryEntry } from "./library-manifest.js";
import { resolveAvailablePath, sanitizePathSegment } from "./library-import.js";
import { isSupportedImageFile } from "./media-access.js";

export interface LibraryMutation {
  readonly entries: readonly LibraryEntry[];
  readonly track: Track;
}

const findEntry = (entries: readonly LibraryEntry[], trackId: string): LibraryEntry | null =>
  entries.find((entry) => entry.track.id === trackId) ?? null;

const replaceTrack = (entries: readonly LibraryEntry[], track: Track): readonly LibraryEntry[] =>
  entries.map((entry) => (entry.track.id === track.id ? { ...entry, track } : entry));

/** 重命名曲目：改名副本文件 + 显示标题，id 保持不变（收藏、队列都按 id 引用）。 */
export const renameLibraryTrack = async (options: {
  readonly entries: readonly LibraryEntry[];
  readonly title: string;
  readonly trackId: string;
}): Promise<LibraryMutation | null> => {
  const entry = findEntry(options.entries, options.trackId);

  if (!entry) {
    return null;
  }

  const title = sanitizePathSegment(options.title, entry.track.title);
  const extension = extname(entry.track.filePath);
  const targetPath = join(dirname(entry.track.filePath), `${title}${extension}`);
  const usedPaths = new Set(
    options.entries.filter((candidate) => candidate.track.id !== entry.track.id).map((candidate) => candidate.track.filePath)
  );

  // Windows 上仅大小写变化时不再动文件，避免 rename 成同路径的边界问题。
  const samePath = targetPath.toLowerCase() === entry.track.filePath.toLowerCase();
  let filePath = entry.track.filePath;

  if (!samePath) {
    filePath = await resolveAvailablePath(targetPath, usedPaths);
    await rename(entry.track.filePath, filePath);
  }

  const track: Track = { ...entry.track, title, filePath };

  return { entries: replaceTrack(options.entries, track), track };
};

const normalizeCue = (value: number): number =>
  Number.isFinite(value) ? Math.min(999, Math.max(0, Math.round(value))) : 0;

export interface LibraryEditInput {
  readonly album: string;
  readonly albumArtist: string;
  readonly cdId: string | null;
  readonly discNumber: number;
  readonly trackId: string;
  readonly trackNumber: number;
}

/**
 * 批量写 CD 归属与顺序（整棵树一次落盘）：
 * 合并 / 拆成单曲 / 组内调序都走这里，避免逐首 IPC 中途失败留下半套数据。
 */
export const applyLibraryEdits = (options: {
  readonly edits: readonly LibraryEditInput[];
  readonly entries: readonly LibraryEntry[];
}): readonly LibraryEntry[] => {
  if (options.edits.length === 0) {
    return options.entries;
  }

  const entriesById = new Map(options.entries.map((entry) => [entry.track.id, entry]));
  const edited = new Map<string, Track>();

  for (const edit of options.edits) {
    const entry = entriesById.get(edit.trackId);

    if (!entry) {
      throw new Error("找不到该曲目。");
    }

    // cdId 里带的是完整 trackId（Windows 路径 URL 编码后很长），不能截断：
    // 截断会让同目录下的两首单曲拿到同一个 id，被错误合并成一张 CD。
    const cdId = edit.cdId?.trim().slice(0, 2048) || undefined;

    edited.set(edit.trackId, {
      ...entry.track,
      album: edit.album.trim().slice(0, 120) || entry.track.album,
      albumArtist: edit.albumArtist.trim().slice(0, 120) || undefined,
      cdId,
      discNumber: normalizeCue(edit.discNumber),
      trackNumber: normalizeCue(edit.trackNumber)
    });
  }

  return options.entries.map((entry) => {
    const track = edited.get(entry.track.id);

    return track ? { ...entry, track } : entry;
  });
};

/**
 * 编辑 CD 信息：专辑 / 专辑艺术家 / 碟号 / 音轨号。
 * 只改 manifest 里的 Track，不移动文件、不写音频标签；归组与排序会立即按新值生效。
 */
export const editLibraryTrack = (options: {
  readonly album: string;
  readonly albumArtist: string;
  readonly discNumber: number;
  readonly entries: readonly LibraryEntry[];
  readonly trackId: string;
  readonly trackNumber: number;
}): LibraryMutation | null => {
  const entry = findEntry(options.entries, options.trackId);

  if (!entry) {
    return null;
  }

  const album = options.album.trim().slice(0, 120) || entry.track.album;
  const albumArtist = options.albumArtist.trim().slice(0, 120) || undefined;
  const track: Track = {
    ...entry.track,
    album,
    albumArtist,
    discNumber: normalizeCue(options.discNumber),
    trackNumber: normalizeCue(options.trackNumber)
  };

  return { entries: replaceTrack(options.entries, track), track };
};

const isOverrideCover = (coversDirectory: string, coverPath: string | null): coverPath is string =>
  coverPath !== null && coverPath.startsWith(join(coversDirectory, "override-"));

/** 设置封面：把用户图片复制进 covers 目录，旧的自定义封面顺手删掉。 */
export const setLibraryTrackCover = async (options: {
  readonly coversDirectory: string;
  readonly entries: readonly LibraryEntry[];
  readonly sourcePath: string;
  readonly trackId: string;
}): Promise<LibraryMutation | null> => {
  const entry = findEntry(options.entries, options.trackId);

  if (!entry) {
    return null;
  }

  if (!isSupportedImageFile(options.sourcePath)) {
    throw new Error("只支持 png / jpg / jpeg / webp 图片。");
  }

  const hash = createHash("sha1").update(entry.track.id).digest("hex").slice(0, 12);
  const coverPath = join(
    options.coversDirectory,
    `override-${hash}-${Date.now()}${extname(options.sourcePath).toLowerCase()}`
  );

  await mkdir(options.coversDirectory, { recursive: true });
  await copyFile(options.sourcePath, coverPath);

  if (isOverrideCover(options.coversDirectory, entry.track.coverPath)) {
    await rm(entry.track.coverPath, { force: true });
  }

  const track: Track = { ...entry.track, coverPath };

  return { entries: replaceTrack(options.entries, track), track };
};

/** 删除曲目：把副本移进系统回收站（由主进程注入），删自定义封面，条目从清单移除。 */
export const removeLibraryTrack = async (options: {
  readonly coversDirectory: string;
  readonly entries: readonly LibraryEntry[];
  readonly trackId: string;
  /** 注入 shell.trashItem：库模块不直接依赖 Electron，单测可传替身。 */
  readonly trashFile?: (filePath: string) => Promise<void>;
}): Promise<LibraryMutation | null> => {
  const entry = findEntry(options.entries, options.trackId);

  if (!entry) {
    return null;
  }

  if (options.trashFile) {
    await options.trashFile(entry.track.filePath);
  } else {
    await rm(entry.track.filePath, { force: true });
  }

  if (isOverrideCover(options.coversDirectory, entry.track.coverPath)) {
    await rm(entry.track.coverPath, { force: true });
  }

  return {
    entries: options.entries.filter((candidate) => candidate.track.id !== entry.track.id),
    track: entry.track
  };
};
