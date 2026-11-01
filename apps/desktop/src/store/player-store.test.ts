import { describe, expect, it, vi } from "vitest";
import type { Track } from "@arlhifi/shared";
import { createInitialPlayerState, createPlayerStore } from "./player-store";

const createTrack = (id: string, title: string): Track => ({
  id,
  title,
  artist: "Test Artist",
  album: "Test Album",
  durationSeconds: 120,
  quality: "unknown",
  sampleRateHz: 0,
  bitDepth: 0,
  filePath: `D:\\Music\\${title}.mp3`,
  coverPath: null,
  metadataSource: "filename"
});

describe("player store initial state", () => {
  it("starts idle with an empty library and an empty queue", () => {
    const state = createInitialPlayerState();

    expect(state.library).toHaveLength(0);
    expect(state.queue).toHaveLength(0);
    expect(state.status).toBe("idle");
    expect(state.currentTrack).toBeNull();
  });

  it("clones collections for each initial state", () => {
    const first = createInitialPlayerState();
    const second = createInitialPlayerState();

    expect(first.library).not.toBe(second.library);
    expect(first.queue).not.toBe(second.queue);
  });
});

describe("player store actions", () => {
  it("loads a scanned library into library and queue", () => {
    const store = createPlayerStore();
    const tracks = [createTrack("track-1", "First"), createTrack("track-2", "Second")];

    store.getState().loadLibrary(tracks);

    expect(store.getState().library).toEqual(tracks);
    expect(store.getState().queue).toEqual(tracks);
    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().status).toBe("idle");
  });

  it("keeps an empty queue when loading an empty library", () => {
    const store = createPlayerStore();

    store.getState().loadLibrary([]);

    expect(store.getState().library).toHaveLength(0);
    expect(store.getState().queue).toHaveLength(0);
  });

  it("plays a selected track from the library", () => {
    const store = createPlayerStore();
    const track = createTrack("track-1", "First");

    store.getState().loadLibrary([track]);
    store.getState().playTrack(track);

    expect(store.getState().currentTrack).toEqual(track);
    expect(store.getState().status).toBe("playing");
    expect(store.getState().positionSeconds).toBe(0);
  });

  it("toggles playback using the first queued track when none is selected", () => {
    const store = createPlayerStore();
    const track = createTrack("track-1", "First");

    store.getState().loadLibrary([track]);
    store.getState().togglePlayback();

    expect(store.getState().currentTrack).toEqual(track);
    expect(store.getState().status).toBe("playing");

    store.getState().togglePlayback();

    expect(store.getState().status).toBe("paused");
  });

  it("stays idle when there is nothing to play", () => {
    const store = createPlayerStore();

    store.getState().togglePlayback();

    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().status).toBe("idle");
  });

  it("defaults to sequential and switches between the three playback modes", () => {
    const store = createPlayerStore();

    expect(store.getState().playbackMode).toBe("sequential");

    store.getState().setPlaybackMode("loop");
    expect(store.getState().playbackMode).toBe("loop");

    store.getState().setPlaybackMode("shuffle");
    expect(store.getState().playbackMode).toBe("shuffle");
  });

  it("clamps volume", () => {
    const store = createPlayerStore();

    store.getState().setVolume(120.7);
    expect(store.getState().volume).toBe(100);

    store.getState().setVolume(-4);
    expect(store.getState().volume).toBe(0);
  });

  it("syncs playback position and duration from the audio element", () => {
    const store = createPlayerStore();

    store.getState().setPositionSeconds(42.8);
    store.getState().setDurationSeconds(125.2);

    expect(store.getState().positionSeconds).toBe(42);
    expect(store.getState().durationSeconds).toBe(125);
  });

  it("tracks playback start, pause, and errors", () => {
    const store = createPlayerStore();
    const track = createTrack("track-1", "First");

    store.getState().playTrack(track);
    store.getState().setPlaybackError("Unsupported format");

    expect(store.getState().playbackErrorMessage).toBe("Unsupported format");
    expect(store.getState().status).toBe("paused");

    store.getState().markPlaybackStarted();

    expect(store.getState().playbackErrorMessage).toBeNull();
    expect(store.getState().status).toBe("playing");

    store.getState().markPlaybackPaused();

    expect(store.getState().status).toBe("paused");
  });
});

