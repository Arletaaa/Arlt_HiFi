import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Track } from "@arlt-hifi/shared";
import { editLibraryTrack, applyLibraryEdits, removeLibraryTrack, renameLibraryTrack, setLibraryTrackCover } from "./library-manage.js";
import type { LibraryEntry } from "./library-manifest.js";

const tempDirectories: string[] = [];

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "arlt-hifi-manage-"));
  tempDirectories.push(directory);

  return directory;
};

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

const createTrack = (filePath: string, overrides: Partial<Track> = {}): Track => ({
  album: "Terrace EP",
  artist: "Aoi Kaze",
  bitDepth: 24,
  coverPath: null,
  durationSeconds: 214,
  filePath,
  id: `file://${filePath}`,
  metadataSource: "tags",
  quality: "hi-res",
  sampleRateHz: 96000,
  title: filePath.split(/[\\/]/u).pop()?.replace(/\.[^.]+$/u, "") ?? "Track",
  ...overrides
});

const createEntry = (track: Track): LibraryEntry => ({
  headSha1: "a".repeat(40),
  importedAt: "2026-10-27T00:00:00.000Z",
  size: 1234,
  track
});

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);

    return true;
  } catch {
    return false;
  }
};

describe("renaming library tracks", () => {
  it("renames the copy on disk and keeps the id stable", async () => {
    const directory = await createTempDirectory();
    const filePath = join(directory, "Old Name.flac");
    const entries = [createEntry(createTrack(filePath))];

    await writeFile(filePath, "audio");

    const outcome = await renameLibraryTrack({ entries, title: "New Name", trackId: `file://${filePath}` });

    if (!outcome) {
      throw new Error("expected a rename result");
    }

    expect(outcome.track.title).toBe("New Name");
    expect(outcome.track.filePath).toBe(join(directory, "New Name.flac"));
    expect(outcome.track.id).toBe(`file://${filePath}`);
    await expect(stat(outcome.track.filePath)).resolves.toBeTruthy();
    await expect(fileExists(filePath)).resolves.toBe(false);
  });

  it("suffixes when the new name is already taken", async () => {
    const directory = await createTempDirectory();
    const firstPath = join(directory, "A.flac");
    const secondPath = join(directory, "B.flac");
    const entries = [createEntry(createTrack(firstPath)), createEntry(createTrack(secondPath))];

    await writeFile(firstPath, "a");
    await writeFile(secondPath, "b");

    const outcome = await renameLibraryTrack({ entries, title: "B", trackId: `file://${firstPath}` });

    expect(outcome?.track.filePath).toBe(join(directory, "B (2).flac"));
    await expect(stat(join(directory, "B.flac"))).resolves.toBeTruthy();
    await expect(stat(join(directory, "B (2).flac"))).resolves.toBeTruthy();
  });

  it("sanitizes illegal characters in the new title", async () => {
    const directory = await createTempDirectory();
    const filePath = join(directory, "Old.flac");
    const entries = [createEntry(createTrack(filePath))];

    await writeFile(filePath, "audio");

    const outcome = await renameLibraryTrack({ entries, title: "AC/DC: Live", trackId: `file://${filePath}` });

    expect(outcome?.track.title).toBe("AC_DC_ Live");
    expect(outcome?.track.filePath).toBe(join(directory, "AC_DC_ Live.flac"));
  });

  it("returns null for unknown tracks", async () => {
    await expect(
      renameLibraryTrack({ entries: [], title: "Nope", trackId: "file://missing" })
    ).resolves.toBeNull();
  });
});

