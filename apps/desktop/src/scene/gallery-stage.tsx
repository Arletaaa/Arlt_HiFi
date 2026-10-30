import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Group, MathUtils, Mesh, PMREMGenerator, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Track } from "@arlhifi/shared";
import type { GalleryGroup } from "../lib/album-groups";
import { getSeedHue } from "../lib/seed";
import { normalizeLightPreset } from "../lib/light-presets";
import { buildCaseModel, CASE_MODEL_URL } from "./case-model";
import { CaseDetail } from "./case-detail";
import { Turntable } from "./turntable";
import { createTurntableBridge, TURNTABLE_MODEL_URL } from "./turntable-interaction";
import type { TurntableTransport } from "./turntable-interaction";
import { ContactShadow } from "./contact-shadows";
import { useCoverTexture } from "./cover-textures";
import { countRenderedFrame, sceneStats } from "./perf";
import { useSettingsStore } from "../store/settings-store";
import { usePlayerStore } from "../store/player-store";
import { VolumeRing } from "../components/volume-ring";
import { DetailPlayer } from "../components/detail-player";
import { LightEffects, SceneLighting } from "./light-effects";
import {
  ENTER_SECONDS,
  RETURN_SECONDS,
  cameraPose,
  clamp01
} from "./scene-transition";
import type { ScenePhase } from "./scene-transition";

// 唱片机模型 6 MB 左右：场景一挂载就预载，避免第一次进交互区出现黑屏。
useLoader.preload(GLTFLoader, TURNTABLE_MODEL_URL);

/** 程序化环境贴图：透明/金属材质需要可反射的周围环境，否则会是死黑。 */
const ProceduralEnvironment = () => {
  const { gl, scene } = useThree();

  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const environment = generator.fromScene(new RoomEnvironment(), 0.04);

    scene.environment = environment.texture;
    scene.environmentIntensity = 0.4;

    return () => {
      scene.environment = null;
      environment.dispose();
      generator.dispose();
    };
  }, [gl, scene]);

  return null;
};

interface CameraRigProps {
  readonly onEntered: () => void;
  readonly onReturned: () => void;
  readonly phase: ScenePhase;
  readonly startedAt: number;
}

/** 唯一相机的时间轴：陈列 → 交互、交互 → 陈列。 */
const CameraRig = ({ onEntered, onReturned, phase, startedAt }: CameraRigProps) => {
  const camera = useThree((state) => state.camera);
  const entered = useRef(false);
  const returned = useRef(false);

  useFrame(() => {
    const now = performance.now();
    let progress = 0;

    if (phase === "entering") {
      progress = clamp01((now - startedAt) / 1000 / ENTER_SECONDS);
    } else if (phase === "returning") {
      progress = clamp01((now - startedAt) / 1000 / RETURN_SECONDS);
    } else if (phase !== "gallery") {
      progress = 1;
    }

    const pose = cameraPose(phase, progress);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);

    if (phase === "entering" && progress >= 1 && !entered.current) {
      entered.current = true;
      onEntered();
    }

    if (phase !== "entering") {
      entered.current = false;
    }

    if (phase === "returning" && progress >= 1 && !returned.current) {
      returned.current = true;
      onReturned();
    }

    if (phase !== "returning") {
      returned.current = false;
    }
  });

  return null;
};

const GAP = 0.80;
const BASE_Y = 1.30;
const CAMERA_POSITION: readonly [number, number, number] = [0, 1.78, 3.95];
const LOOK_AT: readonly [number, number, number] = [0, 1.30, 0];

/** 编辑体色板：低饱和、成套，避免随机彩虹色。 */
const PALETTE = ["#c96f5a", "#8fa7b8", "#31506b", "#8a9a52", "#c8a06a", "#8c6b86", "#9fb0b8", "#a8563f"];

const tintOf = (id: string): string => PALETTE[getSeedHue(id) % PALETTE.length] ?? PALETTE[0] ?? "#c96f5a";
const VISIBLE = 7;

