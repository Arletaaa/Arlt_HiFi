import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Track } from "@arlt-hifi/shared";
import {
  emptyLibraryManifest,
  libraryManifestVersion,
  parseLibraryManifest,
  pruneMissingEntries,
  readLibraryManifest,
  writeLibraryManifest,
  type LibraryEntry
} from "./library-manifest.js";

const tempDirectories: string[] = [];

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "arlt-hifi-manifest-"));
  tempDirectories.push(directory);

  return directory;
};

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

const sampleTrack = (filePath: string): Track => ({
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
});

const sampleEntry = (filePath: string): LibraryEntry => ({
  headSha1: "a".repeat(40),
  importedAt: "2026-10-27T00:00:00.000Z",
  size: 1234,
  track: sampleTrack(filePath)
});

describe("library manifest parsing", () => {
  it("returns an empty manifest for unknown shapes", () => {
    expect(parseLibraryManifest(null)).toEqual(emptyLibraryManifest());
    expect(parseLibraryManifest("nope")).toEqual(emptyLibraryManifest());
    expect(parseLibraryManifest({ entries: [], version: 99 })).toEqual(emptyLibraryManifest());
    expect(parseLibraryManifest({ entries: "nope", version: libraryManifestVersion })).toEqual(emptyLibraryManifest());
  });

  it("keeps valid entries and drops malformed ones", () => {
    const valid = sampleEntry("C:\\library\\Aoi Kaze\\Terrace EP\\Blue Hour.flac");
    const manifest = parseLibraryManifest({
      entries: [
        valid,
        { ...valid, headSha1: 42 },
        { ...valid, size: "1234" },
        { ...valid, track: { ...valid.track, title: null } }
      ],
      version: libraryManifestVersion
    });

    expect(manifest.entries).toEqual([valid]);
  });
});

describe("library manifest persistence", () => {
  it("round-trips through disk", async () => {
    const directory = await createTempDirectory();
    const manifestPath = join(directory, "library.json");
    const entries = [sampleEntry(join(directory, "library", "Blue Hour.flac"))];

    await writeLibraryManifest(manifestPath, { entries, version: libraryManifestVersion });

    await expect(readLibraryManifest(manifestPath)).resolves.toEqual({ entries, version: libraryManifestVersion });
  });

  it("treats a missing or corrupt file as an empty library", async () => {
    const directory = await createTempDirectory();
    const corruptPath = join(directory, "library.json");

    await writeFile(corruptPath, "{ not json");

    await expect(readLibraryManifest(join(directory, "missing.json"))).resolves.toEqual(emptyLibraryManifest());
    await expect(readLibraryManifest(corruptPath)).resolves.toEqual(emptyLibraryManifest());
  });

  it("prunes entries whose audio file was deleted outside the app", async () => {
    const directory = await createTempDirectory();
    const existingPath = join(directory, "existing.flac");
    const missingPath = join(directory, "missing.flac");

    await writeFile(existingPath, "audio");

    const result = await pruneMissingEntries([sampleEntry(existingPath), sampleEntry(missingPath)]);

    expect(result.removed).toBe(1);
    expect(result.entries.map((entry) => entry.track.filePath)).toEqual([existingPath]);
  });
});
