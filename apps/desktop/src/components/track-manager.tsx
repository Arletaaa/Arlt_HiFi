import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createCoverMediaUrl, formatDuration, type Track, type TrackEdit } from "@arlt-hifi/shared";
import type { GalleryGroup } from "../lib/album-groups";
import { buildCdEdits } from "../lib/cd-edits";

const SOLO_ZONE_ID = "__solo-drop-zone__";
const SOLO_PREFIX = "solo:";

interface CdNode {
  readonly artist: string;
  readonly coverPath: string | null;
  readonly id: string;
  readonly solo: boolean;
  readonly title: string;
  readonly tracks: readonly Track[];
}

export interface TrackManagerProps {
  readonly batchBusy: boolean;
  readonly busyTrackId: string | null;
  readonly cdOrder: readonly string[];
  readonly error: string | null;
  readonly groups: readonly GalleryGroup[];
  readonly onApply: (edits: readonly TrackEdit[]) => Promise<boolean>;
  readonly onCover: (trackId: string) => Promise<boolean>;
  readonly onDelete: (trackId: string) => Promise<boolean>;
  readonly onRename: (trackId: string, title: string) => Promise<boolean>;
  readonly onReorderCds: (ids: readonly string[], manual: boolean) => void;
  readonly tracks: readonly Track[];
}

const buildNodes = (groups: readonly GalleryGroup[], tracks: readonly Track[]): readonly CdNode[] => {
  const byId = new Map(tracks.map((track) => [track.id, track]));

  return groups.map((group) => {
    const list = group.trackIds
      .map((trackId) => byId.get(trackId))
      .filter((track): track is Track => track !== undefined);
    const first = list[0] ?? null;

    return {
      artist: group.artist,
      coverPath: first?.coverPath ?? null,
      id: group.id,
      solo: Boolean(first?.cdId?.startsWith(SOLO_PREFIX)),
      title: group.title,
      tracks: list
    };
  });
};

const findContainer = (trackId: string, nodes: readonly CdNode[]): string | null =>
  nodes.find((node) => node.tracks.some((track) => track.id === trackId))?.id ?? null;

const moveTrack = (
  nodes: readonly CdNode[],
  trackId: string,
  targetId: string,
  index: number
): readonly CdNode[] => {
  const from = nodes.find((node) => node.tracks.some((track) => track.id === trackId));
  const track = from?.tracks.find((candidate) => candidate.id === trackId);

  if (!from || !track) {
    return nodes;
  }

  const next = nodes.map((node) => ({ ...node, tracks: [...node.tracks] }));
  const source = next.find((node) => node.id === from.id);

  if (!source) {
    return nodes;
  }

  source.tracks = source.tracks.filter((candidate) => candidate.id !== trackId);

  let target = next.find((node) => node.id === targetId);

  if (!target) {
    target = {
      artist: track.artist,
      coverPath: track.coverPath,
      id: targetId,
      solo: true,
      title: track.title,
      tracks: []
    };
    next.push(target);
  }

  const insertAt = Math.max(0, Math.min(index, target.tracks.length));
  target.tracks = [...target.tracks.slice(0, insertAt), track, ...target.tracks.slice(insertAt)];

  return next;
};

/* ---------- 单曲行 ---------- */

interface SongRowProps {
  readonly busy: boolean;
  readonly confirming: boolean;
  readonly editing: boolean;
  readonly index: number;
  readonly onCancelEdit: () => void;
  readonly onConfirmDelete: () => void;
  readonly onCover: () => void;
  readonly onDelete: () => void;
  readonly onDraftTitle: (value: string) => void;
  readonly onStartEdit: () => void;
  readonly onSubmitEdit: () => void;
  readonly pending: boolean;
  readonly track: Track;
  readonly draftTitle: string;
}

