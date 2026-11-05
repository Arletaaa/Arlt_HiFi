import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ParsedAudio } from "./music-scanner.js";
import { findDuplicateEntry, getFileFingerprint, getImportRelativeSegments, importAudioFiles, resolveAvailablePath, sanitizePathSegment } from "./library-import.js";

const tempDirectories: string[] = [];

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "arlt-hifi-import-"));
  tempDirectories.push(directory);

  return directory;
};

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

/** 生成一段合法的 PCM WAV（静音），让 music-metadata 能解析出真实时长。 */
const writeSilentWav = async (filePath: string, durationSeconds: number): Promise<void> => {
  const sampleRate = 44100;
  const bitsPerSample = 16;
  const channels = 1;
  const dataSize = Math.round(durationSeconds * sampleRate) * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  await writeFile(filePath, buffer);
};

const parsedAudio = (overrides: Partial<ParsedAudio> = {}): ParsedAudio => ({
  album: "Terrace EP",
  albumArtist: "Aoi Kaze",
  artist: "Aoi Kaze",
  bitDepth: 24,
  codec: "FLAC",
  discNumber: 1,
  durationSeconds: 214.4,
  picture: null,
  sampleRateHz: 96000,
  title: "Blue Hour",
  trackNumber: 3,
  ...overrides
});

describe("path sanitizing", () => {
  it("replaces characters Windows rejects and trims trailing dots", () => {
    expect(sanitizePathSegment('AC/DC: Live?*"<>|', "Unknown")).toBe("AC_DC_ Live______");
    expect(sanitizePathSegment("... ", "Unknown")).toBe("Unknown");
    expect(sanitizePathSegment("   ", "Unknown")).toBe("Unknown");
  });

  it("caps a segment so long tag values cannot blow up the path", () => {
    expect(sanitizePathSegment("a".repeat(200), "Unknown")).toHaveLength(80);
  });
});

describe("library relative paths", () => {
  it("uses artist / album / title from tags", () => {
    expect(getImportRelativeSegments("D:\\Music\\Track.flac", parsedAudio())).toEqual([
      "Aoi Kaze",
      "Terrace EP",
      "Blue Hour.flac"
    ]);
  });

  it("falls back to filename and Unknown placeholders without tags", () => {
    expect(getImportRelativeSegments("D:\\Music\\Blue Night.FLAC", null)).toEqual([
      "Unknown Artist",
      "Unknown Album",
      "Blue Night.flac"
    ]);
  });
});

describe("file fingerprints", () => {
  it("records the file size and the SHA-1 of the first 256KB only", async () => {
    const directory = await createTempDirectory();
    const longFile = join(directory, "long.bin");
    const shortFile = join(directory, "short.bin");
    const sharedHead = Buffer.alloc(300 * 1024, 7);

    await writeFile(longFile, Buffer.concat([sharedHead, Buffer.from("tail-bb")]));
    await writeFile(shortFile, Buffer.concat([sharedHead, Buffer.from("tail-a")]));

    const longFingerprint = await getFileFingerprint(longFile);
    const shortFingerprint = await getFileFingerprint(shortFile);
    const expectedHead = createHash("sha1").update(sharedHead.subarray(0, 256 * 1024)).digest("hex");

    expect(longFingerprint.size).toBe((await stat(longFile)).size);
    expect(longFingerprint.headSha1).toBe(expectedHead);
    // 前 256KB 相同、尾部不同：证明只读文件头。
    expect(longFingerprint.headSha1).toBe(shortFingerprint.headSha1);
    expect(longFingerprint.size).not.toBe(shortFingerprint.size);
  });
});

describe("target path resolution", () => {
  it("does not overwrite an existing file", async () => {
    const directory = await createTempDirectory();
    const target = join(directory, "Song.flac");

    await writeFile(target, "first");
    expect(await resolveAvailablePath(target, new Set())).toBe(join(directory, "Song (2).flac"));

    await writeFile(join(directory, "Song (2).flac"), "second");
    expect(await resolveAvailablePath(target, new Set())).toBe(join(directory, "Song (3).flac"));
  });

  it("respects paths already claimed in the same batch", async () => {
    const directory = await createTempDirectory();
    const target = join(directory, "Song.flac");

    expect(await resolveAvailablePath(target, new Set([target]))).toBe(join(directory, "Song (2).flac"));
  });
});

