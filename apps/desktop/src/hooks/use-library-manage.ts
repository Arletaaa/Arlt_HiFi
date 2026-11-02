import { useCallback, useState } from "react";
import type { ArltHifiDesktopApi, TrackMetadataEdit } from "@arlhifi/shared";
import { getDesktopErrorMessage } from "../lib/desktop-error";
import { usePlayerStore } from "../store/player-store";

const webPreviewMessage = "网页预览无法管理曲库，请使用 Electron 桌面应用。";

export interface BatchTrackEdit {
  readonly album: string;
  readonly albumArtist: string;
  readonly discNumber: number;
}

/** 曲目级管理：重命名 / CD 信息 / 批量合并 / 设封面 / 删除；成功后重新读取曲库。 */
export const useLibraryManage = () => {
  const loadLibrary = usePlayerStore((state) => state.loadLibrary);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (trackId: string, action: (api: ArltHifiDesktopApi) => Promise<boolean>): Promise<boolean> => {
      const api = window.arltHifiDesktop;

      if (!api) {
        setError(webPreviewMessage);
        return false;
      }

      setBusyTrackId(trackId);
      setError(null);

      try {
        const changed = await action(api);

        if (changed) {
          loadLibrary(await api.loadLibrary());
        }

        return changed;
      } catch (caught) {
        setError(getDesktopErrorMessage(caught));
        return false;
      } finally {
        setBusyTrackId(null);
      }
    },
    [loadLibrary]
  );

  const renameTrack = useCallback(
    (trackId: string, title: string): Promise<boolean> =>
      run(trackId, async (api) => {
        await api.renameTrack(trackId, title);

        return true;
      }),
    [run]
  );

  const editTrack = useCallback(
    (trackId: string, edit: TrackMetadataEdit): Promise<boolean> =>
      run(trackId, async (api) => {
        await api.editTrack(trackId, edit);

        return true;
      }),
    [run]
  );

  /** 批量合并：按传入顺序写音轨号 1..N，最后一次 reload。 */
  const editTracks = useCallback(
    async (trackIds: readonly string[], edit: BatchTrackEdit): Promise<boolean> => {
      const api = window.arltHifiDesktop;

      if (!api) {
        setError(webPreviewMessage);
        return false;
      }

      if (trackIds.length === 0) {
        return false;
      }

      setBatchBusy(true);
      setError(null);

      try {
        for (const [index, trackId] of trackIds.entries()) {
          await api.editTrack(trackId, {
            album: edit.album,
            albumArtist: edit.albumArtist,
            discNumber: edit.discNumber,
            trackNumber: index + 1
          });
        }

        loadLibrary(await api.loadLibrary());
        return true;
      } catch (caught) {
        setError(getDesktopErrorMessage(caught));
        return false;
      } finally {
        setBatchBusy(false);
      }
    },
    [loadLibrary]
  );

  const setTrackCover = useCallback(
    (trackId: string): Promise<boolean> =>
      run(trackId, async (api) => (await api.setTrackCover(trackId)) !== null),
    [run]
  );

  const deleteTrack = useCallback(
    (trackId: string): Promise<boolean> => run(trackId, (api) => api.deleteTrack(trackId)),
    [run]
  );

  return { batchBusy, busyTrackId, deleteTrack, editTrack, editTracks, error, renameTrack, setTrackCover };
};
