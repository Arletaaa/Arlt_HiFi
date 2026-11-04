import { describe, expect, it } from "vitest";
import { defaultAppSettings, defaultScenePreset } from "@arlt-hifi/shared";
import { mergeSettings } from "./settings-store.js";

describe("settings merging", () => {
  it("returns defaults for missing or invalid payloads", () => {
    expect(mergeSettings(null)).toEqual(defaultAppSettings);
    expect(mergeSettings("nope")).toEqual(defaultAppSettings);
  });

  it("keeps valid values", () => {
    const merged = mergeSettings({
      librarySort: "duration",
      motionTier: "rich",
      playbackMode: "shuffle",
      theme: "light",
      volume: 55
    });

    expect(merged).toEqual({
      cdOrder: [],
      librarySort: "duration",
      motionTier: "rich",
      playbackMode: "shuffle",
      scenePreset: defaultScenePreset,
      theme: "light",
      volume: 55
    });
  });

  it("keeps a manual CD order and drops junk entries", () => {
    const merged = mergeSettings({
      cdOrder: ["Kaze::Zeta", "Kaze::Zeta", 3, "   ", "Kaze::Alpha"],
      librarySort: "manual"
    });

    expect(merged.librarySort).toBe("manual");
    expect(merged.cdOrder).toEqual(["Kaze::Zeta", "Kaze::Alpha"]);
  });

  it("migrates the old playback modes", () => {
    expect(mergeSettings({ playbackMode: "stop" }).playbackMode).toBe("sequential");
    expect(mergeSettings({ playbackMode: "repeat-one" }).playbackMode).toBe("loop");
  });

  it("clamps numeric ranges and drops unknown enums", () => {
    const merged = mergeSettings({
      librarySort: "bogus",
      motionTier: "insane",
      playbackMode: "bogus",
      theme: "neon",
      volume: 400
    });

    expect(merged.librarySort).toBe(defaultAppSettings.librarySort);
    expect(merged.theme).toBe(defaultAppSettings.theme);
    expect(merged.motionTier).toBe(defaultAppSettings.motionTier);
    expect(merged.playbackMode).toBe(defaultAppSettings.playbackMode);
    expect(merged.volume).toBe(100);
  });
});
