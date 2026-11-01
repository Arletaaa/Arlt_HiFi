import { create, type StateCreator } from "zustand";
import { createStore } from "zustand/vanilla";
import { initialPlayerSnapshot, type PlaybackMode, type PlayerSnapshot, type SeekRequest, type Track } from "@arlhifi/shared";
import { getNextIndex, getPreviousIndex, getReplacementIndex, pruneQueueToLibrary } from "./queue-logic";

export interface LibraryActions {
  readonly loadLibrary: (library: readonly Track[]) => void;
  readonly toggleFavorite: (trackId: string) => void;
}

export interface QueueActions {
  readonly clearQueue: () => void;
  readonly rebuildQueueFromLibrary: () => void;
  readonly removeFromQueue: (trackId: string) => void;
}

export interface PlaybackActions {
  readonly handleTrackEnded: () => void;
  readonly markPlaybackPaused: () => void;
  readonly markPlaybackStarted: () => void;
  readonly cueTracks: (tracks: readonly Track[], startIndex?: number) => void;
  readonly nextTrack: () => void;
  readonly playTrack: (track: Track) => void;
  readonly playTracks: (tracks: readonly Track[], startIndex?: number) => void;
  readonly previousTrack: () => void;
  readonly seekTo: (seconds: number) => void;
  readonly setDurationSeconds: (durationSeconds: number) => void;
  readonly setPlaybackError: (message: string | null) => void;
  readonly setPlaybackMode: (playbackMode: PlaybackMode) => void;
  readonly setPositionSeconds: (positionSeconds: number) => void;
  readonly setVolume: (volume: number) => void;
  readonly toggleMute: () => void;
  readonly togglePlayback: () => void;
}

export type PlayerActions = LibraryActions & QueueActions & PlaybackActions;

export type PlayerStore = PlayerSnapshot & PlayerActions;

export const createInitialPlayerState = (): PlayerSnapshot => ({
  ...initialPlayerSnapshot,
  library: [...initialPlayerSnapshot.library],
  queue: [...initialPlayerSnapshot.queue],
  favorites: [...initialPlayerSnapshot.favorites]
});

const clampVolume = (volume: number): number => Math.max(0, Math.min(100, Math.round(volume)));

const getPlayableQueue = (state: Pick<PlayerStore, "queue" | "library">): readonly Track[] => {
  if (state.queue.length > 0) {
    return state.queue;
  }

  return state.library;
};

const seekRequestFor = (state: Pick<PlayerStore, "seekRequest">, seconds: number): SeekRequest => ({
  seconds,
  nonce: (state.seekRequest?.nonce ?? 0) + 1
});

const startTrack = (
  state: Pick<PlayerStore, "playbackEpoch">,
  queue: readonly Track[],
  track: Track,
  status: "playing" | "paused" = "playing"
): Partial<PlayerStore> => ({
  queue: [...queue],
  currentTrack: track,
  playbackErrorMessage: null,
  playbackEpoch: state.playbackEpoch + 1,
  positionSeconds: 0,
  durationSeconds: track.durationSeconds,
  seekRequest: null,
  status
});

/** 曲库切片：扫描结果与收藏。收藏只是 id 集合。 */
const createLibrarySlice: StateCreator<PlayerStore, [], [], LibraryActions> = (set) => ({
  loadLibrary: (library) => {
    const nextLibrary = [...library];

    set((state) => {
      const libraryById = new Map(nextLibrary.map((track) => [track.id, track]));
      const prunedQueue = pruneQueueToLibrary(state.queue, nextLibrary).map(
        (track) => libraryById.get(track.id) ?? track
      );
      const currentTrack = state.currentTrack
        ? libraryById.get(state.currentTrack.id) ?? null
        : null;

      return {
        library: nextLibrary,
        queue: prunedQueue.length > 0 ? prunedQueue : nextLibrary,
        currentTrack,
        positionSeconds: currentTrack ? state.positionSeconds : 0,
        durationSeconds: currentTrack ? state.durationSeconds : 0,
        seekRequest: currentTrack ? state.seekRequest : null,
        playbackErrorMessage: null,
        status: currentTrack ? state.status : "idle"
      };
    });
  },
  toggleFavorite: (trackId) => {
    set((state) => ({
      favorites: state.favorites.includes(trackId)
        ? state.favorites.filter((id) => id !== trackId)
        : [...state.favorites, trackId]
    }));
  }
});

/** 队列切片：队列与库解耦，可独立移除/清空/重建。 */
const createQueueSlice: StateCreator<PlayerStore, [], [], QueueActions> = (set) => ({
  removeFromQueue: (trackId) => {
    set((state) => {
      const removedIndex = state.queue.findIndex((track) => track.id === trackId);

      if (removedIndex < 0) {
        return {};
      }

      const nextQueue = state.queue.filter((track) => track.id !== trackId);

      if (state.currentTrack?.id !== trackId) {
        return { queue: nextQueue };
      }

      const replacement = nextQueue[getReplacementIndex(removedIndex, nextQueue.length)] ?? null;

      if (!replacement) {
        return {
          queue: nextQueue,
          currentTrack: null,
          status: "idle" as const,
          positionSeconds: 0,
          durationSeconds: 0,
          seekRequest: null
        };
      }

      return startTrack(state, nextQueue, replacement);
    });
  },
  clearQueue: () => {
    set({
      queue: [],
      currentTrack: null,
      status: "idle",
      positionSeconds: 0,
      durationSeconds: 0,
      seekRequest: null,
      playbackErrorMessage: null
    });
  },
  rebuildQueueFromLibrary: () => {
    set((state) => ({ queue: state.library }));
  }
});

