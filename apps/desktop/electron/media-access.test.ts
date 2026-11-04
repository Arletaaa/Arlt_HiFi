import { describe, expect, it } from "vitest";
import {
  createMediaAccessList,
  getMediaContentType,
  isSupportedImageFile,
  isSupportedMediaFile,
  resolveMediaRequest
} from "./media-access.js";

describe("media request resolution", () => {
  it("parses audio and image URLs", () => {
    const encodedAudioPath = encodeURIComponent("D:\\Music\\Album\\Track.flac");

    expect(resolveMediaRequest(`arlt-hifi-media://audio/${encodedAudioPath}`)).toEqual({
      kind: "audio",
      filePath: "D:\\Music\\Album\\Track.flac"
    });

    const encodedImagePath = encodeURIComponent("D:\\Pictures\\night sky.webp");

    expect(resolveMediaRequest(`arlt-hifi-media://image/${encodedImagePath}`)).toEqual({
      kind: "image",
      filePath: "D:\\Pictures\\night sky.webp"
    });
  });

  it("rejects unknown hosts, empty paths and malformed URLs", () => {
    expect(resolveMediaRequest("arlt-hifi-media://video/abc")).toBeNull();
    expect(resolveMediaRequest("arlt-hifi-media://audio/")).toBeNull();
    expect(resolveMediaRequest("not a url")).toBeNull();
  });

  it("rejects malformed percent escapes", () => {
    expect(resolveMediaRequest("arlt-hifi-media://audio/%E0%A4%A")).toBeNull();
  });
});

describe("media access list", () => {
  it("only exposes explicitly allowed and supported files", () => {
    const access = createMediaAccessList();

    access.allow("audio", ["D:\\Music\\a.flac", "D:\\Music\\cover.png"]);
    access.allow("image", ["D:\\Pictures\\sky.png", "D:\\Pictures\\notes.txt"]);

    expect(access.has("audio", "D:\\Music\\a.flac")).toBe(true);
    expect(access.has("audio", "D:\\Music\\cover.png")).toBe(false);
    expect(access.has("image", "D:\\Pictures\\sky.png")).toBe(true);
    expect(access.has("image", "D:\\Pictures\\notes.txt")).toBe(false);
    expect(access.has("image", "D:\\Music\\a.flac")).toBe(false);
  });

  it("replaces the allow list on each scan instead of growing forever", () => {
    const access = createMediaAccessList();

    access.allow("audio", ["D:\\Music\\a.flac"]);
    access.allow("audio", ["D:\\Music\\b.flac"]);

    expect(access.has("audio", "D:\\Music\\a.flac")).toBe(false);
    expect(access.has("audio", "D:\\Music\\b.flac")).toBe(true);
  });

  it("maps media extensions to response content types", () => {
    expect(getMediaContentType("D:\\Music\\a.FLAC")).toBe("audio/flac");
    expect(getMediaContentType("D:\\Music\\a.wav")).toBe("audio/wav");
    expect(getMediaContentType("D:\\Pictures\\sky.webp")).toBe("image/webp");
    expect(getMediaContentType("D:\\Music\\notes.txt")).toBe("application/octet-stream");
  });

  it("recognizes supported image extensions only", () => {
    expect(isSupportedImageFile("D:\\Pictures\\sky.PNG")).toBe(true);
    expect(isSupportedImageFile("D:\\Pictures\\sky.gif")).toBe(false);
    expect(isSupportedMediaFile("image", "D:\\Pictures\\sky.jpeg")).toBe(true);
    expect(isSupportedMediaFile("audio", "D:\\Music\\a.flac")).toBe(true);
  });
});