const SongRow = ({
  busy,
  confirming,
  draftTitle,
  editing,
  index,
  onCancelEdit,
  onConfirmDelete,
  onCover,
  onDelete,
  onDraftTitle,
  onStartEdit,
  onSubmitEdit,
  pending,
  track
}: SongRowProps) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: busy,
    id: track.id
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined
  };

  return (
    <li
      className={`cd-song${isDragging ? " is-dragging" : ""}${pending ? " is-busy" : ""}`}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label={`拖动 ${track.title}`}
        className="cd-song__handle"
        title="拖动排序"
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      <span className="cd-song__index">{index + 1}</span>

      {editing ? (
        <input
          aria-label={`重命名 ${track.title}`}
          autoFocus
          className="cd-song__input"
          onBlur={onCancelEdit}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          onChange={(event) => {
            onDraftTitle(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmitEdit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancelEdit();
            }
          }}
          value={draftTitle}
        />
      ) : (
        <button className="cd-song__title" onClick={onStartEdit} title="点击改名" type="button">
          {track.title}
        </button>
      )}

      <span className="cd-song__artist">{track.artist}</span>
      <span className="cd-song__time">{formatDuration(track.durationSeconds)}</span>

      <div className="cd-song__actions">
        {confirming ? (
          <>
            <button className="cd-action is-danger" onClick={onConfirmDelete} type="button">
              确认删除
            </button>
            <button className="cd-action" onClick={onCancelEdit} type="button">
              取消
            </button>
          </>
        ) : (
          <>
            <button className="cd-action" onClick={onCover} type="button">
              封面
            </button>
            <button className="cd-action is-danger" onClick={onDelete} type="button">
              删除
            </button>
          </>
        )}
      </div>
    </li>
  );
};

/* ---------- CD 卡片 ---------- */

interface CdCardProps {
  readonly busy: boolean;
  readonly canMoveDown: boolean;
  readonly canMoveUp: boolean;
  readonly children: ReactNode;
  readonly collapsed: boolean;
  readonly draftTitle: string;
  readonly editing: boolean;
  readonly node: CdNode;
  readonly onCancelRename: () => void;
  readonly onDraftTitle: (value: string) => void;
  readonly onMoveDown: () => void;
  readonly onMoveUp: () => void;
  readonly onStartRename: () => void;
  readonly onSubmitRename: () => void;
  readonly onToggle: () => void;
}

