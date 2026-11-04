import type { Track, TrackEdit } from "@arlt-hifi/shared";
import { groupIdForTrack, UNKNOWN_ARTIST } from "./album-groups";

const SOLO_PREFIX = "solo:";

/** 管理树里的一个 CD 节点（拖拽预览用的最小结构）。 */
export interface CdEditNode {
  readonly id: string;
  readonly solo: boolean;
  readonly title: string;
  readonly tracks: readonly Track[];
}

export interface CdEditResult {
  readonly edits: readonly TrackEdit[];
  /** 旧 CD id → 新 CD id；改名/拆合导致 id 变化时，调用方要同步 cdOrder。 */
  readonly remap: ReadonlyMap<string, string>;
}

/**
 * 把拖拽后的 CD 树折成一批 manifest 编辑。
 *
 * 关键点：目标 CD 的 albumArtist / discNumber 取「拖动前」的第一首，
 * 不能用拖动后的第一首——拖进来的歌可能带着别的 albumArtist，
 * 一旦写成整张 CD 的值，CD 的归组 key 就变了，列表位置也会跳。
 */
export const buildCdEdits = (
  nodes: readonly CdEditNode[],
  baseNodes: readonly CdEditNode[]
): CdEditResult => {
  const edits: TrackEdit[] = [];
  const remap = new Map<string, string>();

  for (const node of nodes) {
    if (node.tracks.length === 0) {
      continue;
    }

    const base = baseNodes.find((candidate) => candidate.id === node.id);
    const ids = node.tracks.map((track) => track.id).join("|");
    const baseIds = base?.tracks.map((track) => track.id).join("|") ?? "";
    const changed = !base || ids !== baseIds || node.title !== base.title;

    if (!changed) {
      continue;
    }

    const first = node.tracks[0];

    if (!first) {
      continue;
    }

    if (!base) {
      // 拖出去拆成单曲 CD：给一个只属于它的 cdId，避免和同名歌混在一起。
      node.tracks.forEach((track, index) => {
        edits.push({
          album: first.title,
          albumArtist: first.artist,
          cdId: `${SOLO_PREFIX}${first.id}`,
          discNumber: 0,
          trackId: track.id,
          trackNumber: index + 1
        });
      });
      continue;
    }

    const baseFirst = base.tracks[0] ?? first;
    const isSolo = base.solo && node.tracks.length === 1;
    const album = node.title;
    /**
     * 没有 albumArtist 的 CD，归组 key 会退回每首歌自己的 artist；
     * 拖进来的歌 artist 不同就会另起一张 CD（看起来像"合并后 CD 跑位"）。
     * 所以合并时把 CD 的显示艺术家固化成 albumArtist，让整张 CD 用一个 key。
     */
    const groupArtist = baseFirst.albumArtist?.trim() || baseFirst.artist.trim();
    const albumArtist = groupArtist === UNKNOWN_ARTIST ? "" : groupArtist;
    const discNumber = baseFirst.discNumber ?? 0;
    const cdId = isSolo ? baseFirst.cdId ?? null : null;

    node.tracks.forEach((track, index) => {
      edits.push({
        album,
        albumArtist,
        cdId,
        discNumber,
        trackId: track.id,
        trackNumber: index + 1
      });
    });

    const nextId = groupIdForTrack({
      ...baseFirst,
      album,
      albumArtist: albumArtist.length > 0 ? albumArtist : undefined,
      cdId: cdId ?? undefined
    });

    if (nextId !== node.id) {
      remap.set(node.id, nextId);
    }
  }

  return { edits, remap };
};