/** 越界拖动时的阻尼系数：只跟手 30%，松手后回弹到列表边界。 */
const rubberBand = (value: number, min: number, max: number): number => {
  if (value > max) {
    return max + (value - max) * 0.3;
  }

  if (value < min) {
    return min + (value - min) * 0.3;
  }

  return value;
};

/** 台面顶面（BASE_Y - 0.26）上方 1.5mm：接触阴影贴片的位置。 */
const CONTACT_SHADOW_Y = -0.2585;

/* ---------- 单张 CD ---------- */

interface DiscProps {
  readonly coverPath: string | null;
  readonly highlighted?: boolean;
  readonly id: string;
  readonly isCurrent: boolean;
  readonly onPointerOverAction?: () => void;
  readonly onSelect: () => void;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
}

/** 透明宝石盒（Sketchfab "CD Jewel Case"，作者 蓝人组合，CC-BY 4.0）。 */
const CaseModel = ({ coverTexture, tint }: { readonly coverTexture: Texture | null; readonly tint: string }) => {
  const { scene } = useLoader(GLTFLoader, CASE_MODEL_URL);
  const mergeShell = useMemo(() => new URLSearchParams(window.location.search).get("merge") === "1", []);
  const built = useMemo(() => buildCaseModel(scene, coverTexture, tint, 0.52, false, true, mergeShell), [coverTexture, mergeShell, scene, tint]);

  return <primitive object={built.root} />;
};
const Disc = ({
  coverPath,
  highlighted = false,
  id,
  isCurrent,
  onPointerOverAction,
  onSelect,
  position,
  rotationY
}: DiscProps) => {
  const texture = useCoverTexture(coverPath);
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<Mesh>(null);
  const tint = tintOf(id);

  useFrame((_frame, delta) => {
    const group = groupRef.current;

    if (!group) {
      return;
    }

    const damping = 1 - Math.pow(0.0001, Math.min(delta, 0.1));

    // 搜索命中后"抽出"：比 hover 推得更前、抬得更高，随后自动收回。
    group.position.z = MathUtils.lerp(group.position.z, highlighted ? 0.16 : hovered ? 0.07 : 0, damping);
    group.rotation.y = MathUtils.lerp(group.rotation.y, highlighted ? 0.24 : hovered ? 0.18 : 0, damping);
    group.scale.setScalar(MathUtils.lerp(group.scale.x, highlighted ? 1.06 : 1, damping));
  });

  return (
    <group position={[position[0], position[1], position[2]]} rotation={[0, rotationY, 0]}>
      <ContactShadow depth={0.3} width={0.68} y={CONTACT_SHADOW_Y} />
      <mesh
        castShadow
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOut={() => {
          setHovered(false);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          onPointerOverAction?.();
        }}
        ref={groupRef}
      >
        <CaseModel coverTexture={texture} tint={tint} />


        {isCurrent ? (
          <mesh position={[0, -0.3, 0.045]}>
            <planeGeometry args={[0.3, 0.008]} />
            <meshBasicMaterial color="#ff7aa8" toneMapped={false} />
          </mesh>
        ) : null}
      </mesh>
    </group>
  );
};
/* ---------- 展架 ---------- */

/** 墙面墙皮（Fabric028，CC0）。 */
const WallSurface = () => {
  const preset = useSettingsStore((state) => state.scenePreset);
  const map = useLoader(TextureLoader, `/textures/wall/${preset.wall}-color.jpg`);

  useEffect(() => {
    map.anisotropy = 8;
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    map.repeat.set(26, 3.55);
    map.colorSpace = SRGBColorSpace;
    map.needsUpdate = true;
  }, [map]);

  return (
    <meshStandardMaterial
      color="#9d9186"
      map={map}
      metalness={0.02}
      roughness={0.92}
    />
  );
};


