import { useCallback, useState } from "react";
import type { ArltHifiDesktopApi, TrackMetadataEdit } from "@arlhifi/shared";
import { getDesktopErrorMessage } from "../lib/desktop-error";
import { usePlayerStore } from "../store/player-store";

const webPreviewMessage = "网页预览无法管理曲库，请使用 Electron 桌面应用。";

/** 曲目级管理：重命名 / 设封面 / 删除；成功后从主进程重新读取曲库。 */
export const useLibraryManage = () => {
  const loadLibrary = usePlayerStore((state) => state.loadLibrary);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
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

  const setTrackCover = useCallback(
    (trackId: string): Promise<boolean> =>
      run(trackId, async (api) => (await api.setTrackCover(trackId)) !== null),
    [run]
  );

  const deleteTrack = useCallback(
    (trackId: string): Promise<boolean> => run(trackId, (api) => api.deleteTrack(trackId)),
    [run]
  );

  return { busyTrackId, deleteTrack, editTrack, error, renameTrack, setTrackCover };
};