const CdCard = ({
  busy,
  canMoveDown,
  canMoveUp,
  children,
  collapsed,
  draftTitle,
  editing,
  node,
  onCancelRename,
  onDraftTitle,
  onMoveDown,
  onMoveUp,
  onStartRename,
  onSubmitRename,
  onToggle
}: CdCardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id: node.id });

  return (
    <section className={`cd-card${isOver ? " is-over" : ""}`}>
      <header className="cd-card__head" ref={setNodeRef}>
        <div className="cd-card__moves">
          <button
            aria-label={`上移 ${node.title}`}
            className="cd-card__move"
            disabled={busy || !canMoveUp}
            onClick={onMoveUp}
            type="button"
          >
            ▲
          </button>
          <button
            aria-label={`下移 ${node.title}`}
            className="cd-card__move"
            disabled={busy || !canMoveDown}
            onClick={onMoveDown}
            type="button"
          >
            ▼
          </button>
        </div>

        {node.coverPath ? (
          <img
            alt={`${node.title} 封面`}
            className="cd-card__cover"
            src={createCoverMediaUrl(node.coverPath)}
            title="封面取自该 CD 的第一首歌；点歌曲行的「封面」可替换"
          />
        ) : (
          <span
            aria-label="封面取自该 CD 的第一首歌；点歌曲行的「封面」可替换"
            className="cd-card__cover is-empty"
            role="img"
            title="封面取自该 CD 的第一首歌；点歌曲行的「封面」可替换"
          >
            CD
          </span>
        )}

        <div className="cd-card__meta">
          {editing ? (
            <input
              aria-label={`CD 名 ${node.title}`}
              autoFocus
              className="cd-card__name-input"
              onBlur={onSubmitRename}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              onChange={(event) => {
                onDraftTitle(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              value={draftTitle}
            />
          ) : (
            <button className="cd-card__name" onClick={onStartRename} title="点击改名" type="button">
              {node.title}
            </button>
          )}
          <span className="cd-card__sub">
            {node.solo ? "单曲 CD" : node.artist} · {node.tracks.length} 首
          </span>
        </div>

        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? `展开 ${node.title}` : `折叠 ${node.title}`}
          className="cd-card__toggle"
          onClick={onToggle}
          type="button"
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </header>

      {collapsed ? null : <div className="cd-card__body">{children}</div>}
    </section>
  );
};

/* ---------- 曲目管理 ---------- */

export const TrackManager = ({
  batchBusy,
  busyTrackId,
  cdOrder,
  error,
  groups,
  onApply,
  onCover,
  onDelete,
  onRename,
  onReorderCds,
  tracks
}: TrackManagerProps) => {
  const baseNodes = useMemo(() => buildNodes(groups, tracks), [groups, tracks]);
  const [dragNodes, setDragNodes] = useState<readonly CdNode[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [editingCdId, setEditingCdId] = useState<string | null>(null);
  const [draftCdTitle, setDraftCdTitle] = useState("");
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [draftTrackTitle, setDraftTrackTitle] = useState("");
  const [confirmTrackId, setConfirmTrackId] = useState<string | null>(null);
  const renameGuard = useRef(false);

  const nodes = dragNodes ?? baseNodes;
  const activeTrack = activeId
    ? nodes.flatMap((node) => node.tracks).find((track) => track.id === activeId) ?? null
    : null;
  const busy = batchBusy;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const commitNodes = async (next: readonly CdNode[]): Promise<boolean> => {
    const { edits, remap } = buildCdEdits(next, baseNodes);

    if (edits.length === 0) {
      return true;
    }

    const ok = await onApply(edits);

    if (ok && remap.size > 0 && cdOrder.length > 0) {
      onReorderCds(
        cdOrder.map((id) => remap.get(id) ?? id),
        false
      );
    }

    return ok;
  };

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id));
    setDragNodes(baseNodes.map((node) => ({ ...node, tracks: [...node.tracks] })));
  };

  const handleDragOver = (event: DragOverEvent): void => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeTrackId = String(active.id);
    const overId = String(over.id);

    setDragNodes((current) => {
      if (!current) {
        return current;
      }

      const fromId = findContainer(activeTrackId, current);

      if (!fromId) {
        return current;
      }

      const overContainer = findContainer(overId, current);

      if (overId === SOLO_ZONE_ID) {
        const fromNode = current.find((node) => node.id === fromId);

        if (!fromNode || fromNode.solo) {
          return current;
        }

        return moveTrack(current, activeTrackId, `${SOLO_PREFIX}${activeTrackId}`, 0);
      }

      if (!overContainer) {
        // 落在 CD 卡片头部：追加到该 CD 末尾。
        return overId === fromId ? current : moveTrack(current, activeTrackId, overId, Number.MAX_SAFE_INTEGER);
      }

      if (overContainer === fromId) {
        return current;
      }

      const target = current.find((node) => node.id === overContainer);
      const index = target?.tracks.findIndex((track) => track.id === overId) ?? 0;

      return moveTrack(current, activeTrackId, overContainer, index < 0 ? Number.MAX_SAFE_INTEGER : index);
    });
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    const current = dragNodes;

    setActiveId(null);
    setDragNodes(null);

    if (!current || !over) {
      return;
    }

    const activeTrackId = String(active.id);
    const overId = String(over.id);
    const containerId = findContainer(activeTrackId, current);
    const overContainerId = findContainer(overId, current);
    let next = current;

    if (containerId && overContainerId && containerId === overContainerId) {
      const nodeIndex = next.findIndex((node) => node.id === containerId);
      const node = next[nodeIndex];
      const oldIndex = node?.tracks.findIndex((track) => track.id === activeTrackId) ?? -1;
      const newIndex = node?.tracks.findIndex((track) => track.id === overId) ?? -1;

      if (node && oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        next = next.map((candidate, index) =>
          index === nodeIndex
            ? { ...candidate, tracks: arrayMove([...candidate.tracks], oldIndex, newIndex) }
            : candidate
        );
      }
    }

    void commitNodes(next);
  };

  const startRenameCd = (node: CdNode): void => {
    setEditingTrackId(null);
    setEditingCdId(node.id);
    setDraftCdTitle(node.title);
  };

  const submitRenameCd = async (nodeId: string): Promise<void> => {
    if (renameGuard.current) {
      return;
    }

    const node = nodes.find((candidate) => candidate.id === nodeId);
    const title = draftCdTitle.trim();

    setEditingCdId(null);

    if (!node || title.length === 0 || title === node.title) {
      return;
    }

    renameGuard.current = true;

    try {
      await commitNodes(nodes.map((candidate) => (candidate.id === nodeId ? { ...candidate, title } : candidate)));
    } finally {
      renameGuard.current = false;
    }
  };

  const startRenameTrack = (track: Track): void => {
    setConfirmTrackId(null);
    setEditingCdId(null);
    setEditingTrackId(track.id);
    setDraftTrackTitle(track.title);
  };

  const submitRenameTrack = async (track: Track): Promise<void> => {
    const title = draftTrackTitle.trim();

    setEditingTrackId(null);

    if (title.length === 0 || title === track.title) {
      return;
    }

    await onRename(track.id, title);
  };

  const moveCd = (index: number, delta: number): void => {
    const target = index + delta;

    if (target < 0 || target >= nodes.length) {
      return;
    }

    const ids = nodes.map((node) => node.id);
    const [moved] = ids.splice(index, 1);

    if (!moved) {
      return;
    }

    ids.splice(target, 0, moved);
    onReorderCds(ids, true);
  };

  const toggleCollapsed = (nodeId: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  };

  if (tracks.length === 0) {
    return <p className="manage-dialog__empty">曲库还是空的，先在设置里导入音乐。</p>;
  }

  return (
    <div className="cd-manager">
      {error ? (
        <p className="library-import__status is-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="cd-manager__hint">
        拖动歌曲行左侧的 ⋮ 可以把歌并进别的 CD，或拖到右侧拆成单曲 CD；点 CD 名 / 歌名直接改。
        CD 封面取自该 CD 的第一首歌，想换封面就给第一首点「封面」。
      </p>

      <DndContext
        collisionDetection={closestCenter}
        onDragCancel={() => {
          setActiveId(null);
          setDragNodes(null);
        }}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="cd-manager__layout">
          <div className="cd-manager__list">
          {nodes.map((node, index) => {
            const isCollapsed = collapsed.has(node.id);

            return (
              <CdCard
                busy={busy}
                canMoveDown={index < nodes.length - 1}
                canMoveUp={index > 0}
                collapsed={isCollapsed}
                draftTitle={draftCdTitle}
                editing={editingCdId === node.id}
                key={node.id}
                node={node}
                onCancelRename={() => {
                  setEditingCdId(null);
                }}
                onDraftTitle={setDraftCdTitle}
                onMoveDown={() => {
                  moveCd(index, 1);
                }}
                onMoveUp={() => {
                  moveCd(index, -1);
                }}
                onStartRename={() => {
                  startRenameCd(node);
                }}
                onSubmitRename={() => {
                  void submitRenameCd(node.id);
                }}
                onToggle={() => {
                  toggleCollapsed(node.id);
                }}
              >
                <SortableContext
                  items={node.tracks.map((track) => track.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="cd-card__songs">
                    {node.tracks.map((track, trackIndex) => (
                      <SongRow
                        busy={busy || busyTrackId === track.id}
                        confirming={confirmTrackId === track.id}
                        draftTitle={draftTrackTitle}
                        editing={editingTrackId === track.id}
                        index={trackIndex}
                        key={track.id}
                        onCancelEdit={() => {
                          setEditingTrackId(null);
                          setConfirmTrackId(null);
                        }}
                        onConfirmDelete={() => {
                          setConfirmTrackId(null);
                          void onDelete(track.id);
                        }}
                        onCover={() => {
                          void onCover(track.id);
                        }}
                        onDelete={() => {
                          setConfirmTrackId(track.id);
                        }}
                        onDraftTitle={setDraftTrackTitle}
                        onStartEdit={() => {
                          startRenameTrack(track);
                        }}
                        onSubmitEdit={() => {
                          void submitRenameTrack(track);
                        }}
                        pending={busyTrackId === track.id}
                        track={track}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </CdCard>
            );
          })}
          </div>

          <SoloZone />
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTrack ? (
            <div className="cd-song cd-song--overlay">
              <span className="cd-song__handle" aria-hidden="true">
                ⋮
              </span>
              <span className="cd-song__title">{activeTrack.title}</span>
              <span className="cd-song__artist">{activeTrack.artist}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

const SoloZone = () => {
  const { isOver, setNodeRef } = useDroppable({ id: SOLO_ZONE_ID });

  return (
    <div className={`cd-solo-zone${isOver ? " is-over" : ""}`} ref={setNodeRef}>
      <span aria-hidden="true" className="cd-solo-zone__icon">
        →
      </span>
      <span className="cd-solo-zone__label">拖到这里 · 变成单曲 CD</span>
    </div>
  );
};
