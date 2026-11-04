import { describe, expect, it } from "vitest";
import type { Track } from "@arlt-hifi/shared";
import { getNextIndex, getPreviousIndex, getReplacementIndex, pruneQueueToLibrary } from "./queue-logic";

const createTrack = (id: string): Track => ({
  id,
  title: id,
  artist: "Artist",
  album: "Album",
  durationSeconds: 100,
  quality: "unknown",
  sampleRateHz: 0,
  bitDepth: 0,
  filePath: `D:\\Music\\${id}.flac`,
  coverPath: null,
  metadataSource: "filename"
});

describe("queue pruning", () => {
  it("keeps only tracks that still exist in the library", () => {
    const queue = [createTrack("a"), createTrack("b"), createTrack("c")];
    const library = [createTrack("b"), createTrack("c")];

    expect(pruneQueueToLibrary(queue, library).map((track) => track.id)).toEqual(["b", "c"]);
  });

  it("returns an empty queue when the library is empty", () => {
    expect(pruneQueueToLibrary([createTrack("a")], [])).toEqual([]);
  });

  it("preserves queue order", () => {
    const queue = [createTrack("c"), createTrack("a"), createTrack("b")];
    const library = [createTrack("a"), createTrack("b"), createTrack("c")];

    expect(pruneQueueToLibrary(queue, library).map((track) => track.id)).toEqual(["c", "a", "b"]);
  });
});

describe("replacement index", () => {
  it("takes the same position after removal", () => {
    expect(getReplacementIndex(1, 3)).toBe(1);
  });

  it("falls back to the last item", () => {
    expect(getReplacementIndex(5, 2)).toBe(1);
  });

  it("returns -1 when nothing remains", () => {
    expect(getReplacementIndex(0, 0)).toBe(-1);
  });
});

describe("next/previous index", () => {
  it("advances and stops at the end in sequential mode", () => {
    expect(getNextIndex(3, 0, "sequential")).toBe(1);
    expect(getNextIndex(3, 2, "sequential")).toBe(-1);
    expect(getPreviousIndex(3, 1, "sequential")).toBe(0);
    expect(getPreviousIndex(3, 0, "sequential")).toBe(-1);
  });

  it("wraps in loop mode", () => {
    expect(getNextIndex(3, 2, "loop")).toBe(0);
    expect(getPreviousIndex(3, 0, "loop")).toBe(2);
  });

  it("avoids the current track in shuffle mode", () => {
    expect(getNextIndex(3, 1, "shuffle", () => 0.3)).toBe(0);
    expect(getPreviousIndex(3, 1, "shuffle", () => 0.3)).toBe(0);
    expect(getNextIndex(1, 0, "shuffle", () => 0.9)).toBe(0);
  });

  it("returns no target for empty queues", () => {
    expect(getNextIndex(0, -1, "sequential")).toBe(-1);
    expect(getPreviousIndex(0, -1, "loop")).toBe(-1);
  });
});
