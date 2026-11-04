import { describe, expect, it } from "vitest";
import { formatTrackTitles, truncateText } from "./caption";

describe("caption text", () => {
  it("keeps short text untouched", () => {
    expect(truncateText("Neon Tide", 20)).toBe("Neon Tide");
  });

  it("clips long text and appends an ellipsis within the budget", () => {
    const clipped = truncateText("Blue Hour Terrace Reprise", 12);

    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.length).toBeLessThanOrEqual(12);
  });

  it("joins the CD track titles", () => {
    expect(formatTrackTitles(["夜想曲", "星屑リフレイン"])).toBe("夜想曲 / 星屑リフレイン");
  });

  it("skips blank titles and clips the joined list", () => {
    expect(formatTrackTitles(["  ", "A", ""])).toBe("A");

    const joined = formatTrackTitles(["一", "二", "三", "四", "五", "六", "七", "八"], 9);

    expect(joined.endsWith("…")).toBe(true);
    expect(joined.length).toBeLessThanOrEqual(9);
  });
});
