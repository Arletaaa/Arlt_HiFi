import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
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

/** 只保留当前托管目录内的条目：安装时换了曲库目录后，旧目录的记录不再显示。 */
export const filterEntriesByLibraryRoot = (
  entries: readonly LibraryEntry[],
  libraryRoot: string
): readonly LibraryEntry[] => {
  const root = resolve(libraryRoot);

  return entries.filter((entry) => {
    const target = resolve(entry.track.filePath);
    const relativePath = relative(root, target);

    return relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath);
  });
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

/**
 * 只清理当前根目录下已丢失的文件；其它曲库目录的条目原样保留。
 * 换回旧根目录时会再清自己那一份，不需要在后台读别的目录。
 */
export const pruneMissingEntriesUnderRoot = async (
  entries: readonly LibraryEntry[],
  libraryRoot: string
): Promise<{ readonly entries: readonly LibraryEntry[]; readonly removed: number }> => {
  const visible = filterEntriesByLibraryRoot(entries, libraryRoot);
  const pruned = await pruneMissingEntries(visible);

  if (pruned.removed === 0) {
    return { entries, removed: 0 };
  }

  const keptIds = new Set(pruned.entries.map((entry) => entry.track.id));
  const visibleIds = new Set(visible.map((entry) => entry.track.id));

  return {
    entries: entries.filter((entry) => !visibleIds.has(entry.track.id) || keptIds.has(entry.track.id)),
    removed: pruned.removed
  };
};

/** 用重扫结果替换同 id 条目；其它曲库根目录的条目原样保留。 */
export const mergeEntryUpdates = (
  entries: readonly LibraryEntry[],
  updated: readonly LibraryEntry[]
): readonly LibraryEntry[] => {
  const updatedById = new Map(updated.map((entry) => [entry.track.id, entry]));

  return entries.map((entry) => updatedById.get(entry.track.id) ?? entry);
};