describe("queue editing", () => {
  it("removes a non-current track without touching playback", () => {
    const store = createPlayerStore();
    const first = createTrack("track-1", "First");
    const second = createTrack("track-2", "Second");

    store.getState().loadLibrary([first, second]);
    store.getState().playTrack(first);
    store.getState().removeFromQueue("track-2");

    expect(store.getState().queue).toEqual([first]);
    expect(store.getState().currentTrack).toEqual(first);
    expect(store.getState().status).toBe("playing");
  });

  it("moves to the replacement track when the current one is removed", () => {
    const store = createPlayerStore();
    const first = createTrack("track-1", "First");
    const second = createTrack("track-2", "Second");
    const third = createTrack("track-3", "Third");

    store.getState().loadLibrary([first, second, third]);
    store.getState().playTrack(second);
    store.getState().removeFromQueue("track-2");

    expect(store.getState().queue).toEqual([first, third]);
    expect(store.getState().currentTrack).toEqual(third);
    expect(store.getState().status).toBe("playing");
    expect(store.getState().positionSeconds).toBe(0);
  });

  it("stops playback when the last queue item is removed", () => {
    const store = createPlayerStore();
    const only = createTrack("track-1", "First");

    store.getState().loadLibrary([only]);
    store.getState().playTrack(only);
    store.getState().removeFromQueue("track-1");

    expect(store.getState().queue).toHaveLength(0);
    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().status).toBe("idle");
  });

  it("clears the queue and stops playback", () => {
    const store = createPlayerStore();
    const track = createTrack("track-1", "First");

    store.getState().loadLibrary([track]);
    store.getState().playTrack(track);
    store.getState().clearQueue();

    expect(store.getState().queue).toHaveLength(0);
    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().status).toBe("idle");
  });

  it("rebuilds the queue from the library and keeps the current track", () => {
    const store = createPlayerStore();
    const first = createTrack("track-1", "First");
    const second = createTrack("track-2", "Second");

    store.getState().loadLibrary([first, second]);
    store.getState().playTrack(first);
    store.getState().clearQueue();
    store.getState().rebuildQueueFromLibrary();

    expect(store.getState().queue).toEqual([first, second]);
  });

  it("prunes queue entries that left the library on reload", () => {
    const store = createPlayerStore();
    const first = createTrack("track-1", "First");
    const second = createTrack("track-2", "Second");

    store.getState().loadLibrary([first, second]);
    store.getState().loadLibrary([second]);

    expect(store.getState().queue).toEqual([second]);
    expect(store.getState().currentTrack).toBeNull();
  });

  it("appends a track played from outside the queue", () => {
    const store = createPlayerStore();
    const first = createTrack("track-1", "First");
    const second = createTrack("track-2", "Second");

    store.getState().loadLibrary([first]);
    store.getState().playTrack(second);

    expect(store.getState().queue).toEqual([first, second]);
    expect(store.getState().currentTrack).toEqual(second);
  });
});
describe("CD queue playback", () => {
  const createQueue = () => {
    const store = createPlayerStore();
    const first = createTrack("track-1", "First");
    const second = createTrack("track-2", "Second");
    const third = createTrack("track-3", "Third");

    store.getState().loadLibrary([first, second, third]);

    return { first, second, store, third };
  };

  it("plays an album queue from the selected index", () => {
    const { first, second, store, third } = createQueue();

    store.getState().playTracks([first, second, third], 1);

    expect(store.getState().queue).toEqual([first, second, third]);
    expect(store.getState().currentTrack).toEqual(second);
    expect(store.getState().status).toBe("playing");
    expect(store.getState().positionSeconds).toBe(0);
  });

  it("advances sequentially and stops after the last track", () => {
    const { first, second, store, third } = createQueue();

    store.getState().playTracks([first, second, third]);
    store.getState().handleTrackEnded();
    expect(store.getState().currentTrack).toEqual(second);

    store.getState().handleTrackEnded();
    expect(store.getState().currentTrack).toEqual(third);

    store.getState().handleTrackEnded();
    expect(store.getState().currentTrack).toEqual(third);
    expect(store.getState().status).toBe("paused");
  });

  it("wraps to the first track in loop mode", () => {
    const { first, second, store } = createQueue();

    store.getState().playTracks([first, second]);
    store.getState().setPlaybackMode("loop");
    store.getState().handleTrackEnded();
    expect(store.getState().currentTrack).toEqual(second);

    store.getState().handleTrackEnded();
    expect(store.getState().currentTrack).toEqual(first);
  });

  it("picks a different track in shuffle mode", () => {
    const { first, second, store } = createQueue();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);

    store.getState().playTracks([first, second]);
    store.getState().setPlaybackMode("shuffle");
    store.getState().handleTrackEnded();

    expect(store.getState().currentTrack).toEqual(second);
    random.mockRestore();
  });

  it("restarts a single-track CD in sequential and loop modes", () => {
    const store = createPlayerStore();
    const only = createTrack("track-1", "Only");

    store.getState().playTracks([only]);
    store.getState().handleTrackEnded();

    expect(store.getState().currentTrack).toEqual(only);
    expect(store.getState().status).toBe("paused");

    store.getState().setPlaybackMode("loop");
    store.getState().handleTrackEnded();

    expect(store.getState().currentTrack).toEqual(only);
    expect(store.getState().status).toBe("playing");
  });

  it("cues a CD without starting audio", () => {
    const { first, second, store, third } = createQueue();

    store.getState().cueTracks([first, second, third]);

    expect(store.getState().queue).toEqual([first, second, third]);
    expect(store.getState().currentTrack).toEqual(first);
    expect(store.getState().status).toBe("paused");
    expect(store.getState().positionSeconds).toBe(0);
  });

  it("keeps paused state when skipping while stopped", () => {
    const { first, second, store, third } = createQueue();

    store.getState().cueTracks([first, second, third]);
    store.getState().nextTrack();

    expect(store.getState().currentTrack).toEqual(second);
    expect(store.getState().status).toBe("paused");
  });

  it("navigates previous/next within the current CD", () => {
    const { first, second, store, third } = createQueue();

    store.getState().playTracks([first, second, third], 1);
    store.getState().nextTrack();
    expect(store.getState().currentTrack).toEqual(third);

    store.getState().previousTrack();
    expect(store.getState().currentTrack).toEqual(second);
  });

  it("restarts the current track when previous is pressed after 3 seconds", () => {
    const { first, second, store } = createQueue();

    store.getState().playTracks([first, second], 1);
    store.getState().setPositionSeconds(8);
    store.getState().previousTrack();

    expect(store.getState().currentTrack).toEqual(second);
    expect(store.getState().positionSeconds).toBe(0);
    expect(store.getState().seekRequest?.seconds).toBe(0);
  });

  it("seeks within the current duration", () => {
    const { first, store } = createQueue();

    store.getState().playTracks([first]);
    store.getState().seekTo(42.6);

    expect(store.getState().positionSeconds).toBe(42);
    expect(store.getState().seekRequest?.seconds).toBe(42.6);

    store.getState().seekTo(9999);
    expect(store.getState().positionSeconds).toBe(120);
  });

  it("does nothing when no track is playing", () => {
    const { store } = createQueue();

    store.getState().handleTrackEnded();

    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().status).toBe("idle");
  });

  it("toggles mute", () => {
    const { store } = createQueue();

    expect(store.getState().muted).toBe(false);

    store.getState().toggleMute();
    expect(store.getState().muted).toBe(true);
  });
});
