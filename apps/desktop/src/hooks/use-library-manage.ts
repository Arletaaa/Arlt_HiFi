import { useCallback, useState } from "react";
import type { ArltHifiDesktopApi, Track, TrackEdit } from "@arlt-hifi/shared";
import { getDesktopErrorMessage } from "../lib/desktop-error";
import { usePlayerStore } from "../store/player-store";

const webPreviewMessage = "网页预览无法管理曲库，请使用 Electron 桌面应用。";

/** 曲目级管理：重命名 / CD 归属批量写 / 设封面 / 删除；成功后重新读取曲库。 */
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

  /** 一次 IPC 写完整棵树：合并 / 拆成单曲 / 组内调序都走这里。 */
  const applyTrackEdits = useCallback(
    async (edits: readonly TrackEdit[]): Promise<boolean> => {
      const api = window.arltHifiDesktop;

      if (!api) {
        setError(webPreviewMessage);
        return false;
      }

      if (edits.length === 0) {
        return false;
      }

      setBatchBusy(true);
      setError(null);

      try {
        const tracks: readonly Track[] = await api.applyTrackEdits(edits);

        loadLibrary(tracks);
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

  return { applyTrackEdits, batchBusy, busyTrackId, deleteTrack, error, renameTrack, setTrackCover };
};
