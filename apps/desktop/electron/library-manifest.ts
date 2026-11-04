import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Track } from "@arlt-hifi/shared";

export const libraryManifestVersion = 1;

/** 一首已托管曲目：曲目信息 + 去重指纹 + 导入时间。 */
export interface LibraryEntry {
  readonly headSha1: string;
  readonly importedAt: string;
  readonly size: number;
  readonly track: Track;
}

/** `userData/library.json`：托管曲库的唯一真源。 */
export interface LibraryManifest {
  readonly entries: readonly LibraryEntry[];
  readonly version: number;
}

export const emptyLibraryManifest = (): LibraryManifest => ({ entries: [], version: libraryManifestVersion });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isTrackRecord = (value: unknown): value is Track => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.title) &&
    isString(value.artist) &&
    isString(value.album) &&
    isFiniteNumber(value.durationSeconds) &&
    isString(value.quality) &&
    isFiniteNumber(value.sampleRateHz) &&
    isFiniteNumber(value.bitDepth) &&
    isString(value.filePath) &&
    (value.coverPath === null || isString(value.coverPath)) &&
    (value.metadataSource === "tags" || value.metadataSource === "filename")
  );
};

const isLibraryEntry = (value: unknown): value is LibraryEntry => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.headSha1) &&
    isString(value.importedAt) &&
    isFiniteNumber(value.size) &&
    isTrackRecord(value.track)
  );
};

/** 容忍手工损坏的 manifest：读不懂就当空库，不让启动失败。 */
export const parseLibraryManifest = (raw: unknown): LibraryManifest => {
  if (!isRecord(raw) || raw.version !== libraryManifestVersion || !Array.isArray(raw.entries)) {
    return emptyLibraryManifest();
  }

  return { entries: raw.entries.filter(isLibraryEntry), version: libraryManifestVersion };
};

export const readLibraryManifest = async (filePath: string): Promise<LibraryManifest> => {
  try {
    return parseLibraryManifest(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return emptyLibraryManifest();
  }
};

export const writeLibraryManifest = async (filePath: string, manifest: LibraryManifest): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);

    return true;
  } catch {
    return false;
  }
};

/** 文件被手工删掉后，把对应条目从库里剔除（返回剔除后的条目与剔除数量）。 */
export const pruneMissingEntries = async (
  entries: readonly LibraryEntry[]
): Promise<{ readonly entries: readonly LibraryEntry[]; readonly removed: number }> => {
  const existing: LibraryEntry[] = [];

  for (const entry of entries) {
    if (await fileExists(entry.track.filePath)) {
      existing.push(entry);
    }
  }

  return { entries: existing, removed: entries.length - existing.length };
};
