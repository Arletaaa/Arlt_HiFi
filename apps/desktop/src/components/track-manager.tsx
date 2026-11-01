import { useState } from "react";
import { formatDuration, type Track, type TrackMetadataEdit } from "@arlhifi/shared";

interface MetadataDraft {
  album: string;
  albumArtist: string;
  discNumber: string;
  trackNumber: string;
}

export interface TrackManagerProps {
  readonly busyTrackId: string | null;
  readonly error: string | null;
  readonly onCover: (trackId: string) => Promise<boolean>;
  readonly onDelete: (trackId: string) => Promise<boolean>;
  readonly onEdit: (trackId: string, edit: TrackMetadataEdit) => Promise<boolean>;
  readonly onRename: (trackId: string, title: string) => Promise<boolean>;
  readonly tracks: readonly Track[];
}

const toCueNumber = (value: string): number => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.min(999, Math.max(0, Math.round(parsed))) : 0;
};

/** 曲目管理列表：行内重命名、CD 信息、设封面、删除（二次确认）。 */
export const TrackManager = ({
  busyTrackId,
  error,
  onCover,
  onDelete,
  onEdit,
  onRename,
  tracks
}: TrackManagerProps) => {
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [metadataTrackId, setMetadataTrackId] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>({
    album: "",
    albumArtist: "",
    discNumber: "0",
    trackNumber: "0"
  });
  const [confirmTrackId, setConfirmTrackId] = useState<string | null>(null);

  const beginRename = (track: Track): void => {
    setConfirmTrackId(null);
    setMetadataTrackId(null);
    setEditingTrackId(track.id);
    setDraftTitle(track.title);
  };

  const cancelRename = (): void => {
    setEditingTrackId(null);
    setDraftTitle("");
  };

  const submitRename = async (track: Track): Promise<void> => {
    const title = draftTitle.trim();

    if (title.length === 0 || title === track.title) {
      cancelRename();
      return;
    }

    if (await onRename(track.id, title)) {
      cancelRename();
    }
  };

  const beginMetadata = (track: Track): void => {
    setConfirmTrackId(null);
    setEditingTrackId(null);
    setMetadataTrackId(track.id);
    setMetadataDraft({
      album: track.album,
      albumArtist: track.albumArtist ?? "",
      discNumber: String(track.discNumber ?? 0),
      trackNumber: String(track.trackNumber ?? 0)
    });
  };

  const cancelMetadata = (): void => {
    setMetadataTrackId(null);
  };

  const submitMetadata = async (track: Track): Promise<void> => {
    const album = metadataDraft.album.trim();

    if (album.length === 0) {
      return;
    }

    const edit: TrackMetadataEdit = {
      album,
      albumArtist: metadataDraft.albumArtist.trim(),
      discNumber: toCueNumber(metadataDraft.discNumber),
      trackNumber: toCueNumber(metadataDraft.trackNumber)
    };

    if (await onEdit(track.id, edit)) {
      cancelMetadata();
    }
  };

  if (tracks.length === 0) {
    return <p className="manage-dialog__empty">曲库还是空的，先在设置里导入音乐。</p>;
  }

  return (
    <div className="track-manager">
      {error ? (
        <p className="library-import__status is-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="library-manage__list">
        {tracks.map((track) => {
          const editing = editingTrackId === track.id;
          const editingMetadata = metadataTrackId === track.id;
          const confirming = confirmTrackId === track.id;
          const busyRow = busyTrackId === track.id;

          return (
            <li
              className={`library-manage__row${editingMetadata ? " is-editing" : ""}`}
              key={track.id}
            >
              <div className="library-manage__meta">
                {editing ? (
                  <input
                    aria-label={`重命名 ${track.title}`}
                    autoFocus
                    className="library-manage__input"
                    onChange={(event) => {
                      setDraftTitle(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void submitRename(track);
                      } else if (event.key === "Escape") {
                        cancelRename();
                      }
                    }}
                    value={draftTitle}
                  />
                ) : (
                  <span className="library-manage__title">{track.title}</span>
                )}
                <span className="library-manage__sub">
                  {track.artist} · {track.album}
                  {track.discNumber && track.discNumber > 0 ? ` · Disc ${track.discNumber}` : ""}
                  {track.trackNumber && track.trackNumber > 0 ? ` · Track ${track.trackNumber}` : ""}
                  {" · "}
                  {formatDuration(track.durationSeconds)}
                </span>
              </div>

              <div className="library-manage__actions">
                {editingMetadata ? (
                  <>
                    <button
                      className="library-manage__action"
                      disabled={busyRow || metadataDraft.album.trim().length === 0}
                      onClick={() => {
                        void submitMetadata(track);
                      }}
                      type="button"
                    >
                      保存
                    </button>
                    <button className="library-manage__action" onClick={cancelMetadata} type="button">
                      取消
                    </button>
                  </>
                ) : editing ? (
                  <>
                    <button
                      className="library-manage__action"
                      disabled={busyRow}
                      onClick={() => {
                        void submitRename(track);
                      }}
                      type="button"
                    >
                      保存
                    </button>
                    <button className="library-manage__action" onClick={cancelRename} type="button">
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="library-manage__action"
                      disabled={busyRow}
                      onClick={() => {
                        beginRename(track);
                      }}
                      type="button"
                    >
                      重命名
                    </button>
                    <button
                      className="library-manage__action"
                      disabled={busyRow}
                      onClick={() => {
                        beginMetadata(track);
                      }}
                      type="button"
                    >
                      CD 信息
                    </button>
                    <button
                      className="library-manage__action"
                      disabled={busyRow}
                      onClick={() => {
                        setConfirmTrackId(null);
                        void onCover(track.id);
                      }}
                      type="button"
                    >
                      封面
                    </button>
                    {confirming ? (
                      <>
                        <button
                          className="library-manage__action is-danger"
                          disabled={busyRow}
                          onClick={() => {
                            setConfirmTrackId(null);
                            void onDelete(track.id);
                          }}
                          type="button"
                        >
                          确认删除
                        </button>
                        <button
                          className="library-manage__action"
                          onClick={() => {
                            setConfirmTrackId(null);
                          }}
                          type="button"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        className="library-manage__action is-danger"
                        disabled={busyRow}
                        onClick={() => {
                          setConfirmTrackId(track.id);
                        }}
                        type="button"
                      >
                        删除
                      </button>
                    )}
                  </>
                )}
              </div>

              {editingMetadata ? (
                <div className="library-manage__editor">
                  <label className="library-manage__field">
                    <span>专辑</span>
                    <input
                      aria-label={`专辑 ${track.title}`}
                      autoFocus
                      className="library-manage__input"
                      onChange={(event) => {
                        setMetadataDraft((current) => ({ ...current, album: event.currentTarget.value }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void submitMetadata(track);
                        } else if (event.key === "Escape") {
                          cancelMetadata();
                        }
                      }}
                      value={metadataDraft.album}
                    />
                  </label>
                  <label className="library-manage__field">
                    <span>专辑艺术家</span>
                    <input
                      aria-label={`专辑艺术家 ${track.title}`}
                      className="library-manage__input"
                      onChange={(event) => {
                        setMetadataDraft((current) => ({
                          ...current,
                          albumArtist: event.currentTarget.value
                        }));
                      }}
                      placeholder="缺省回退到艺术家"
                      value={metadataDraft.albumArtist}
                    />
                  </label>
                  <label className="library-manage__field">
                    <span>碟号</span>
                    <input
                      aria-label={`碟号 ${track.title}`}
                      className="library-manage__input"
                      max={999}
                      min={0}
                      onChange={(event) => {
                        setMetadataDraft((current) => ({
                          ...current,
                          discNumber: event.currentTarget.value
                        }));
                      }}
                      type="number"
                      value={metadataDraft.discNumber}
                    />
                  </label>
                  <label className="library-manage__field">
                    <span>音轨号</span>
                    <input
                      aria-label={`音轨号 ${track.title}`}
                      className="library-manage__input"
                      max={999}
                      min={0}
                      onChange={(event) => {
                        setMetadataDraft((current) => ({
                          ...current,
                          trackNumber: event.currentTarget.value
                        }));
                      }}
                      type="number"
                      value={metadataDraft.trackNumber}
                    />
                  </label>
                  <p className="library-manage__hint">
                    相同专辑 + 专辑艺术家 + 碟号会合并为一张 CD；只改清单，不写音频标签。
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