describe("editing CD metadata", () => {
  it("updates album fields without moving the file", async () => {
    const directory = await createTempDirectory();
    const filePath = join(directory, "Track 01.flac");
    const entries = [createEntry(createTrack(filePath))];

    await writeFile(filePath, "audio");

    const outcome = editLibraryTrack({
      album: "Compilation",
      albumArtist: "Various Artists",
      discNumber: 1,
      entries,
      trackId: `file://${filePath}`,
      trackNumber: 3
    });

    if (!outcome) {
      throw new Error("expected an edit result");
    }

    expect(outcome.track.album).toBe("Compilation");
    expect(outcome.track.albumArtist).toBe("Various Artists");
    expect(outcome.track.discNumber).toBe(1);
    expect(outcome.track.trackNumber).toBe(3);
    expect(outcome.track.filePath).toBe(filePath);
    expect(outcome.track.id).toBe(`file://${filePath}`);
    await expect(stat(filePath)).resolves.toBeTruthy();
  });

  it("keeps the old album when blank and clamps cue numbers", () => {
    const filePath = join("D:\\Music", "Track.flac");
    const entries = [createEntry(createTrack(filePath))];

    const outcome = editLibraryTrack({
      album: "   ",
      albumArtist: "  ",
      discNumber: -2,
      entries,
      trackId: `file://${filePath}`,
      trackNumber: 4.6
    });

    expect(outcome?.track.album).toBe("Terrace EP");
    expect(outcome?.track.albumArtist).toBeUndefined();
    expect(outcome?.track.discNumber).toBe(0);
    expect(outcome?.track.trackNumber).toBe(5);
  });

  it("returns null for an unknown track", () => {
    expect(
      editLibraryTrack({
        album: "Album",
        albumArtist: "",
        discNumber: 0,
        entries: [],
        trackId: "missing",
        trackNumber: 0
      })
    ).toBeNull();
  });
});

describe("setting track covers", () => {
  it("copies the image into the covers directory and replaces the previous override", async () => {
    const root = await createTempDirectory();
    const coversDirectory = join(root, "covers");
    const libraryFile = join(root, "library", "Song.flac");
    const tagCover = join(root, "tag-cover.jpg");
    const entries = [createEntry(createTrack(libraryFile, { coverPath: tagCover }))];

    await mkdir(join(root, "library"), { recursive: true });
    await writeFile(libraryFile, "audio");
    await writeFile(tagCover, "tag");
    await writeFile(join(root, "first.png"), "first-image");

    const first = await setLibraryTrackCover({
      coversDirectory,
      entries,
      sourcePath: join(root, "first.png"),
      trackId: `file://${libraryFile}`
    });

    if (!first?.track.coverPath) {
      throw new Error("expected a cover path");
    }

    expect(first.track.coverPath.startsWith(join(coversDirectory, "override-"))).toBe(true);
    expect(first.track.coverPath.endsWith(".png")).toBe(true);
    await expect(stat(first.track.coverPath)).resolves.toBeTruthy();
    // 标签提取的封面不属于覆盖表，不能被删掉。
    await expect(stat(tagCover)).resolves.toBeTruthy();

    await writeFile(join(root, "second.webp"), "second-image");
    const second = await setLibraryTrackCover({
      coversDirectory,
      entries: first.entries,
      sourcePath: join(root, "second.webp"),
      trackId: `file://${libraryFile}`
    });

    if (!second?.track.coverPath) {
      throw new Error("expected a second cover path");
    }

    expect(second.track.coverPath.endsWith(".webp")).toBe(true);
    await expect(fileExists(first.track.coverPath)).resolves.toBe(false);
    await expect(readdir(coversDirectory)).resolves.toHaveLength(1);
  });

  it("rejects unsupported image extensions", async () => {
    const root = await createTempDirectory();
    const libraryFile = join(root, "Song.flac");
    const entries = [createEntry(createTrack(libraryFile))];

    await expect(
      setLibraryTrackCover({
        coversDirectory: join(root, "covers"),
        entries,
        sourcePath: join(root, "notes.txt"),
        trackId: `file://${libraryFile}`
      })
    ).rejects.toThrow("只支持 png / jpg / jpeg / webp 图片。");
  });
});