/**
 * 唯一的一面墙：陈列与交互共用，全程不消失。
 * 加高到 5.5m 是为了交互机位（z=6.2，仰视到 y=3.2）也在墙内，不露出墙顶外的空背景。
 */
const BackWall = () => (
  <mesh position={[0, 2.9, -0.34]} receiveShadow>
    <boxGeometry args={[40, 5.5, 0.08]} />
    <WallSurface />
  </mesh>
);

/** 柜体立面（Wood008 竖纹，CC0）。 */
const CabinetSurface = () => {
  const preset = useSettingsStore((state) => state.scenePreset);
  const map = useLoader(TextureLoader, `/textures/base/${preset.base}-color.jpg`);

  useEffect(() => {
    map.anisotropy = 8;
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    // 柜体 40 × 1.2，格子 2m；竖纹材质直接映射为竖向
    map.repeat.set(20, 0.6);
    map.colorSpace = SRGBColorSpace;
    map.needsUpdate = true;
  }, [map]);

  return (
    <meshStandardMaterial
      color="#c2b09a"
      map={map}
      metalness={0.05}
      roughness={0.7}
    />
  );
};

/** 台面：真实木纹贴图（ambientCG Wood066，CC0）。 */
const DeskSurface = () => {
  const preset = useSettingsStore((state) => state.scenePreset);
  const map = useLoader(TextureLoader, `/textures/table/${preset.table}-color.jpg`);

  useEffect(() => {
    map.anisotropy = 8;
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    // 台面 40 × 0.62，格子 2m；横向木纹沿台面长边
    map.repeat.set(20, 0.31);
    map.colorSpace = SRGBColorSpace;
    map.needsUpdate = true;
  }, [map]);

  return (
    <mesh castShadow position={[0, BASE_Y - 0.32, 0.05]} receiveShadow>
      <boxGeometry args={[40, 0.12, 0.62]} />
      <meshStandardMaterial
        map={map}
        metalness={0.04}
        roughness={0.72}
      />
    </mesh>
  );
};

const Shelf = () => (
  <group>
    {/* 台面：真实木纹 */}
    <DeskSurface />
    <mesh position={[0, BASE_Y - 0.26, 0.36]}>
      <boxGeometry args={[40, 0.02, 0.02]} />
      <meshStandardMaterial color="#c89a68" metalness={0.2} roughness={0.4} emissive="#3a2413" emissiveIntensity={0.4} />
    </mesh>
    {/* 台面下方深色立面 */}
    <mesh position={[0, BASE_Y - 0.95, 0.2]} receiveShadow>
      <boxGeometry args={[40, 1.2, 0.08]} />
      <CabinetSurface />
    </mesh>
  </group>
);

/* ---------- 横向单排 + 无限循环 ---------- */


