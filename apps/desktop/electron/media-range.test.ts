import { describe, expect, it } from "vitest";
import { parseByteRange } from "./media-range.js";

describe("parseByteRange", () => {
  it("returns null when there is no usable range", () => {
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange("", 1000)).toBeNull();
    expect(parseByteRange("items=0-10", 1000)).toBeNull();
    expect(parseByteRange("bytes=-", 1000)).toBeNull();
  });

  it("parses closed, open-ended and suffix ranges", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("clamps the end to the file size", () => {
    expect(parseByteRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("marks impossible ranges as unsatisfiable", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=200-100", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-", 0)).toBe("unsatisfiable");
  });

  it("ignores ranges it does not understand instead of breaking playback", () => {
    expect(parseByteRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseByteRange("bytes=abc-def", 1000)).toBeNull();
  });
});
