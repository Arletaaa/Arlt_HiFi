import { Suspense, lazy, useEffect, useState } from "react";
import type { Track } from "@arlt-hifi/shared";
import type { GalleryGroup } from "../lib/album-groups";
import { dismissBootScreen } from "../boot-screen";
import { sceneStats, useFrameRateSample } from "./perf";
import type { ScenePhase } from "./scene-transition";
import { isWebGL2Available } from "./webgl";

const GalleryExperience = lazy(() =>
  import("./gallery-stage").then((module) => ({ default: module.GalleryExperience }))
);

export interface SceneStageProps {
  readonly currentTrackId: string | null;
  readonly focusGroupId: string | null;
  readonly focusNonce: number;
  readonly groups: readonly GalleryGroup[];
  readonly onPhaseChange: (phase: ScenePhase) => void;
  readonly tracks: readonly Track[];
}

export const SceneStage = ({
  currentTrackId,
  focusGroupId,
  focusNonce,
  groups,
  onPhaseChange,
  tracks
}: SceneStageProps) => {
  const [supported] = useState<boolean>(() => isWebGL2Available());
  const [showPerf] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("perf") === "1"
  );
  const sample = useFrameRateSample();

  // 没有 WebGL2 时不会再有场景首帧回调，直接撤掉启动画面露出说明文字。
  useEffect(() => {
    if (!supported) {
      dismissBootScreen();
    }
  }, [supported]);

  return (
    <div className="scene-stage">
      <div className="scene-stage__viewport">
        {supported ? (
          <Suspense fallback={null}>
            <GalleryExperience
              currentTrackId={currentTrackId}
              focusGroupId={focusGroupId}
              focusNonce={focusNonce}
              groups={groups}
              onPhaseChange={onPhaseChange}
              tracks={tracks}
            />
          </Suspense>
        ) : (
          <div className="scene-stage__fallback">
            <h1 className="scene-stage__fallback-title">无法启用 3D 场景</h1>
            <p className="scene-stage__fallback-copy">当前环境不支持 WebGL2，无法显示 3D 画廊。</p>
          </div>
        )}
      </div>

      {showPerf ? (
        <div className="scene-stage__perf" aria-hidden="true">
          <span>{sample.fps} fps</span>
          <span>{sample.rendersPerSecond} render/s</span>
          <span>{sceneStats.calls} calls</span>
          <span>{sceneStats.triangles} tri</span>
        </div>
      ) : null}
    </div>
  );
};
