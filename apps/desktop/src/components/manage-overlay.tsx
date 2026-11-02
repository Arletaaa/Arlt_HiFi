import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLibraryManage } from "../hooks/use-library-manage";
import { getDesktopErrorMessage } from "../lib/desktop-error";
import { sortTracks } from "../lib/library-filter";
import { usePlayerStore } from "../store/player-store";
import { useSettingsStore } from "../store/settings-store";
import { TrackManager } from "./track-manager";

export interface ManageOverlayProps {
  readonly onClose: () => void;
}

/** 叠在设置浮层上的曲目管理弹窗：设置不关闭，背景再加一层虚化。 */
export const ManageOverlay = ({ onClose }: ManageOverlayProps) => {
  const library = usePlayerStore((state) => state.library);
  const loadLibrary = usePlayerStore((state) => state.loadLibrary);
  const librarySort = useSettingsStore((state) => state.librarySort);
  const { batchBusy, busyTrackId, deleteTrack, editTrack, editTracks, error: manageError, renameTrack, setTrackCover } = useLibraryManage();
  const [actionError, setActionError] = useState<string | null>(null);
  const tracks = useMemo(() => sortTracks(library, librarySort), [library, librarySort]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.stopImmediatePropagation();
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  const openLibraryFolder = async (): Promise<void> => {
    const api = window.arltHifiDesktop;

    if (!api) {
      setActionError("网页预览没有音频目录，请使用 Electron 桌面应用。");
      return;
    }

    try {
      await api.openLibraryFolder();
      setActionError(null);
    } catch (caught) {
      setActionError(getDesktopErrorMessage(caught));
    }
  };

  const refresh = async (): Promise<void> => {
    const api = window.arltHifiDesktop;

    if (!api) {
      setActionError("网页预览没有曲库，请使用 Electron 桌面应用。");
      return;
    }

    try {
      loadLibrary(await api.loadLibrary());
      setActionError(null);
    } catch (caught) {
      setActionError(getDesktopErrorMessage(caught));
    }
  };

  return createPortal(
    <div
      className="settings-overlay settings-overlay--manage"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      role="presentation"
    >
      <div
        aria-label="管理曲目"
        className="settings-overlay__panel manage-panel"
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
      >
        <button aria-label="关闭管理" className="settings-overlay__close" onClick={onClose} type="button">
          ✕
        </button>

        <div className="manage-dialog">
          <header className="manage-dialog__head">
            <p className="preset-group__label">音乐库</p>
            <h2 className="manage-dialog__title">管理曲目</h2>
            <p className="manage-dialog__meta">
              {library.length} 首 · 重命名 / CD 信息 / 封面 / 删除只作用于托管副本
            </p>
            <p className="manage-dialog__meta">
              相同「专辑 + 专辑艺术家 + 碟号」会合并为一张 CD；音轨号决定 CD 内顺序。
            </p>
            <p className="manage-dialog__meta">
              勾选多首可批量合并，音轨号按列表顺序自动 1..N。
            </p>
          </header>

          <div className="library-import__actions">
            <button className="library-import__button" onClick={() => void openLibraryFolder()} type="button">
              打开音频文件夹
            </button>
            <button className="library-import__button" onClick={() => void refresh()} type="button">
              刷新
            </button>
          </div>

          {actionError ? (
            <p className="library-import__status is-error" role="alert">
              {actionError}
            </p>
          ) : null}

          <TrackManager
            batchBusy={batchBusy}
            busyTrackId={busyTrackId}
            error={manageError}
            onBatchEdit={(trackIds, edit) => editTracks(trackIds, edit)}
            onCover={(trackId) => setTrackCover(trackId)}
            onDelete={(trackId) => deleteTrack(trackId)}
            onEdit={(trackId, edit) => editTrack(trackId, edit)}
            onRename={(trackId, title) => renameTrack(trackId, title)}
            tracks={tracks}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};
