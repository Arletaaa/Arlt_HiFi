import type { Track } from "@arlt-hifi/shared";
import type { LibraryEntry } from "./library-manifest.js";
import { parseAudioFile, toTrack, type ParsedAudio } from "./music-scanner.js";

export interface RescanLibraryOptions {
  readonly entries: readonly LibraryEntry[];
  /** 测试或批处理时可替换标签解析器。 */
  readonly parseAudio?: (filePath: string) => Promise<ParsedAudio | null>;
}

export interface RescanLibraryOutcome {
  readonly entries: readonly LibraryEntry[];
  readonly failed: number;
  readonly updated: number;
}

const hasText = (value: string | undefined): value is string => Boolean(value?.trim());

const positive = (value: number | undefined): boolean => Number.isFinite(value) && (value ?? 0) > 0;

/** 旧库缺的新字段，或标签解析失败后回退到文件名的曲目，才值得重读标签。 */
export const entryNeedsRescan = (track: Track): boolean =>
  track.metadataSource === "filename" ||
  !hasText(track.albumArtist) ||
  !positive(track.trackNumber) ||
  !positive(track.discNumber) ||
  !positive(track.durationSeconds) ||
  track.quality === "unknown" ||
  !positive(track.sampleRateHz) ||
  !positive(track.bitDepth);

/**
 * 重扫合并策略：已有值一律视为用户/旧清单的确认值，只补空缺。
 * 因此手动改过的专辑、音轨号、单曲 CD 归属都不会被标签覆盖。
 */
export const mergeRescannedTrack = (current: Track, rescanned: Track): Track => {
  const album = !hasText(current.album) || current.album === "Unknown Album" ? rescanned.album : current.album;
  const albumArtist = hasText(current.albumArtist) ? current.albumArtist : rescanned.albumArtist;
  const artist =
    !hasText(current.artist) || current.artist === "Unknown Artist" ? rescanned.artist : current.artist;
  const discNumber = positive(current.discNumber) ? current.discNumber : rescanned.discNumber;
  const title = !hasText(current.title) || current.title === "Untitled" ? rescanned.title : current.title;
  const trackNumber = positive(current.trackNumber) ? current.trackNumber : rescanned.trackNumber;
  const filledFromTags =
    rescanned.metadataSource === "tags" &&
    (album !== current.album ||
      albumArtist !== current.albumArtist ||
      artist !== current.artist ||
      discNumber !== current.discNumber ||
      title !== current.title ||
      trackNumber !== current.trackNumber);

  return {
    ...current,
    album,
    albumArtist,
    artist,
    bitDepth: positive(current.bitDepth) ? current.bitDepth : rescanned.bitDepth,
    coverPath: current.coverPath,
    discNumber,
    durationSeconds: positive(current.durationSeconds) ? current.durationSeconds : rescanned.durationSeconds,
    metadataSource: filledFromTags ? "tags" : current.metadataSource,
    quality: current.quality === "unknown" ? rescanned.quality : current.quality,
    sampleRateHz: positive(current.sampleRateHz) ? current.sampleRateHz : rescanned.sampleRateHz,
    title,
    trackNumber
  };
};

const sameTrack = (left: Track, right: Track): boolean =>
  left.album === right.album &&
  left.albumArtist === right.albumArtist &&
  left.artist === right.artist &&
  left.bitDepth === right.bitDepth &&
  left.discNumber === right.discNumber &&
  left.durationSeconds === right.durationSeconds &&
  left.metadataSource === right.metadataSource &&
  left.quality === right.quality &&
  left.sampleRateHz === right.sampleRateHz &&
  left.title === right.title &&
  left.trackNumber === right.trackNumber;

export const rescanLibraryEntries = async (options: RescanLibraryOptions): Promise<RescanLibraryOutcome> => {
  const parseAudio = options.parseAudio ?? parseAudioFile;
  const entries: LibraryEntry[] = [];
  let failed = 0;
  let updated = 0;

  for (const entry of options.entries) {
    if (!entryNeedsRescan(entry.track)) {
      entries.push(entry);
      continue;
    }

    const parsed = await parseAudio(entry.track.filePath);

    if (!parsed) {
      failed += 1;
      entries.push(entry);
      continue;
    }

    const rescanned = toTrack(entry.track.filePath, parsed, entry.track.coverPath);
    const track = mergeRescannedTrack(entry.track, rescanned);

    if (!sameTrack(entry.track, track)) {
      updated += 1;
    }

    entries.push({ ...entry, track });
  }

  return { entries, failed, updated };
};