describe("applying library edits in one pass", () => {
  it("writes album, album artist and track order for several tracks without touching files", () => {
    const first = createTrack("C:\\music\\A.flac");
    const second = createTrack("C:\\music\\B.flac");
    const entries = [createEntry(first), createEntry(second)];

    const next = applyLibraryEdits({
      edits: [
        {
          album: "Merged",
          albumArtist: "Various Artists",
          cdId: null,
          discNumber: 0,
          trackId: first.id,
          trackNumber: 2
        },
        {
          album: "Merged",
          albumArtist: "Various Artists",
          cdId: null,
          discNumber: 0,
          trackId: second.id,
          trackNumber: 1
        }
      ],
      entries
    });

    expect(next[0]?.track.album).toBe("Merged");
    expect(next[0]?.track.albumArtist).toBe("Various Artists");
    expect(next[0]?.track.trackNumber).toBe(2);
    expect(next[1]?.track.trackNumber).toBe(1);
    expect(next[0]?.track.filePath).toBe(first.filePath);
    expect(next[1]?.track.filePath).toBe(second.filePath);
  });

  it("sets and clears the explicit single-CD id", () => {
    const track = createTrack("C:\\music\\Solo.flac");
    const solo = applyLibraryEdits({
      edits: [
        {
          album: "Solo",
          albumArtist: track.artist,
          cdId: "solo:x",
          discNumber: 0,
          trackId: track.id,
          trackNumber: 1
        }
      ],
      entries: [createEntry(track)]
    });

    expect(solo[0]?.track.cdId).toBe("solo:x");

    const merged = applyLibraryEdits({
      edits: [
        {
          album: "Album",
          albumArtist: track.artist,
          cdId: null,
          discNumber: 0,
          trackId: track.id,
          trackNumber: 1
        }
      ],
      entries: solo
    });

    expect(merged[0]?.track.cdId).toBeUndefined();
  });

  it("keeps two single CDs apart when their long track ids share a prefix", () => {
    const directory = "C:\\Users\\someone\\AppData\\Roaming\\Arlt-HiFi\\library\\Unknown Artist\\Unknown Album\\";
    const first = createTrack(`${directory}first.flac`);
    const second = createTrack(`${directory}second.flac`);
    const entries = [createEntry(first), createEntry(second)];

    const next = applyLibraryEdits({
      edits: [
        {
          album: first.title,
          albumArtist: first.artist,
          cdId: `solo:${first.id}`,
          discNumber: 0,
          trackId: first.id,
          trackNumber: 1
        },
        {
          album: second.title,
          albumArtist: second.artist,
          cdId: `solo:${second.id}`,
          discNumber: 0,
          trackId: second.id,
          trackNumber: 1
        }
      ],
      entries
    });

    expect(next[0]?.track.cdId).toBe(`solo:${first.id}`);
    expect(next[1]?.track.cdId).toBe(`solo:${second.id}`);
    expect(next[0]?.track.cdId).not.toBe(next[1]?.track.cdId);
  });

  it("rejects unknown ids and leaves the entries untouched", () => {
    const track = createTrack("C:\\music\\Keep.flac");
    const entries = [createEntry(track)];

    expect(() =>
      applyLibraryEdits({
        edits: [
          {
            album: "Album",
            albumArtist: "",
            cdId: null,
            discNumber: 0,
            trackId: "file://missing",
            trackNumber: 1
          }
        ],
        entries
      })
    ).toThrow("找不到该曲目。");

    expect(entries[0]?.track.album).toBe("Terrace EP");
  });
});

describe("removing library tracks", () => {
  it("deletes the copy and the custom cover, and drops the entry", async () => {
    const root = await createTempDirectory();
    const coversDirectory = join(root, "covers");
    const libraryFile = join(root, "library", "Song.flac");
    const coverPath = join(coversDirectory, "override-abc.jpg");
    const entries = [createEntry(createTrack(libraryFile, { coverPath })), createEntry(createTrack(join(root, "Keep.flac")))];

    await mkdir(join(root, "library"), { recursive: true });
    await mkdir(coversDirectory, { recursive: true });
    await writeFile(libraryFile, "audio");
    await writeFile(coverPath, "cover");
    await writeFile(join(root, "Keep.flac"), "audio");

    const outcome = await removeLibraryTrack({ coversDirectory, entries, trackId: `file://${libraryFile}` });

    expect(outcome?.entries).toHaveLength(1);
    expect(outcome?.entries[0]?.track.filePath).toBe(join(root, "Keep.flac"));
    await expect(fileExists(libraryFile)).resolves.toBe(false);
    await expect(fileExists(coverPath)).resolves.toBe(false);
  });

  it("hands the copy to the injected trash function instead of deleting it", async () => {
    const root = await createTempDirectory();
    const coversDirectory = join(root, "covers");
    const libraryFile = join(root, "library", "Song.flac");
    const entries = [createEntry(createTrack(libraryFile))];
    const trashed: string[] = [];

    await mkdir(join(root, "library"), { recursive: true });
    await writeFile(libraryFile, "audio");

    const outcome = await removeLibraryTrack({
      coversDirectory,
      entries,
      trackId: `file://${libraryFile}`,
      trashFile: async (filePath) => {
        trashed.push(filePath);
      }
    });

    expect(trashed).toEqual([libraryFile]);
    expect(outcome?.entries).toHaveLength(0);
    await expect(fileExists(libraryFile)).resolves.toBe(true);
  });

  it("returns null for unknown tracks", async () => {
    await expect(
      removeLibraryTrack({ coversDirectory: "C:\\covers", entries: [], trackId: "file://missing" })
    ).resolves.toBeNull();
  });
});