describe("duplicate detection", () => {
  it("requires size, duration and head hash to match", () => {
    const track = {
      album: "Album",
      artist: "Artist",
      bitDepth: 16,
      coverPath: null,
      durationSeconds: 12,
      filePath: "C:\\library\\Song.flac",
      id: "file://x",
      metadataSource: "tags" as const,
      quality: "lossless" as const,
      sampleRateHz: 44100,
      title: "Song"
    };
    const entries = [{ headSha1: "abc", importedAt: "2026-10-27T00:00:00.000Z", size: 100, track }];

    expect(findDuplicateEntry(entries, { durationSeconds: 12, headSha1: "abc", size: 100 })).toBe(entries[0]);
    expect(findDuplicateEntry(entries, { durationSeconds: 12, headSha1: "abd", size: 100 })).toBeUndefined();
    expect(findDuplicateEntry(entries, { durationSeconds: 11, headSha1: "abc", size: 100 })).toBeUndefined();
    expect(findDuplicateEntry(entries, { durationSeconds: 12, headSha1: "abc", size: 101 })).toBeUndefined();
  });
});

describe("importing audio files", () => {
  it("copies into artist/album folders, reports progress and records the fingerprint", async () => {
    const root = await createTempDirectory();
    const source = join(root, "source");
    const library = join(root, "library");
    const covers = join(root, "covers");
    const sourceFile = join(source, "Nocturne.wav");

    await mkdir(source, { recursive: true });
    await writeSilentWav(sourceFile, 1);

    const progress: string[] = [];
    const outcome = await importAudioFiles({
      coversDirectory: covers,
      entries: [],
      filePaths: [sourceFile],
      importedAt: () => "2026-10-27T00:00:00.000Z",
      libraryDirectory: library,
      onProgress: (completed, total) => {
        progress.push(`${completed}/${total}`);
      }
    });

    expect(outcome.skipped).toEqual([]);
    expect(progress).toEqual(["1/1"]);
    expect(outcome.imported).toHaveLength(1);

    const track = outcome.imported[0];
    const entry = outcome.entries[0];

    if (!track || !entry) {
      throw new Error("expected one imported track");
    }

    expect(track.filePath).toBe(join(library, "Unknown Artist", "Unknown Album", "Nocturne.wav"));
    expect(track.title).toBe("Nocturne");
    expect(track.durationSeconds).toBe(1);
    expect(track.quality).toBe("lossless");
    await expect(stat(track.filePath)).resolves.toBeTruthy();
    expect(entry.size).toBeGreaterThan(0);
    expect(entry.headSha1).toHaveLength(40);
    expect(entry.importedAt).toBe("2026-10-27T00:00:00.000Z");
  });

  it("stops between files when the import is cancelled", async () => {
    const root = await createTempDirectory();
    const source = join(root, "source");
    const library = join(root, "library");
    const firstFile = join(source, "First.wav");
    const secondFile = join(source, "Second.wav");

    await mkdir(source, { recursive: true });
    await writeSilentWav(firstFile, 1);
    await writeSilentWav(secondFile, 2);

    const controller = new AbortController();
    const progress: string[] = [];
    const outcome = await importAudioFiles({
      coversDirectory: null,
      entries: [],
      filePaths: [firstFile, secondFile],
      libraryDirectory: library,
      onProgress: (completed, total) => {
        progress.push(`${completed}/${total}`);

        if (completed === 1) {
          controller.abort();
        }
      },
      signal: controller.signal
    });

    expect(outcome.imported).toHaveLength(1);
    expect(outcome.remainingFilePaths).toEqual([secondFile]);
    expect(progress).toEqual(["1/2"]);
    await expect(stat(join(library, "Unknown Artist", "Unknown Album", "Second.wav"))).rejects.toBeTruthy();

    // 继续导入未处理文件：已导入的首个文件不会被重复复制。
    const resumed = await importAudioFiles({
      coversDirectory: null,
      entries: outcome.entries,
      filePaths: outcome.remainingFilePaths,
      libraryDirectory: library
    });

    expect(resumed.imported).toHaveLength(1);
    expect(resumed.remainingFilePaths).toEqual([]);
  });

  it("imports nothing when cancelled before the first file", async () => {
    const root = await createTempDirectory();
    const source = join(root, "source");
    const library = join(root, "library");
    const sourceFile = join(source, "First.wav");
    const controller = new AbortController();

    await mkdir(source, { recursive: true });
    await writeSilentWav(sourceFile, 1);
    controller.abort();

    const outcome = await importAudioFiles({
      coversDirectory: null,
      entries: [],
      filePaths: [sourceFile],
      libraryDirectory: library,
      signal: controller.signal
    });

    expect(outcome.entries).toEqual([]);
    expect(outcome.imported).toEqual([]);
    expect(outcome.remainingFilePaths).toEqual([sourceFile]);
    await expect(stat(join(library, "Unknown Artist", "Unknown Album", "First.wav"))).rejects.toBeTruthy();
  });

  it("skips duplicates even when the file name changed", async () => {
    const root = await createTempDirectory();
    const source = join(root, "source");
    const library = join(root, "library");
    const firstFile = join(source, "Nocturne.wav");
    const copyFile = join(source, "Nocturne copy.wav");

    await mkdir(source, { recursive: true });
    await writeSilentWav(firstFile, 1);
    await writeFile(copyFile, await readFile(firstFile));

    const first = await importAudioFiles({
      coversDirectory: null,
      entries: [],
      filePaths: [firstFile],
      libraryDirectory: library
    });
    const second = await importAudioFiles({
      coversDirectory: null,
      entries: first.entries,
      filePaths: [copyFile],
      libraryDirectory: library
    });

    expect(first.imported).toHaveLength(1);
    expect(second.imported).toEqual([]);
    expect(second.skipped).toEqual([{ filePath: copyFile, reason: "duplicate" }]);
  });

  it("does not treat entries from another library root as duplicates", async () => {
    const root = await createTempDirectory();
    const source = join(root, "source");
    const firstLibrary = join(root, "library-a");
    const secondLibrary = join(root, "library-b");
    const sourceFile = join(source, "Nocturne.wav");

    await mkdir(source, { recursive: true });
    await writeSilentWav(sourceFile, 1);

    const first = await importAudioFiles({
      coversDirectory: null,
      entries: [],
      filePaths: [sourceFile],
      libraryDirectory: firstLibrary
    });
    const second = await importAudioFiles({
      coversDirectory: null,
      entries: first.entries,
      filePaths: [sourceFile],
      libraryDirectory: secondLibrary
    });

    expect(first.imported).toHaveLength(1);
    expect(second.skipped).toEqual([]);
    expect(second.imported.map((track) => track.filePath)).toEqual([
      join(secondLibrary, "Unknown Artist", "Unknown Album", "Nocturne.wav")
    ]);
  });

  it("can copy a file that already lives inside another library root", async () => {
    const root = await createTempDirectory();
    const source = join(root, "source");
    const firstLibrary = join(root, "library-a");
    const secondLibrary = join(root, "library-b");
    const sourceFile = join(source, "Nocturne.wav");

    await mkdir(source, { recursive: true });
    await writeSilentWav(sourceFile, 1);

    const first = await importAudioFiles({
      coversDirectory: null,
      entries: [],
      filePaths: [sourceFile],
      libraryDirectory: firstLibrary
    });
    const sourceInFirstLibrary = first.imported[0]?.filePath;

    if (!sourceInFirstLibrary) {
      throw new Error("expected the first import to copy the file");
    }

    const second = await importAudioFiles({
      coversDirectory: null,
      entries: first.entries,
      filePaths: [sourceInFirstLibrary],
      libraryDirectory: secondLibrary
    });

    expect(second.skipped).toEqual([]);
    expect(second.imported).toHaveLength(1);
    expect(second.imported[0]?.filePath).toBe(
      join(secondLibrary, "Unknown Artist", "Unknown Album", "Nocturne.wav")
    );
  });

  it("keeps same-named tracks by suffixing instead of overwriting", async () => {
    const root = await createTempDirectory();
    const firstSource = join(root, "a");
    const secondSource = join(root, "b");
    const library = join(root, "library");

    await mkdir(firstSource, { recursive: true });
    await mkdir(secondSource, { recursive: true });
    await writeSilentWav(join(firstSource, "Nocturne.wav"), 1);
    await writeSilentWav(join(secondSource, "Nocturne.wav"), 2);

    const outcome = await importAudioFiles({
      coversDirectory: null,
      entries: [],
      filePaths: [join(firstSource, "Nocturne.wav"), join(secondSource, "Nocturne.wav")],
      libraryDirectory: library
    });

    expect(outcome.imported.map((track) => track.filePath)).toEqual([
      join(library, "Unknown Artist", "Unknown Album", "Nocturne.wav"),
      join(library, "Unknown Artist", "Unknown Album", "Nocturne (2).wav")
    ]);
  });

  it("reports unsupported and unreadable files without aborting the batch", async () => {
    const root = await createTempDirectory();
    const source = join(root, "source");
    const library = join(root, "library");
    const textFile = join(source, "notes.txt");
    const missingFile = join(source, "missing.wav");
    const audioFile = join(source, "Nocturne.wav");

    await mkdir(source, { recursive: true });
    await writeFile(textFile, "not audio");
    await writeSilentWav(audioFile, 1);

    const outcome = await importAudioFiles({
      coversDirectory: null,
      entries: [],
      filePaths: [textFile, missingFile, audioFile],
      libraryDirectory: library
    });

    expect(outcome.imported).toHaveLength(1);
    expect(outcome.skipped).toEqual([
      { filePath: textFile, reason: "unsupported" },
      { filePath: missingFile, reason: "failed" }
    ]);
  });
});
