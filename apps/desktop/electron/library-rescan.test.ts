import { describe, expect, it, vi } from "vitest";
import type { Track } from "@arlt-hifi/shared";
import type { LibraryEntry } from "./library-manifest.js";
import { entryNeedsRescan, mergeRescannedTrack, rescanLibraryEntries } from "./library-rescan.js";
import type { ParsedAudio } from "./music-scanner.js";

const createTrack = (overrides: Partial<Track> = {}): Track => ({
  album: "Album",
  albumArtist: "Album Artist",
  artist: "Artist",
  bitDepth: 16,
  coverPath: "C:\\covers\\cover.jpg",
  discNumber: 1,
  durationSeconds: 200,
  filePath: "C:\\library\\Song.flac",
  id: "file://C%3A%5Clibrary%5CSong.flac",
  metadataSource: "tags",
  quality: "lossless",
  sampleRateHz: 44100,
  title: "Song",
  trackNumber: 1,
  ...overrides
});

const createEntry = (track: Track): LibraryEntry => ({
  headSha1: "a".repeat(40),
  importedAt: "2026-10-27T00:00:00.000Z",
  size: 1234,
  track
});

const createParsed = (overrides: Partial<ParsedAudio> = {}): ParsedAudio => ({
  album: "Tag Album",
  albumArtist: "Tag Album Artist",
  artist: "Tag Artist",
  bitDepth: 24,
  codec: "FLAC",
  discNumber: 1,
  durationSeconds: 201,
  picture: null,
  sampleRateHz: 96000,
  title: "Tag Title",
  trackNumber: 3,
  ...overrides
});

describe("entryNeedsRescan", () => {
  it("only flags entries missing legacy fields or audio details", () => {
    expect(entryNeedsRescan(createTrack())).toBe(false);
    expect(entryNeedsRescan(createTrack({ albumArtist: undefined }))).toBe(true);
    expect(entryNeedsRescan(createTrack({ trackNumber: 0 }))).toBe(true);
    expect(entryNeedsRescan(createTrack({ metadataSource: "filename" }))).toBe(true);
  });
});

