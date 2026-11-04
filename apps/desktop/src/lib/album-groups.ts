import type { LibrarySortKey, Track } from "@arlt-hifi/shared";

/** 展厅里的一个槽位：同一个专辑/作者的多张 CD 捆在一起。 */
export interface GalleryGroup {
  readonly artist: string;
  readonly coverPath: string | null;
  readonly durationSeconds: number;
  readonly id: string;
  /** 槽位在曲库里的首次出现顺序（manifest 顺序，用于"导入时间"排序）。 */
  readonly order: number;
  readonly title: string;
  readonly trackIds: readonly string[];
}

const UNKNOWN_ALBUM = "Unknown Album";
export const UNKNOWN_ARTIST = "Unknown Artist";

/** 显式 CD 归属（单曲 CD）优先；否则按专辑/艺术家/碟号推导。 */
export const groupIdForTrack = (track: Track): string => {
  const cdId = track.cdId?.trim();

  if (cdId && cdId.length > 0) {
    return `cdid::${cdId}`;
  }

  const hasAlbum = track.album.trim().length > 0 && track.album !== UNKNOWN_ALBUM;
  const artist = track.albumArtist?.trim() || track.artist;
  const hasArtist = artist.trim().length > 0 && artist !== UNKNOWN_ARTIST;
  const disc = (track.discNumber ?? 0) > 0 ? `::disc${track.discNumber}` : "";

  if (hasAlbum && hasArtist) {
    return `${artist}::${track.album}${disc}`;
  }

  if (hasAlbum) {
    return `album::${track.album}${disc}`;
  }

  if (hasArtist) {
    return `artist::${artist}`;
  }

  return `track::${track.id}`;
};

/** 同一张 CD 内按碟号/音轨号排；没有标签时保持导入顺序（稳定排序）。 */
const cueOrder = (tracks: readonly Track[]): readonly Track[] =>
  [...tracks].sort(
    (left, right) =>
      (left.discNumber ?? 0) - (right.discNumber ?? 0) ||
      (left.trackNumber ?? 0) - (right.trackNumber ?? 0)
  );

const titleOf = (track: Track): string =>
  track.album.trim().length > 0 && track.album !== UNKNOWN_ALBUM ? track.album : track.artist;

const compareGroups = (sortKey: LibrarySortKey) => {
  switch (sortKey) {
    case "artist":
      return (left: GalleryGroup, right: GalleryGroup): number =>
        left.artist.localeCompare(right.artist) || left.title.localeCompare(right.title);
    case "duration":
      return (left: GalleryGroup, right: GalleryGroup): number =>
        left.durationSeconds - right.durationSeconds || left.title.localeCompare(right.title);
    case "imported":
      return (left: GalleryGroup, right: GalleryGroup): number => left.order - right.order;
    case "manual":
    case "title":
    default:
      return (left: GalleryGroup, right: GalleryGroup): number =>
        left.title.localeCompare(right.title) || left.artist.localeCompare(right.artist);
  }
};

/** 手动顺序：cdOrder 里出现的 CD 按它的位置排，没记录的（新导入/新合并）接在末尾并保持推导顺序。 */
const applyManualOrder = (groups: readonly GalleryGroup[], cdOrder: readonly string[]): readonly GalleryGroup[] => {
  if (cdOrder.length === 0) {
    return groups;
  }

  const rank = new Map<string, number>();

  for (const [index, id] of cdOrder.entries()) {
    if (!rank.has(id)) {
      rank.set(id, index);
    }
  }

  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.group.id);
      const rightRank = rank.get(right.group.id);

      if (leftRank !== undefined && rightRank !== undefined) {
        return leftRank - rightRank;
      }

      if (leftRank !== undefined) {
        return -1;
      }

      if (rightRank !== undefined) {
        return 1;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.group);
};

/**
 * 把曲库折叠成展厅槽位：同专辑（同作者）一个槽位，无专辑信息时按作者归并。
 * 纯函数，可单测；输入顺序即 manifest 顺序，"导入时间"排序依赖它。
 */
export const groupTracksForGallery = (
  tracks: readonly Track[],
  sortKey: LibrarySortKey = "title",
  cdOrder: readonly string[] = []
): readonly GalleryGroup[] => {
  const buckets = new Map<string, { order: number; tracks: Track[] }>();

  for (const [index, track] of tracks.entries()) {
    const key = groupIdForTrack(track);
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.tracks.push(track);
    } else {
      buckets.set(key, { order: index, tracks: [track] });
    }
  }

  const groups: GalleryGroup[] = [];

  for (const [key, bucket] of buckets) {
    const orderedTracks = cueOrder(bucket.tracks);
    const first = orderedTracks[0];

    if (!first) {
      continue;
    }

    groups.push({
      id: key,
      order: bucket.order,
      artist: first.albumArtist?.trim() || first.artist,
      title: titleOf(first),
      coverPath: orderedTracks.find((track) => track.coverPath !== null)?.coverPath ?? null,
      durationSeconds: orderedTracks.reduce((total, track) => total + track.durationSeconds, 0),
      trackIds: orderedTracks.map((track) => track.id)
    });
  }

  return sortKey === "manual" ? applyManualOrder(groups, cdOrder) : groups.sort(compareGroups(sortKey));
};