/** 播放切片：传输控制与音频状态同步。 */
const createPlaybackSlice: StateCreator<PlayerStore, [], [], PlaybackActions> = (set, get) => ({
  playTrack: (track) => {
    set((state) => {
      const queueIncludesTrack = state.queue.some((queuedTrack) => queuedTrack.id === track.id);
      const queue = queueIncludesTrack ? state.queue : [...state.queue, track];

      return startTrack(state, queue, track);
    });
  },
  playTracks: (tracks, startIndex = 0) => {
    const queue = [...tracks];

    if (queue.length === 0) {
      return;
    }

    const index = Math.min(Math.max(Math.round(startIndex), 0), queue.length - 1);
    const track = queue[index];

    if (!track) {
      return;
    }

    set((state) => startTrack(state, queue, track));
  },
  cueTracks: (tracks, startIndex = 0) => {
    const queue = [...tracks];

    if (queue.length === 0) {
      return;
    }

    const index = Math.min(Math.max(Math.round(startIndex), 0), queue.length - 1);
    const track = queue[index];

    if (!track) {
      return;
    }

    set((state) => startTrack(state, queue, track, "paused"));
  },
  nextTrack: () => {
    const state = get();
    const queue = getPlayableQueue(state);

    if (queue.length === 0) {
      return;
    }

    const currentIndex = state.currentTrack
      ? queue.findIndex((track) => track.id === state.currentTrack?.id)
      : -1;
    const nextIndex = getNextIndex(queue.length, currentIndex, state.playbackMode);
    const next = nextIndex >= 0 ? queue[nextIndex] : null;
    const nextStatus = state.status === "playing" ? ("playing" as const) : ("paused" as const);

    if (!next) {
      const only = queue[0];

      if (queue.length === 1 && only) {
        set(startTrack(state, queue, only, nextStatus));
        return;
      }

      set({ status: "paused" });
      return;
    }

    set(startTrack(state, queue, next, nextStatus));
  },
  previousTrack: () => {
    const state = get();

    if (!state.currentTrack) {
      return;
    }

    // 标准播放器行为：播放超过 3 秒时先回到本曲开头。
    if (state.positionSeconds > 3) {
      set({
        positionSeconds: 0,
        seekRequest: seekRequestFor(state, 0)
      });
      return;
    }

    const queue = getPlayableQueue(state);
    const currentIndex = queue.findIndex((track) => track.id === state.currentTrack?.id);
    const previousIndex = getPreviousIndex(queue.length, currentIndex, state.playbackMode);
    const previous = previousIndex >= 0 ? queue[previousIndex] : null;

    if (!previous) {
      set({
        positionSeconds: 0,
        seekRequest: seekRequestFor(state, 0)
      });
      return;
    }

    set(startTrack(state, queue, previous, state.status === "playing" ? "playing" : "paused"));
  },
  seekTo: (seconds) => {
    const state = get();

    if (!state.currentTrack) {
      return;
    }

    const duration = state.durationSeconds || state.currentTrack.durationSeconds;
    const clamped = Math.max(0, Math.min(seconds, duration > 0 ? duration : seconds));

    set({
      positionSeconds: Math.floor(clamped),
      seekRequest: seekRequestFor(state, clamped)
    });
  },
  togglePlayback: () => {
    set((state) => {
      const queue = getPlayableQueue(state);
      const nextTrack = state.currentTrack ?? queue[0];

      if (!nextTrack) {
        return { status: "idle" as const };
      }

      return {
        currentTrack: nextTrack,
        queue,
        playbackErrorMessage: null,
        status: state.status === "playing" ? ("paused" as const) : ("playing" as const)
      };
    });
  },
  setVolume: (volume) => {
    set({ volume: clampVolume(volume) });
  },
  setPlaybackMode: (playbackMode) => {
    set({ playbackMode });
  },
  setPositionSeconds: (positionSeconds) => {
    set({ positionSeconds: Math.max(0, Math.floor(positionSeconds)) });
  },
  setDurationSeconds: (durationSeconds) => {
    set({ durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, Math.floor(durationSeconds)) : 0 });
  },
  markPlaybackStarted: () => {
    set({ playbackErrorMessage: null, status: "playing" });
  },
  markPlaybackPaused: () => {
    set((state) => ({ status: state.currentTrack ? "paused" : "idle" }));
  },
  setPlaybackError: (message) => {
    set({ playbackErrorMessage: message, status: "paused" });
  },
  toggleMute: () => {
    set((state) => ({ muted: !state.muted }));
  },
  /**
   * 播完一首后：顺序模式到队尾停止；循环模式回到第一首；
   * 随机模式抽下一首。队列就是当前 CD 的曲目。
   */
  handleTrackEnded: () => {
    const state = get();

    if (!state.currentTrack) {
      return;
    }

    const queue = getPlayableQueue(state);
    const currentIndex = queue.findIndex((track) => track.id === state.currentTrack?.id);
    const nextIndex = getNextIndex(queue.length, currentIndex, state.playbackMode);
    const next = nextIndex >= 0 ? queue[nextIndex] : null;

    if (!next) {
      set({ status: "paused" });
      return;
    }

    set(startTrack(state, queue, next));
  }
});

const createPlayerStoreState: StateCreator<PlayerStore> = (...args) => ({
  ...createInitialPlayerState(),
  ...createLibrarySlice(...args),
  ...createQueueSlice(...args),
  ...createPlaybackSlice(...args)
});

export const createPlayerStore = () => createStore<PlayerStore>()(createPlayerStoreState);

export const usePlayerStore = create<PlayerStore>()(createPlayerStoreState);
