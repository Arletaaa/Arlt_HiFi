import { createHash } from "node:crypto";
import { copyFile, mkdir, open, stat } from "node:fs/promises";
import { dirname, extname, join, parse } from "node:path";
import type { ImportSkippedFile, Track } from "@arlt-hifi/shared";
import type { LibraryEntry } from "./library-manifest.js";
import { cacheCover, createTrackFromFilePath, isSupportedAudioFile, parseAudioFile, type ParsedAudio, toTrack } from "./music-scanner.js";

/** 去重只读文件头部，避免为几百 MB 的母带整份算哈希。 */
const HEAD_HASH_BYTES = 256 * 1024;
/** 单个路径段的长度上限，给 Windows 的 260 字符总长留余量。 */
const MAX_SEGMENT_LENGTH = 80;
const illegalChars = /[<>:"/\\|?*\u0000-\u001f]/gu;
const trailingDotsOrSpaces = /[. ]+$/u;

/** 把标签值收敛成合法的路径段（Windows 非法字符替换为 `_`）。 */
export const sanitizePathSegment = (value: string, fallback: string): string => {
  const cleaned = value.replace(illegalChars, "_").replace(/\s+/gu, " ").trim().replace(trailingDotsOrSpaces, "");
  const limited = cleaned.slice(0, MAX_SEGMENT_LENGTH).replace(trailingDotsOrSpaces, "");

  return limited.length > 0 ? limited : fallback;
};

/** 托管目录内的相对路径：`<artist>/<album>/<title>.<ext>`（纯函数）。 */
export const getImportRelativeSegments = (filePath: string, parsed: ParsedAudio | null): readonly string[] => {
  const fallback = createTrackFromFilePath(filePath);
  const extension = extname(filePath).toLowerCase();

  return [
    sanitizePathSegment(parsed?.artist ?? fallback.artist, fallback.artist),
    sanitizePathSegment(parsed?.album ?? fallback.album, fallback.album),
    `${sanitizePathSegment(parsed?.title ?? fallback.title, fallback.title)}${extension}`
  ];
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);

    return true;
  } catch {
    return false;
  }
};

/** 同目录重名时追加 ` (2)`、` (3)`…，不覆盖已有文件。 */
export const resolveAvailablePath = async (targetPath: string, usedPaths: ReadonlySet<string>): Promise<string> => {
  if (!usedPaths.has(targetPath) && !(await fileExists(targetPath))) {
    return targetPath;
  }

  const { dir, name } = parse(targetPath);
  const extension = extname(targetPath);

  for (let index = 2; index < 1000; index += 1) {
    const candidate = join(dir, `${name} (${index})${extension}`);

    if (!usedPaths.has(candidate) && !(await fileExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`No available file name for ${targetPath}`);
};

export interface AudioFingerprint {
  readonly headSha1: string;
  readonly size: number;
}

export const getFileFingerprint = async (filePath: string): Promise<AudioFingerprint> => {
  const size = (await stat(filePath)).size;
  const handle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(Math.min(size, HEAD_HASH_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);

    return {
      headSha1: createHash("sha1").update(buffer.subarray(0, bytesRead)).digest("hex"),
      size
    };
  } finally {
    await handle.close();
  }
};

export interface ImportCandidate extends AudioFingerprint {
  readonly durationSeconds: number;
}

/** 去重三元组：文件大小、时长、前 256KB SHA-1 全部相同才算同一首。 */
export const findDuplicateEntry = (
  entries: readonly LibraryEntry[],
  candidate: ImportCandidate
): LibraryEntry | undefined =>
  entries.find(
    (entry) =>
      entry.size === candidate.size &&
      entry.track.durationSeconds === candidate.durationSeconds &&
      entry.headSha1 === candidate.headSha1
  );

export interface ImportAudioFilesOptions {
  readonly coversDirectory: string | null;
  /** 已托管的曲目，用于去重与重名避让。 */
  readonly entries: readonly LibraryEntry[];
  readonly filePaths: readonly string[];
  readonly importedAt?: () => string;
  readonly libraryDirectory: string;
  readonly onProgress?: (completed: number, total: number) => void;
  /** 取消信号：只在文件之间检查，已复制的文件不会回滚。 */
  readonly signal?: AbortSignal;
}

export interface ImportAudioFilesOutcome {
  /** 本次新增的库条目（与 `imported` 一一对应）。 */
  readonly entries: readonly LibraryEntry[];
  readonly imported: readonly Track[];
  /** 取消后尚未处理的文件；正常完成时为空。 */
  readonly remainingFilePaths: readonly string[];
  readonly skipped: readonly ImportSkippedFile[];
}

/** 复制入库：解析标签 → 三元组去重 → `<artist>/<album>/<title>.<ext>` → 缓存封面。 */
export const importAudioFiles = async (options: ImportAudioFilesOptions): Promise<ImportAudioFilesOutcome> => {
  const timestamp = options.importedAt ?? (() => new Date().toISOString());
  const entries = [...options.entries];
  const imported: Track[] = [];
  const skipped: ImportSkippedFile[] = [];
  const usedPaths = new Set(entries.map((entry) => entry.track.filePath));
  const total = options.filePaths.length;

  const importOne = async (filePath: string): Promise<void> => {
    if (!isSupportedAudioFile(filePath)) {
      skipped.push({ filePath, reason: "unsupported" });
      return;
    }

    try {
      const parsed = await parseAudioFile(filePath);
      const fingerprint = await getFileFingerprint(filePath);
      const durationSeconds = Math.max(0, Math.round(parsed?.durationSeconds ?? 0));

      if (findDuplicateEntry(entries, { durationSeconds, ...fingerprint })) {
        skipped.push({ filePath, reason: "duplicate" });
        return;
      }

      const relativeSegments = getImportRelativeSegments(filePath, parsed);
      const targetPath = await resolveAvailablePath(join(options.libraryDirectory, ...relativeSegments), usedPaths);

      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(filePath, targetPath);

      const coverPath = await cacheCover(options.coversDirectory, targetPath, parsed?.picture ?? null);
      const track = toTrack(targetPath, parsed, coverPath);

      entries.push({ headSha1: fingerprint.headSha1, importedAt: timestamp(), size: fingerprint.size, track });
      usedPaths.add(targetPath);
      imported.push(track);
    } catch {
      // 单个文件失败（权限、磁盘、损坏）不影响同批其他文件。
      skipped.push({ filePath, reason: "failed" });
    }
  };

  let processed = 0;

  for (const [index, filePath] of options.filePaths.entries()) {
    if (options.signal?.aborted) {
      break;
    }

    await importOne(filePath);
    processed = index + 1;
    options.onProgress?.(processed, total);
  }

  return {
    entries: entries.slice(options.entries.length),
    imported,
    remainingFilePaths: options.filePaths.slice(processed),
    skipped
  };
};
