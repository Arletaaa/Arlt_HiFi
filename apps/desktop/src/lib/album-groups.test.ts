import { describe, expect, it } from "vitest";
import type { Track } from "@arlt-hifi/shared";
import { groupTracksForGallery } from "./album-groups";

const createTrack = (
  id: string,
  title: string,
  artist: string,
  album: string,
  coverPath: string | null = null
): Track => ({
  id,
  title,
  artist,
  album,
  durationSeconds: 100,
  quality: "lossless",
  sampleRateHz: 44100,
  bitDepth: 16,
  filePath: `D:\\Music\\${title}.flac`,
  coverPath,
  metadataSource: "tags"
});

describe("gallery grouping", () => {
  it("bundles tracks of the same album and artist into one slot", () => {
    const groups = groupTracksForGallery([
      createTrack("1", "A1", "Kaze", "Terrace EP"),
      createTrack("2", "A2", "Kaze", "Terrace EP"),
      createTrack("3", "B1", "Kaze", "Night Bus")
    ]);

    expect(groups).toHaveLength(2);
    const terrace = groups.find((group) => group.title === "Terrace EP");

    expect(terrace?.trackIds).toEqual(["1", "2"]);
    expect(terrace?.artist).toBe("Kaze");
  });

  it("orders tracks by track number and splits multi-disc albums", () => {
    const groups = groupTracksForGallery([
      { ...createTrack("1", "A1", "Kaze", "Terrace EP"), discNumber: 1, trackNumber: 2 },
      { ...createTrack("2", "A2", "Kaze", "Terrace EP"), discNumber: 1, trackNumber: 1 },
      { ...createTrack("3", "B1", "Kaze", "Terrace EP"), discNumber: 2, trackNumber: 1 }
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.trackIds).toEqual(["2", "1"]);
    expect(groups[1]?.trackIds).toEqual(["3"]);
  });

  it("groups compilations by album artist", () => {
    const groups = groupTracksForGallery([
      { ...createTrack("1", "A1", "Artist A", "Compilation"), albumArtist: "Various Artists" },
      { ...createTrack("2", "A2", "Artist B", "Compilation"), albumArtist: "Various Artists" }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.artist).toBe("Various Artists");
    expect(groups[0]?.trackIds).toEqual(["1", "2"]);
  });

  it("falls back to grouping by artist when the album is unknown", () => {
    const groups = groupTracksForGallery([
      createTrack("1", "A1", "Kaze", "Unknown Album"),
      createTrack("2", "A2", "Kaze", "Unknown Album")
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("Kaze");
    expect(groups[0]?.trackIds).toEqual(["1", "2"]);
  });

  it("keeps tracks without any tags separate", () => {
    const groups = groupTracksForGallery([
      createTrack("1", "A1", "Unknown Artist", "Unknown Album"),
      createTrack("2", "A2", "Unknown Artist", "Unknown Album")
    ]);

    expect(groups).toHaveLength(2);
  });

  it("uses the first available cover inside a group", () => {
    const groups = groupTracksForGallery([
      createTrack("1", "A1", "Kaze", "Terrace EP", null),
      createTrack("2", "A2", "Kaze", "Terrace EP", "D:\\covers\\terrace.png")
    ]);

    expect(groups[0]?.coverPath).toBe("D:\\covers\\terrace.png");
  });

  it("sorts groups by title and keeps an empty library empty", () => {
    const groups = groupTracksForGallery([
      createTrack("1", "A1", "Kaze", "Zeta"),
      createTrack("2", "A2", "Kaze", "Alpha")
    ]);

    expect(groups.map((group) => group.title)).toEqual(["Alpha", "Zeta"]);
    expect(groupTracksForGallery([])).toEqual([]);
  });

  it("supports artist and manifest-order sorting", () => {
    const tracks = [
      createTrack("1", "A1", "Zeta", "First"),
      createTrack("2", "A2", "Alpha", "Second")
    ];

    expect(groupTracksForGallery(tracks, "imported").map((group) => group.title)).toEqual(["First", "Second"]);
    expect(groupTracksForGallery(tracks, "artist").map((group) => group.title)).toEqual(["Second", "First"]);
  });

  it("reports the summed album duration used by duration sorting", () => {
    const groups = groupTracksForGallery([
      createTrack("1", "A1", "Kaze", "Terrace EP"),
      createTrack("2", "A2", "Kaze", "Terrace EP")
    ]);

    expect(groups[0]?.durationSeconds).toBe(200);
  });

  it("keeps explicit single CDs apart even when their tags are identical", () => {
    const groups = groupTracksForGallery([
      { ...createTrack("1", "Same", "Kaze", "Same"), cdId: "solo:1" },
      { ...createTrack("2", "Same", "Kaze", "Same"), cdId: "solo:2" },
      createTrack("3", "Third", "Kaze", "Same")
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.trackIds.includes("1"))?.trackIds).toEqual(["1"]);
  });

  it("orders CDs by the saved manual order and appends the rest", () => {
    const tracks = [
      createTrack("1", "A1", "Kaze", "Zeta"),
      createTrack("2", "A2", "Kaze", "Alpha")
    ];

    expect(groupTracksForGallery(tracks, "manual", ["Kaze::Zeta", "Kaze::Alpha"]).map((group) => group.title)).toEqual([
      "Zeta",
      "Alpha"
    ]);
    expect(groupTracksForGallery(tracks, "manual", ["Kaze::Alpha"]).map((group) => group.title)).toEqual([
      "Alpha",
      "Zeta"
    ]);
    // 没有手动顺序时保持推导顺序（导入顺序），而不是退回标题排序。
    expect(groupTracksForGallery(tracks, "manual", []).map((group) => group.title)).toEqual(["Zeta", "Alpha"]);
  });
});
