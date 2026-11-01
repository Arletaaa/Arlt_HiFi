import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Track } from "@arlhifi/shared";
import { editLibraryTrack, removeLibraryTrack, renameLibraryTrack, setLibraryTrackCover } from "./library-manage.js";
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

  it("returns null for unknown tracks", async () => {
    await expect(
      removeLibraryTrack({ coversDirectory: "C:\\covers", entries: [], trackId: "file://missing" })
    ).resolves.toBeNull();
  });
});
