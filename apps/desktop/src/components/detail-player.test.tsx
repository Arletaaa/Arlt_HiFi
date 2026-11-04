import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackMode, Track } from "@arlt-hifi/shared";
import { DetailPlayer } from "./detail-player";

const mock = vi.hoisted(() => {
  const state: {
    currentTrack: Track | null;
    durationSeconds: number;
    nextTrack: () => void;
    playbackMode: PlaybackMode;
    positionSeconds: number;
    previousTrack: () => void;
    seekTo: (seconds: number) => void;
    setPlaybackMode: (mode: PlaybackMode) => void;
    status: "idle" | "playing" | "paused";
  } = {
    currentTrack: null,
    durationSeconds: 0,
    nextTrack: () => undefined,
    playbackMode: "sequential",
    positionSeconds: 0,
    previousTrack: () => undefined,
    seekTo: () => undefined,
    setPlaybackMode: () => undefined,
    status: "idle"
  };

  return {
    state,
    usePlayerStore: <T,>(selector: (value: typeof state) => T): T => selector(state)
  };
});

vi.mock("../store/player-store", () => ({ usePlayerStore: mock.usePlayerStore }));

const track: Track = {
  album: "Bocchi the Rock",
  artist: "Kessoku Band",
  bitDepth: 24,
  coverPath: null,
  durationSeconds: 243,
  filePath: "C:\\library\\Bocchi.flac",
  id: "file://track",
  metadataSource: "tags",
  quality: "hi-res",
  sampleRateHz: 96000,
  title: "Bocchi the Rock",
  trackNumber: 1
};

afterEach(() => {
  mock.state.currentTrack = null;
  mock.state.durationSeconds = 0;
  mock.state.positionSeconds = 0;
  mock.state.status = "idle";
});

describe("DetailPlayer", () => {
  it("renders the playing state with pause control and progress", () => {
    mock.state.currentTrack = track;
    mock.state.durationSeconds = 243;
    mock.state.positionSeconds = 65;
    mock.state.status = "playing";

    const html = renderToStaticMarkup(
      <DetailPlayer
        onPlayPause={() => undefined}
        tracks={[track]}
        transport={{ armDown: true, cdSeated: true, spinning: true }}
      />
    );

    expect(html).toContain("NOW PLAYING");
    expect(html).toContain("Bocchi the Rock");
    expect(html).toContain('aria-label="暂停"');
    expect(html).toContain("1:05");
    expect(html).toContain("4:03");
  });

  it("shows play when the platter is silent even if the CD is seated", () => {
    mock.state.currentTrack = track;
    mock.state.durationSeconds = 243;
    mock.state.status = "paused";

    const html = renderToStaticMarkup(
      <DetailPlayer
        onPlayPause={() => undefined}
        tracks={[track]}
        transport={{ armDown: false, cdSeated: true, spinning: false }}
      />
    );

    expect(html).toContain("READY");
    expect(html).toContain('aria-label="播放"');
    expect(html).not.toContain('aria-label="暂停"');
  });
});
