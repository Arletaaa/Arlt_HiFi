import { describe, expect, it } from "vitest";
import type { Track } from "@arlt-hifi/shared";
import { filterTracks } from "./library-filter";

const createTrack = (id: string, title: string, artist: string, album: string, durationSeconds: number, ext: string): Track => ({
  id,
  title,
  artist,
  album,
  durationSeconds,
  quality: "unknown",
  sampleRateHz: 0,
  bitDepth: 0,
  filePath: `D:\\Music\\${title}.${ext}`,
  coverPath: null,
  metadataSource: "filename"
});

const tracks: readonly Track[] = [
  createTrack("1", "Neon Tide", "Lumen", "Neon Tide", 232, "mp3"),
  createTrack("2", "夜想曲", "灯火", "静かな星", 286, "flac"),
  createTrack("3", "Blue Hour", "Aoi Kaze", "Terrace EP", 214, "wav"),
  createTrack("4", "雨音", "雨音", "雨の日", 268, "flac")
];

describe("library filtering", () => {
  it("returns everything for an empty query", () => {
    expect(filterTracks(tracks, "")).toHaveLength(4);
    expect(filterTracks(tracks, "   ")).toHaveLength(4);
  });

  it("matches title, artist and album case-insensitively", () => {
    expect(filterTracks(tracks, "neon").map((track) => track.id)).toEqual(["1"]);
    expect(filterTracks(tracks, "aoi").map((track) => track.id)).toEqual(["3"]);
    expect(filterTracks(tracks, "雨の日").map((track) => track.id)).toEqual(["4"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterTracks(tracks, "zzz")).toHaveLength(0);
  });
});
