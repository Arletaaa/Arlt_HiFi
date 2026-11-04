import { createHash } from "node:crypto";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseFile } from "music-metadata";
import { getAudioQuality, type AudioQuality, type Track } from "@arlt-hifi/shared";
import { isSupportedAudioFile } from "./media-access.js";

export { isSupportedAudioFile };

const HI_RES_RATE_HZ = 96000;
const HI_RES_BIT_DEPTH = 24;

/** music-metadata 结果中我们用到的字段子集，便于单测构造。 */
export interface AudioMetadataLike {
  readonly common: {
    readonly album?: string | undefined;
    readonly albumartist?: string | undefined;
    readonly artist?: string | undefined;
    readonly disk?: { readonly no?: number | null } | undefined;
    readonly picture?: readonly { readonly data: Uint8Array; readonly format: string }[] | undefined;
    readonly title?: string | undefined;
    readonly track?: { readonly no?: number | null } | undefined;
  };
  readonly format: {
    readonly bitsPerSample?: number | undefined;
    readonly codec?: string | undefined;
    readonly duration?: number | undefined;
    readonly sampleRate?: number | undefined;
  };
}

export interface ParsedAudio {
  readonly album: string | null;
  readonly albumArtist: string | null;
  readonly artist: string | null;
  readonly bitDepth: number;
  readonly codec: string | null;
  readonly discNumber: number;
  readonly durationSeconds: number;
  readonly picture: { readonly data: Uint8Array; readonly mime: string } | null;
  readonly sampleRateHz: number;
  readonly title: string | null;
  readonly trackNumber: number;
}

/** 从 music-metadata 结果中抽出我们需要的字段（纯函数）。 */
export const extractAudio = (metadata: AudioMetadataLike): ParsedAudio => {
  const picture = metadata.common.picture?.[0] ?? null;

  return {
    album: metadata.common.album?.trim() || null,
    albumArtist: metadata.common.albumartist?.trim() || null,
    artist: metadata.common.artist?.trim() || null,
    bitDepth: metadata.format.bitsPerSample ?? 0,
    codec: metadata.format.codec ?? null,
    discNumber: metadata.common.disk?.no ?? 0,
    durationSeconds: metadata.format.duration ?? 0,
    picture: picture ? { data: picture.data, mime: picture.format } : null,
    sampleRateHz: metadata.format.sampleRate ?? 0,
    title: metadata.common.title?.trim() || null,
    trackNumber: metadata.common.track?.no ?? 0
  };
};

/** 读取单个文件的标签；标签损坏或不可读时返回 null，由调用方退回文件名。 */
export const parseAudioFile = async (filePath: string): Promise<ParsedAudio | null> => {
  try {
    return extractAudio(await parseFile(filePath, { duration: true }));
  } catch {
    return null;
  }
};

/** 支持格式的音频文件：递归收集，结果稳定排序。 */
export const collectAudioFilePaths = async (directoryPath: string): Promise<readonly string[]> => {
  const audioFilePaths: string[] = [];

  const walk = async (currentDirectoryPath: string): Promise<void> => {
    let entries;

    try {
      entries = await readdir(currentDirectoryPath, { withFileTypes: true });
    } catch {
      // 没有权限的子目录直接跳过，不阻断整次导入。
      return;
    }

    for (const entry of entries) {
      const entryPath = join(currentDirectoryPath, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (entry.isFile() && isSupportedAudioFile(entryPath)) {
        audioFilePaths.push(entryPath);
      }
    }
  };

  await walk(directoryPath);

  // 不依赖系统区域设置：同一批导入的顺序必须稳定。
  return audioFilePaths.sort();
};

const resolveQuality = (filePath: string, sampleRateHz: number, bitDepth: number): AudioQuality => {
  const base = getAudioQuality(filePath);

  if (base === "lossless" && (bitDepth >= HI_RES_BIT_DEPTH || sampleRateHz >= HI_RES_RATE_HZ)) {
    return "hi-res";
  }

  return base;
};

/** 文件名兜底曲目：读不到标签时使用。 */
export const createTrackFromFilePath = (filePath: string): Track => {
  // 扩展名统一小写用于格式判断，但剥标题时必须用原始大小写。
  const extension = extname(filePath);
  const title = basename(filePath, extension).trim() || "Untitled";

  return {
    id: `file://${encodeURIComponent(filePath)}`,
    title,
    artist: "Unknown Artist",
    album: "Unknown Album",
    albumArtist: undefined,
    trackNumber: 0,
    discNumber: 0,
    durationSeconds: 0,
    quality: getAudioQuality(filePath),
    sampleRateHz: 0,
    bitDepth: 0,
    filePath,
    coverPath: null,
    metadataSource: "filename"
  };
};

/** 把标签结果映射为曲目（纯函数，可单测）。 */
export const toTrack = (filePath: string, parsed: ParsedAudio | null, coverPath: string | null): Track => {
  const fallback = createTrackFromFilePath(filePath);

  if (!parsed) {
    return { ...fallback, coverPath };
  }

  const hasTags = Boolean(parsed.title ?? parsed.artist ?? parsed.album);

  return {
    ...fallback,
    title: parsed.title ?? fallback.title,
    artist: parsed.artist ?? fallback.artist,
    album: parsed.album ?? fallback.album,
    albumArtist: parsed.albumArtist ?? undefined,
    trackNumber: parsed.trackNumber,
    discNumber: parsed.discNumber,
    durationSeconds: Math.max(0, Math.round(parsed.durationSeconds)),
    sampleRateHz: parsed.sampleRateHz,
    bitDepth: parsed.bitDepth,
    quality: resolveQuality(filePath, parsed.sampleRateHz, parsed.bitDepth),
    coverPath,
    metadataSource: hasTags ? "tags" : "filename"
  };
};

const coverExtension = (mime: string): string => {
  const normalized = mime.toLowerCase();

  if (normalized.includes("png")) {
    return "png";
  }

  if (normalized.includes("webp")) {
    return "webp";
  }

  return "jpg";
};

/** 封面缓存按源文件路径哈希命名，同一曲目重扫不会产生新文件。 */
export const getCoverCachePath = (coversDirectory: string, filePath: string, mime: string): string => {
  const hash = createHash("sha1").update(filePath).digest("hex").slice(0, 16);

  return join(coversDirectory, `${hash}.${coverExtension(mime)}`);
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);

    return true;
  } catch {
    return false;
  }
};

/** 把内嵌封面写到缓存目录，返回封面路径；没有封面返回 null。 */
export const cacheCover = async (
  coversDirectory: string | null,
  filePath: string,
  picture: ParsedAudio["picture"]
): Promise<string | null> => {
  if (!coversDirectory || !picture) {
    return null;
  }

  const coverPath = getCoverCachePath(coversDirectory, filePath, picture.mime);

  if (!(await fileExists(coverPath))) {
    await mkdir(coversDirectory, { recursive: true });
    await writeFile(coverPath, picture.data);
  }

  return coverPath;
};
