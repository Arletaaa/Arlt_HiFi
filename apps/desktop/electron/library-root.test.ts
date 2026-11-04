import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Track } from "@arlt-hifi/shared";
import type { LibraryEntry } from "./library-manifest.js";
import {
  directoryContainsAudioFiles,
  inspectLibraryDirectory,
  isPathInside,
  normalizeLibraryRoot,
  resolveLibraryRoot
} from "./library-root.js";

const temporaryDirectories: string[] = [];

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "arlt-hifi-root-"));
  temporaryDirectories.push(directory);

  return directory;
};

const createEntry = (filePath: string): LibraryEntry => {
  const track: Track = {
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
    title: "Blue Hour"
  };

  return { headSha1: "a".repeat(40), importedAt: "2026-11-04T00:00:00.000Z", size: 1234, track };
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("normalizeLibraryRoot", () => {
  it("accepts absolute Windows and POSIX paths", () => {
    expect(normalizeLibraryRoot("D:\\Arlt-HiFi Library")).toBe("D:\\Arlt-HiFi Library");
    expect(normalizeLibraryRoot("  E:\\Music\\Library  ")).toBe("E:\\Music\\Library");
    expect(normalizeLibraryRoot("/home/user/Music")).toBe("/home/user/Music");
    expect(normalizeLibraryRoot("\\\\nas\\share\\library")).toBe("\\\\nas\\share\\library");
  });

  it("rejects empty, relative, oversized and non-string values", () => {
    expect(normalizeLibraryRoot("")).toBeNull();
    expect(normalizeLibraryRoot("   ")).toBeNull();
    expect(normalizeLibraryRoot("relative\\library")).toBeNull();
    expect(normalizeLibraryRoot(`C:\\${"a".repeat(260)}`)).toBeNull();
    expect(normalizeLibraryRoot(null)).toBeNull();
    expect(normalizeLibraryRoot(42)).toBeNull();
  });
});

describe("resolveLibraryRoot", () => {
  const userDataDirectory = "C:\\Users\\me\\AppData\\Roaming\\Arlt-HiFi";
  const defaultRoot = join(userDataDirectory, "library");

  it("prefers the in-app setting over install.ini", () => {
    expect(
      resolveLibraryRoot({
        installedRoot: "D:\\Arlt-HiFi Library",
        settingsRoot: "E:\\Music\\Library",
        userDataDirectory
      })
    ).toEqual({ directory: "E:\\Music\\Library", source: "settings" });
  });

  it("falls back to install.ini when settings has no root", () => {
    expect(
      resolveLibraryRoot({ installedRoot: "D:\\Arlt-HiFi Library", settingsRoot: null, userDataDirectory })
    ).toEqual({ directory: "D:\\Arlt-HiFi Library", source: "installer" });
  });

  it("uses userData/library when neither is configured (dev mode)", () => {
    expect(resolveLibraryRoot({ installedRoot: null, settingsRoot: null, userDataDirectory })).toEqual({
      directory: defaultRoot,
      source: "default"
    });
  });

  it("ignores invalid settings values instead of dropping to the default", () => {
    expect(
      resolveLibraryRoot({ installedRoot: "D:\\Arlt-HiFi Library", settingsRoot: "relative", userDataDirectory })
    ).toEqual({ directory: "D:\\Arlt-HiFi Library", source: "installer" });
  });
});

describe("isPathInside", () => {
  it("matches files under the root but not siblings or the root itself", () => {
    const root = join(tmpdir(), "Arlt-HiFi Library");

    expect(isPathInside(root, join(root, "Aoi Kaze", "Terrace EP", "Blue Hour.flac"))).toBe(true);
    expect(isPathInside(root, join(tmpdir(), "Arlt-HiFi Library 2", "Blue Hour.flac"))).toBe(false);
    expect(isPathInside(root, root)).toBe(false);
  });
});

describe("directoryContainsAudioFiles", () => {
  it("finds audio files in nested directories", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "Aoi Kaze", "Terrace EP"), { recursive: true });
    await writeFile(join(root, "Aoi Kaze", "Terrace EP", "Blue Hour.flac"), "audio");
    await writeFile(join(root, "notes.txt"), "text");

    await expect(directoryContainsAudioFiles(root)).resolves.toBe(true);
  });

  it("returns false for missing or non-audio directories", async () => {
    const root = await createTempDirectory();
    await writeFile(join(root, "cover.jpg"), "image");

    await expect(directoryContainsAudioFiles(root)).resolves.toBe(false);
    await expect(directoryContainsAudioFiles(join(root, "missing"))).resolves.toBe(false);
  });
});

describe("inspectLibraryDirectory", () => {
  it("accepts a directory that already has manifest entries", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "Aoi Kaze", "Terrace EP"), { recursive: true });

    await expect(
      inspectLibraryDirectory({
        directory: root,
        entries: [createEntry(join(root, "Aoi Kaze", "Terrace EP", "Blue Hour.flac"))]
      })
    ).resolves.toBe("registered");
  });

  it("rejects a plain music folder that was never imported into the app", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "Aoi Kaze", "Terrace EP"), { recursive: true });
    await writeFile(join(root, "Aoi Kaze", "Terrace EP", "Blue Hour.flac"), "audio");

    await expect(inspectLibraryDirectory({ directory: root, entries: [] })).resolves.toBe("audio");
    await expect(
      inspectLibraryDirectory({ directory: root, entries: [createEntry(join(tmpdir(), "other", "Track.flac"))] })
    ).resolves.toBe("audio");
  });

  it("accepts empty and non-audio directories as a new library", async () => {
    const empty = await createTempDirectory();
    const withNotes = await createTempDirectory();
    await writeFile(join(withNotes, "notes.txt"), "text");

    await expect(inspectLibraryDirectory({ directory: empty, entries: [] })).resolves.toBe("new");
    await expect(inspectLibraryDirectory({ directory: withNotes, entries: [] })).resolves.toBe("new");
    await expect(
      inspectLibraryDirectory({ directory: join(empty, "missing"), entries: [] })
    ).resolves.toBe("new");
  });
});