describe("mergeRescannedTrack", () => {
  it("fills missing album artist, disc and track numbers", () => {
    const merged = mergeRescannedTrack(
      createTrack({ albumArtist: undefined, discNumber: 0, trackNumber: 0 }),
      createTrack({ albumArtist: "Album Artist", discNumber: 1, trackNumber: 7 })
    );

    expect(merged.albumArtist).toBe("Album Artist");
    expect(merged.discNumber).toBe(1);
    expect(merged.trackNumber).toBe(7);
  });

  it("keeps existing values instead of overwriting them with tags", () => {
    const merged = mergeRescannedTrack(
      createTrack({
        album: "My Album",
        albumArtist: "My Album Artist",
        artist: "My Artist",
        bitDepth: 16,
        discNumber: 2,
        durationSeconds: 200,
        quality: "lossless",
        sampleRateHz: 44100,
        title: "My Title",
        trackNumber: 9
      }),
      createTrack({
        album: "Tag Album",
        albumArtist: "Tag Album Artist",
        artist: "Tag Artist",
        bitDepth: 24,
        discNumber: 1,
        durationSeconds: 201,
        quality: "hi-res",
        sampleRateHz: 96000,
        title: "Tag Title",
        trackNumber: 1
      })
    );

    expect(merged.album).toBe("My Album");
    expect(merged.albumArtist).toBe("My Album Artist");
    expect(merged.artist).toBe("My Artist");
    expect(merged.title).toBe("My Title");
    expect(merged.trackNumber).toBe(9);
    expect(merged.discNumber).toBe(2);
    expect(merged.durationSeconds).toBe(200);
    expect(merged.quality).toBe("lossless");
    expect(merged.sampleRateHz).toBe(44100);
    expect(merged.bitDepth).toBe(16);
  });

  it("upgrades filename-based entries when tags become readable", () => {
    const merged = mergeRescannedTrack(
      createTrack({
        album: "Unknown Album",
        albumArtist: undefined,
        artist: "Unknown Artist",
        bitDepth: 0,
        durationSeconds: 0,
        metadataSource: "filename",
        quality: "unknown",
        sampleRateHz: 0,
        title: "Track 01",
        trackNumber: 0
      }),
      createTrack({
        album: "Tag Album",
        albumArtist: "Tag Album Artist",
        artist: "Tag Artist",
        bitDepth: 24,
        durationSeconds: 201,
        metadataSource: "tags",
        quality: "hi-res",
        sampleRateHz: 96000,
        title: "Tag Title",
        trackNumber: 3
      })
    );

    expect(merged.title).toBe("Track 01");
    expect(merged.album).toBe("Tag Album");
    expect(merged.artist).toBe("Tag Artist");
    expect(merged.albumArtist).toBe("Tag Album Artist");
    expect(merged.trackNumber).toBe(3);
    expect(merged.discNumber).toBe(1);
    expect(merged.durationSeconds).toBe(201);
    expect(merged.sampleRateHz).toBe(96000);
    expect(merged.bitDepth).toBe(24);
    expect(merged.quality).toBe("hi-res");
    expect(merged.metadataSource).toBe("tags");
  });

  it("never replaces a renamed album even when the entry still says filename", () => {
    const merged = mergeRescannedTrack(
      createTrack({ album: "My Renamed Album", artist: "Unknown Artist", metadataSource: "filename" }),
      createTrack({ album: "Tag Album", artist: "Tag Artist", metadataSource: "tags" })
    );

    expect(merged.album).toBe("My Renamed Album");
    expect(merged.artist).toBe("Tag Artist");
  });

  it("preserves identity, single-CD id and cover", () => {
    const current = createTrack({ cdId: "solo:x", coverPath: "C:\\covers\\mine.jpg" });
    const merged = mergeRescannedTrack(current, createTrack({ coverPath: null }));

    expect(merged.id).toBe(current.id);
    expect(merged.filePath).toBe(current.filePath);
    expect(merged.cdId).toBe("solo:x");
    expect(merged.coverPath).toBe("C:\\covers\\mine.jpg");
  });
});

describe("rescanLibraryEntries", () => {
  it("updates only incomplete entries and counts failures", async () => {
    const complete = createEntry(
      createTrack({ filePath: "C:\\library\\Complete.flac", id: "complete" })
    );
    const incomplete = createEntry(
      createTrack({
        albumArtist: undefined,
        filePath: "C:\\library\\Incomplete.flac",
        id: "incomplete",
        title: "Old",
        trackNumber: 0
      })
    );
    const missing = createEntry(
      createTrack({
        albumArtist: undefined,
        filePath: "C:\\library\\Missing.flac",
        id: "missing",
        trackNumber: 0
      })
    );
    const parseAudio = vi.fn(async (filePath: string) => {
      if (filePath === missing.track.filePath) {
        return null;
      }

      return createParsed();
    });

    const outcome = await rescanLibraryEntries({
      entries: [complete, incomplete, missing],
      parseAudio
    });

    expect(parseAudio).toHaveBeenCalledTimes(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.updated).toBe(1);
    expect(outcome.entries[0]).toBe(complete);
    expect(outcome.entries[1]?.track.albumArtist).toBe("Tag Album Artist");
    expect(outcome.entries[1]?.track.trackNumber).toBe(3);
    expect(outcome.entries[2]).toBe(missing);
  });

  it("does not write when every entry already has the full metadata", async () => {
    const complete = createEntry(createTrack());
    const parseAudio = vi.fn();

    const outcome = await rescanLibraryEntries({ entries: [complete], parseAudio });

    expect(parseAudio).not.toHaveBeenCalled();
    expect(outcome).toEqual({ entries: [complete], failed: 0, updated: 0 });
  });
});
