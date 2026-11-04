import { describe, expect, it } from "vitest";
import type { Track } from "@arlt-hifi/shared";
import { buildCdEdits, type CdEditNode } from "./cd-edits";

const createTrack = (id: string, title: string, overrides: Partial<Track> = {}): Track => ({
  album: "Album",
  artist: "Kaze",
  bitDepth: 16,
  coverPath: null,
  durationSeconds: 100,
  filePath: `D:\\Music\\${title}.flac`,
  id,
  metadataSource: "tags",
  quality: "lossless",
  sampleRateHz: 44100,
  title,
  ...overrides
});

const node = (id: string, title: string, tracks: readonly Track[], solo = false): CdEditNode => ({
  id,
  solo,
  title,
  tracks
});

describe("building CD edits from a dragged tree", () => {
  it("keeps the target CD metadata when a track with another album artist is dropped in", () => {
    const keeper = createTrack("a", "A");
    const incoming = createTrack("b", "B", { album: "Other", albumArtist: "Various Artists" });
    const base = [
      node("Kaze::Album", "Album", [keeper]),
      node("Various Artists::Other", "Other", [incoming])
    ];
    const next = [node("Kaze::Album", "Album", [incoming, keeper]), node("Various Artists::Other", "Other", [])];

    const { edits, remap } = buildCdEdits(next, base);
    const albumEdits = edits.filter((edit) => edit.album === "Album");

    // 目标 CD 的艺术家不会被拖进来的歌改写，而且整张 CD 用同一个 albumArtist，
    // 这样 artist 不同的歌才能真正并进同一张 CD。
    expect(albumEdits).toHaveLength(2);
    expect(albumEdits.every((edit) => edit.albumArtist === "Kaze")).toBe(true);
    expect(remap.size).toBe(0);
  });

  it("materialises albumArtist so a track with a different artist joins the CD", () => {
    const keeper = createTrack("a", "A", { album: "Album", artist: "Artist 1" });
    const incoming = createTrack("b", "B", { album: "Album Y", artist: "Artist 2" });
    const base = [node("Artist 1::Album", "Album", [keeper]), node("Artist 2::Album Y", "Album Y", [incoming])];
    const next = [node("Artist 1::Album", "Album", [incoming, keeper]), node("Artist 2::Album Y", "Album Y", [])];

    const { edits } = buildCdEdits(next, base);
    const incomingEdit = edits.find((edit) => edit.trackId === "b");

    expect(incomingEdit?.album).toBe("Album");
    expect(incomingEdit?.albumArtist).toBe("Artist 1");
  });

  it("renumbers tracks inside a CD and reports no remap when the CD id is stable", () => {
    const first = createTrack("a", "A", { albumArtist: "Kaze" });
    const second = createTrack("b", "B", { albumArtist: "Kaze" });
    const base = [node("Kaze::Album", "Album", [first, second])];
    const next = [node("Kaze::Album", "Album", [second, first])];

    const { edits, remap } = buildCdEdits(next, base);

    expect(edits).toEqual([
      { album: "Album", albumArtist: "Kaze", cdId: null, discNumber: 0, trackId: "b", trackNumber: 1 },
      { album: "Album", albumArtist: "Kaze", cdId: null, discNumber: 0, trackId: "a", trackNumber: 2 }
    ]);
    expect(remap.size).toBe(0);
  });

  it("remaps the CD id when merging gives an unknown-album CD a real name", () => {
    const track = createTrack("a", "A", { album: "Unknown Album", artist: "Unknown Artist" });
    const base = [node("track::a", "Unknown Artist", [track])];
    const next = [node("track::a", "Unknown Artist", [track])];

    const { remap } = buildCdEdits(next, base);

    // 标题没变、歌没变 → 不产生编辑。
    expect(remap.size).toBe(0);

    const renamed = buildCdEdits([node("track::a", "My CD", [track])], base);
    expect(renamed.remap.get("track::a")).toBe("album::My CD");
  });

  it("turns a dragged-out track into its own single CD", () => {
    const keeper = createTrack("a", "A");
    const moved = createTrack("b", "B");
    const base = [node("Kaze::Album", "Album", [keeper, moved])];
    const next = [node("Kaze::Album", "Album", [keeper]), node("solo:b", "B", [moved], true)];

    const { edits } = buildCdEdits(next, base);
    const soloEdit = edits.find((edit) => edit.trackId === "b");

    expect(soloEdit?.cdId).toBe("solo:b");
    expect(soloEdit?.album).toBe("B");
    expect(edits.find((edit) => edit.trackId === "a")?.trackNumber).toBe(1);
  });

  it("clears the single-CD id when another track joins it", () => {
    const solo = createTrack("a", "A", { album: "A", cdId: "solo:a" });
    const other = createTrack("b", "B");
    const base = [node("cdid::solo:a", "A", [solo], true), node("Kaze::Album", "Album", [other])];
    const next = [node("cdid::solo:a", "A", [solo, other]), node("Kaze::Album", "Album", [])];

    const { edits, remap } = buildCdEdits(next, base);

    expect(edits.every((edit) => edit.cdId === null)).toBe(true);
    expect(remap.get("cdid::solo:a")).toBe("Kaze::A");
  });
});