/** 把渲染器统计写进 sceneStats，并把已绘制帧数交给帧率采样器。 */
const FrameProbe = () => {
  const gl = useThree((state) => state.gl);

  useFrame(() => {
    sceneStats.calls = gl.info.render.calls;
    sceneStats.triangles = gl.info.render.triangles;
    countRenderedFrame();
  });

  return null;
};
const Carousel = ({
  groups,
  currentGroupId,
  focusIndex,
  focusNonce,
  hiddenGroupId,
  highlightedGroupId,
  interactive,
  onHover,
  onOpen,
  scrollRef
}: {
  readonly currentGroupId: string | null;
  readonly focusIndex: number;
  readonly focusNonce: number;
  readonly groups: readonly GalleryGroup[];
  readonly hiddenGroupId: string | null;
  readonly highlightedGroupId: string | null;
  readonly interactive: boolean;
  readonly onHover: (label: string | null) => void;
  readonly onOpen: (group: GalleryGroup, slotX: number) => void;
  readonly scrollRef: { current: number };
}) => {
  const { gl, invalidate } = useThree();
  const lastScroll = useRef(0);
  const trackRef = useRef<Group>(null);
  const total = groups.length;
  const minOffset = -Math.max(0, total - 1) * GAP;
  const maxOffset = 0;

  const state = useRef({ dragging: false, lastX: 0, offset: 0, target: 0, velocity: 0 });

  // 搜索命中：把目标槽位滑到正中，不改相机。
  useEffect(() => {
    if (focusIndex < 0) {
      return;
    }

    const pointer = state.current;
    const desired = MathUtils.clamp(-focusIndex * GAP, minOffset, maxOffset);

    pointer.target = desired;
    pointer.velocity = 0;
    invalidate();
  }, [focusIndex, focusNonce, invalidate, maxOffset, minOffset]);

  // 曲库数量变化时，把当前位移收敛回可滑动区间。
  useEffect(() => {
    const pointer = state.current;

    pointer.offset = MathUtils.clamp(pointer.offset, minOffset, maxOffset);
    pointer.target = MathUtils.clamp(pointer.target, minOffset, maxOffset);
    invalidate();
  }, [invalidate, maxOffset, minOffset]);

  useEffect(() => {
    const element = gl.domElement;
    const pointer = state.current;

    const handlePointerDown = (event: PointerEvent): void => {
      if (!interactive) {
        return;
      }

      pointer.dragging = true;
      pointer.lastX = event.clientX;
      pointer.velocity = 0;
      element.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (!interactive || !pointer.dragging) {
        return;
      }

      const deltaX = event.clientX - pointer.lastX;
      pointer.lastX = event.clientX;
      pointer.target = rubberBand(pointer.target + deltaX * 0.006, minOffset, maxOffset);
      pointer.velocity = deltaX * 0.006;
      invalidate();
    };

    const handlePointerUp = (event: PointerEvent): void => {
      pointer.dragging = false;

      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    const handleWheel = (event: WheelEvent): void => {
      if (!interactive) {
        return;
      }

      event.preventDefault();
      pointer.target = rubberBand(
        pointer.target - Math.sign(event.deltaY || event.deltaX) * GAP,
        minOffset,
        maxOffset
      );
      pointer.velocity = 0;
      invalidate();
    };

    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", handlePointerUp);
    element.addEventListener("pointercancel", handlePointerUp);
    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerup", handlePointerUp);
      element.removeEventListener("pointercancel", handlePointerUp);
      element.removeEventListener("wheel", handleWheel);
    };
  }, [gl, interactive, invalidate, maxOffset, minOffset]);

  useFrame((_frame, delta) => {
    const pointer = state.current;
    const damping = 1 - Math.pow(0.0001, Math.min(delta, 0.1));

    if (!pointer.dragging) {
      // 惯性 + 吸附到最近一张，并收敛到列表边界内。
      pointer.target += pointer.velocity;
      pointer.velocity *= 0.9;
      pointer.target = MathUtils.clamp(Math.round(pointer.target / GAP) * GAP, minOffset, maxOffset);
    }

    if (scrollRef.current !== lastScroll.current) {
      pointer.target = MathUtils.clamp(
        pointer.target + (scrollRef.current - lastScroll.current) * GAP,
        minOffset,
        maxOffset
      );
      lastScroll.current = scrollRef.current;
      invalidate();
    }

    pointer.offset = MathUtils.lerp(pointer.offset, pointer.target, damping);

    // 关键：位移在 useFrame 里直接写到 Object3D 上。
    // 之前用 state 算位置、只在 React 重渲染时更新，导致拖动时画面一顿一顿。
    const track = trackRef.current;

    if (track) {
      for (let index = 0; index < track.children.length; index += 1) {
        const child = track.children[index];

        if (!child) {
          continue;
        }

        const group = groups[index];
        const selected = group?.id === hiddenGroupId;
        const x = index * GAP + pointer.offset;

        child.position.x = x;
        child.visible = !selected && Math.abs(x) <= GAP * (VISIBLE + 1);
      }
    }

    if (Math.abs(pointer.offset - pointer.target) > 0.0005 || Math.abs(pointer.velocity) > 0.0005) {
      invalidate();
    }
  });

  return (
    <group>
      <Shelf />
      <group ref={trackRef}>
        {groups.map((group, index) => (
          <Disc
            coverPath={group.coverPath}
            highlighted={group.id === highlightedGroupId}
            id={group.id}
            isCurrent={group.id === currentGroupId}
            key={group.id}
            onPointerOverAction={() => {
              onHover(`${group.artist} · ${group.title}`);
            }}
            onSelect={() => {
              if (interactive) {
                onOpen(group, index * GAP + state.current.offset);
              }
            }}
            position={[0, BASE_Y, 0]}
            rotationY={0}
          />
        ))}
      </group>
    </group>
  );
};

