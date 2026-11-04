import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  formatBitDepth,
  formatDuration,
  formatSampleRate,
  getAudioFormatLabel,
  getQualityLabel,
  type PlaybackMode,
  type Track
} from "@arlt-hifi/shared";
import { usePlayerStore } from "../store/player-store";
import type { TurntableTransport } from "../scene/turntable-interaction";

const MODES: readonly { label: string; value: PlaybackMode }[] = [
  { label: "顺序", value: "sequential" },
  { label: "循环", value: "loop" },
  { label: "随机", value: "shuffle" }
];

const PlayIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M8 5.5 19 12 8 18.5Z" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const PreviousIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M7 5v14M18 6l-8 6 8 6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
  </svg>
);

const NextIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M17 5v14M6 6l8 6-8 6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
  </svg>
);

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export interface DetailPlayerProps {
  readonly onPlayPause: () => void;
  readonly tracks: readonly Track[];
  readonly transport: TurntableTransport;
}

/**
 * 详情页左下角的 now playing 条：
 * CD 放上转盘后出现，替换原本的专辑 caption；是否出声由唱臂决定。
 */
export const DetailPlayer = ({ onPlayPause, tracks, transport }: DetailPlayerProps) => {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const status = usePlayerStore((state) => state.status);
  const positionSeconds = usePlayerStore((state) => state.positionSeconds);
  const durationSeconds = usePlayerStore((state) => state.durationSeconds);
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const nextTrack = usePlayerStore((state) => state.nextTrack);
  const previousTrack = usePlayerStore((state) => state.previousTrack);
  const seekTo = usePlayerStore((state) => state.seekTo);
  const setPlaybackMode = usePlayerStore((state) => state.setPlaybackMode);
  const progressRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const displayTrack =
    currentTrack && tracks.some((track) => track.id === currentTrack.id) ? currentTrack : tracks[0] ?? null;

  if (!displayTrack) {
    return null;
  }

  const index = tracks.findIndex((track) => track.id === displayTrack.id);
  const isCurrentTrack = currentTrack?.id === displayTrack.id;
  const duration = isCurrentTrack && durationSeconds > 0 ? durationSeconds : displayTrack.durationSeconds;
  const position = isCurrentTrack ? clamp(positionSeconds, 0, duration) : 0;
  const progress = duration > 0 ? position / duration : 0;
  const percent = `${Math.min(100, Math.max(0, progress * 100))}%`;
  const isPlaying = status === "playing";
  const stateLabel = transport.spinning
    ? transport.armDown
      ? isPlaying
        ? "NOW PLAYING"
        : "PAUSED"
      : "SPINNING"
    : transport.armDown
      ? "PAUSED"
      : "READY";
  const nextDisabled = playbackMode === "sequential" && tracks.length > 1 && index >= tracks.length - 1;
  const quality = getQualityLabel(displayTrack.quality);

  const seekFromPointer = (clientX: number): void => {
    const element = progressRef.current;

    if (!element || duration <= 0) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * duration);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (duration <= 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    seekFromPointer(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragging) {
      return;
    }

    seekFromPointer(event.clientX);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    setDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleProgressKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 10 : 5;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        seekTo(position - step);
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        seekTo(position + step);
        break;
      case "Home":
        event.preventDefault();
        seekTo(0);
        break;
      case "End":
        event.preventDefault();
        seekTo(duration);
        break;
      default:
        break;
    }
  };

  return (
    <section
      aria-label="正在播放"
      className="detail-player"
      data-dragging={dragging ? "true" : "false"}
      data-state={isPlaying && transport.spinning && transport.armDown ? "playing" : "paused"}
    >
      <div className="detail-player__top">
        <p className="detail-player__state">
          <span aria-hidden="true" className="detail-player__dot" />
          {stateLabel}
        </p>
        <p aria-label="音频参数" className="detail-player__params">
          <span>{getAudioFormatLabel(displayTrack.filePath)}</span>
          <span>{formatSampleRate(displayTrack.sampleRateHz)}</span>
          <span>{formatBitDepth(displayTrack.bitDepth)}</span>
          <span className="detail-player__quality">{quality}</span>
        </p>
      </div>

      <p aria-live="polite" className="detail-player__title" title={displayTrack.title}>
        {displayTrack.title}
      </p>
      <p className="detail-player__meta">
        {displayTrack.artist} · {displayTrack.album}
      </p>

      <div className="detail-player__timeline">
        <span className="detail-player__time">{formatDuration(position)}</span>
        <div
          aria-disabled={duration <= 0}
          aria-label="播放进度"
          aria-valuemax={Math.max(0, Math.floor(duration))}
          aria-valuemin={0}
          aria-valuenow={Math.floor(position)}
          aria-valuetext={`${formatDuration(position)} / ${formatDuration(duration)}`}
          className={`detail-player__progress${dragging ? " is-dragging" : ""}`}
          onKeyDown={handleProgressKeyDown}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          ref={progressRef}
          role="slider"
          tabIndex={0}
        >
          <span className="detail-player__rail" />
          <span className="detail-player__fill" style={{ width: percent }} />
          <span className="detail-player__knob" style={{ left: percent }} />
        </div>
        <span className="detail-player__time">{formatDuration(duration)}</span>
      </div>

      <div className="detail-player__transport">
        <div className="detail-player__buttons">
          <button
            aria-label="上一首"
            className="detail-player__button"
            onClick={previousTrack}
            title="上一首"
            type="button"
          >
            <PreviousIcon />
          </button>
          <button
            aria-label={isPlaying ? "暂停" : "播放"}
            className="detail-player__button detail-player__button--play"
            onClick={onPlayPause}
            title={isPlaying ? "暂停" : "播放"}
            type="button"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            aria-disabled={nextDisabled}
            aria-label="下一首"
            className="detail-player__button"
            disabled={nextDisabled}
            onClick={nextTrack}
            title={nextDisabled ? "已经是最后一首" : "下一首"}
            type="button"
          >
            <NextIcon />
          </button>
        </div>

        <div aria-label="播放模式" className="detail-player__modes" role="group">
          {MODES.map((mode) => (
            <button
              aria-pressed={playbackMode === mode.value}
              className={`detail-player__mode${playbackMode === mode.value ? " is-active" : ""}`}
              key={mode.value}
              onClick={() => {
                setPlaybackMode(mode.value);
              }}
              type="button"
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
