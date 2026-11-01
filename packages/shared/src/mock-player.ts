import type { PlayerSnapshot } from "./types.js";

export const initialPlayerSnapshot: PlayerSnapshot = {
  library: [],
  status: "idle",
  currentTrack: null,
  queue: [],
  playbackMode: "sequential",
  playbackEpoch: 0,
  seekRequest: null,
  volume: 72,
  muted: false,
  positionSeconds: 0,
  durationSeconds: 0,
  playbackErrorMessage: null
};
