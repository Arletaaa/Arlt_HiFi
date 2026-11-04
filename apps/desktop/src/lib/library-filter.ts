import type { Track } from "@arlt-hifi/shared";

const matchesQuery = (track: Track, query: string): boolean => {
  const needle = query.trim().toLowerCase();

  if (needle.length === 0) {
    return true;
  }

  return [track.title, track.artist, track.album].some((value) => value.toLowerCase().includes(needle));
};

export const filterTracks = (tracks: readonly Track[], query: string): readonly Track[] =>
  tracks.filter((track) => matchesQuery(track, query));
