import type { PlaybackMode, Track } from "@arlt-hifi/shared";

/** 只保留仍存在于曲库中的队列项（换目录/刷新后调用）。 */
export const pruneQueueToLibrary = (queue: readonly Track[], library: readonly Track[]): readonly Track[] => {
  const libraryIds = new Set(library.map((track) => track.id));

  return queue.filter((track) => libraryIds.has(track.id));
};

/** 移除某一项后，接替它的下标（越界时取末尾）。 */
export const getReplacementIndex = (removedIndex: number, remainingLength: number): number => {
  if (remainingLength <= 0) {
    return -1;
  }

  return Math.min(Math.max(removedIndex, 0), remainingLength - 1);
};

const randomOtherIndex = (length: number, currentIndex: number, random: () => number): number => {
  if (length <= 1) {
    return 0;
  }

  const candidate = Math.floor(random() * length);

  return candidate === currentIndex ? (candidate + 1) % length : candidate;
};

/** 下一首；顺序模式到末尾返回 -1，循环回绕，随机避开当前曲目。 */
export const getNextIndex = (
  length: number,
  currentIndex: number,
  mode: PlaybackMode,
  random: () => number = Math.random
): number => {
  if (length <= 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return 0;
  }

  if (mode === "shuffle") {
    return randomOtherIndex(length, currentIndex, random);
  }

  if (mode === "loop") {
    return (currentIndex + 1) % length;
  }

  return currentIndex + 1 < length ? currentIndex + 1 : -1;
};

/** 上一首；顺序模式到开头返回 -1，循环回绕，随机避开当前曲目。 */
export const getPreviousIndex = (
  length: number,
  currentIndex: number,
  mode: PlaybackMode,
  random: () => number = Math.random
): number => {
  if (length <= 0 || currentIndex < 0) {
    return -1;
  }

  if (mode === "shuffle") {
    return randomOtherIndex(length, currentIndex, random);
  }

  if (mode === "loop") {
    return (currentIndex - 1 + length) % length;
  }

  return currentIndex > 0 ? currentIndex - 1 : -1;
};