/* ---------- 组装 ---------- */

export interface GalleryExperienceProps {
  readonly currentTrackId: string | null;
  readonly focusGroupId: string | null;
  readonly focusNonce: number;
  readonly groups: readonly GalleryGroup[];
  readonly tracks: readonly Track[];
}

export const GalleryExperience = ({
  currentTrackId,
  focusGroupId,
  focusNonce,
  groups,
  tracks
}: GalleryExperienceProps) => {
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [detailGroup, setDetailGroup] = useState<GalleryGroup | null>(null);
  const [phase, setPhase] = useState<ScenePhase>("gallery");
  const turntableBridge = useMemo(() => createTurntableBridge(), []);
  const [selectedSlotX, setSelectedSlotX] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [transport, setTransport] = useState<TurntableTransport>({
    armDown: false,
    cdSeated: false,
    spinning: false
  });
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);
  const scrollRef = useRef(0);
  const volume = usePlayerStore((state) => state.volume);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const scenePreset = useSettingsStore((state) => state.scenePreset);
  const lightVariant = normalizeLightPreset(scenePreset.light);
  const currentTrack = tracks.find((track) => track.id === currentTrackId) ?? null;
  const detailTracks = useMemo(
    () =>
      detailGroup
        ? detailGroup.trackIds
            .map((trackId) => tracks.find((track) => track.id === trackId))
            .filter((track): track is Track => Boolean(track))
        : [],
    [detailGroup, tracks]
  );
  const currentGroupId = useMemo(() => {
    const group = groups.find((candidate) => currentTrackId !== null && candidate.trackIds.includes(currentTrackId));

    return group?.id ?? null;
  }, [currentTrackId, groups]);
  const detailPlayerVisible = Boolean(
    detailGroup && phase === "detail" && transport.cdSeated && detailTracks.length > 0
  );

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("detail") === "1" && groups.length > 1) {
      setDetailGroup(groups[1] ?? null);
      setPhase("detail");
    }
  }, [groups]);

  // 搜索飞行：无论在哪个层级都回到画廊，定位目标 CD 并让它"抽出"两秒。
  useEffect(() => {
    if (!focusGroupId) {
      return;
    }

    setDetailGroup(null);
    setPhase("gallery");
    setSelectedSlotX(0);
    setHighlightedGroupId(focusGroupId);

    const timer = window.setTimeout(() => {
      setHighlightedGroupId(null);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [focusGroupId, focusNonce]);

  const searchFocusIndex = focusGroupId ? groups.findIndex((group) => group.id === focusGroupId) : -1;
  const focusGroup = groups.find((group) => group.id === currentGroupId) ?? groups[0] ?? null;

  const handleOpen = (group: GalleryGroup, slotX: number): void => {
    if (phase !== "gallery") {
      return;
    }

    setDetailGroup(group);
    setSelectedSlotX(slotX);
    setStartedAt(performance.now());
    setPhase("entering");
    setHoverLabel(null);
  };

  const handleEntered = (): void => {
    setPhase("detail");
  };

  const handleBack = (): void => {
    if (phase === "detail") {
      setPhase("closing");
    }
  };

  const handleClosed = (): void => {
    setStartedAt(performance.now());
    setPhase("returning");
  };

  const handleReturned = (): void => {
    setPhase("gallery");
    setDetailGroup(null);
    setSelectedSlotX(0);
  };

  return (
    <>
      <Canvas
        camera={{ fov: 30, position: [CAMERA_POSITION[0], CAMERA_POSITION[1], CAMERA_POSITION[2]] }}
        dpr={[1, 2]}
        frameloop="always"
        gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 0.95 }}
        shadows
        onCreated={({ camera }) => {
          camera.lookAt(LOOK_AT[0], LOOK_AT[1], LOOK_AT[2]);
        }}
      >
        <ProceduralEnvironment />
        <FrameProbe />
        <SceneLighting variant={lightVariant} />
        <LightEffects variant={lightVariant} />
        <CameraRig
          onEntered={handleEntered}
          onReturned={handleReturned}
          phase={phase}
          startedAt={startedAt}
        />
        <BackWall />
        <Carousel
          currentGroupId={currentGroupId}
          focusIndex={searchFocusIndex}
          focusNonce={focusNonce}
          groups={groups}
          hiddenGroupId={detailGroup?.id ?? null}
          highlightedGroupId={highlightedGroupId}
          interactive={phase === "gallery"}
          onHover={setHoverLabel}
          onOpen={handleOpen}
          scrollRef={scrollRef}
        />
        {detailGroup && phase !== "gallery" ? (
          <>
            <CaseDetail
              bridge={turntableBridge}
              coverPath={detailGroup.coverPath}
              onClosed={handleClosed}
              phase={phase}
              slotX={selectedSlotX}
              startedAt={startedAt}
              tint={tintOf(detailGroup.id)}
            />
            <Suspense fallback={null}>
              <Turntable
                bridge={turntableBridge}
                onTransportChange={setTransport}
                phase={phase}
                tracks={detailTracks}
              />
            </Suspense>
          </>
        ) : null}
      </Canvas>

      {detailGroup && phase === "detail" ? (
        <button
          aria-label="返回展厅"
          className="gallery-detail__back"
          onClick={handleBack}
          type="button"
        >
          ←
        </button>
      ) : null}
      <div className="gallery-meta">
        <span className="gallery-meta__rule" />
        <div>
          <p className="gallery-meta__title">MUSIC COLLECTION</p>
          <p className="gallery-meta__sub">DISCOVER A WORLD OF SOUND</p>
        </div>
      </div>

      <div className="gallery-meta__right">
        <p>EDITION 02 · 2026</p>
        <p>CD · ALBUM · MUSIC</p>
      </div>

      {detailPlayerVisible ? (
        <DetailPlayer
          onPlayPause={() => {
            turntableBridge.toggleStartStop?.();
          }}
          tracks={detailTracks}
          transport={transport}
        />
      ) : (
        <div className="gallery-caption">
          <p className="gallery-caption__name">{focusGroup?.title ?? "CD Collection"}</p>
          <p className="gallery-caption__hint">
            {hoverLabel ?? (focusGroup ? `${focusGroup.artist} · 共 ${groups.length} 张专辑` : "曲库为空 · 右下角设置里可导入音乐")}
          </p>
        </div>
      )}

      {phase === "gallery" ? (
        <div className="gallery-open">
          <button
            aria-label="上一张"
            className="gallery-open__arrow"
            onClick={() => {
              scrollRef.current += 1;
            }}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label="下一张"
            className="gallery-open__arrow"
            onClick={() => {
              scrollRef.current -= 1;
            }}
            type="button"
          >
            ›
          </button>
        </div>
      ) : null}

      {/* 有当前曲目就显示音量环：详情场景里开始播放后也能直接调音量。 */}
      {currentTrack ? <VolumeRing onChange={setVolume} value={volume} /> : null}
    </>
  );
};
