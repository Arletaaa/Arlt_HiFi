import { useFrame, useLoader, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Box3,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildCaseModel, CASE_MODEL_URL } from "./case-model";
import {
  DISC_DRAG_LAMBDA,
  DISC_DRAG_UNITS_PER_PX,
  DISC_HOVER_LAMBDA,
  DISC_LID_LIMIT,
  DISC_LIFT,
  canAccessDisc,
  clampDiscCenter,
  clampDiscOutsideCase,
  discBounds,
  isDiscTouchingCase,
  lidAngleForDrag,
  shouldLiftDisc,
  shouldSnapDisc,
  shouldStartDiscDrag,
  shouldStartLidDrag
} from "./case-interaction";
import { useCoverTexture } from "./cover-textures";
import {
  ENTER_SECONDS,
  INTERACTION_CASE_POSITION,
  RETURN_SECONDS,
  buildClosePlan,
  clamp01,
  closeFrame,
  enterCasePose,
  returnCasePose
} from "./scene-transition";
import type { CasePhase, ClosePlan } from "./scene-transition";
import { cdSeatPose } from "./turntable-interaction";
import type { TurntableBridge } from "./turntable-interaction";

export interface CaseDetailProps {
  readonly bridge: TurntableBridge;
  readonly coverPath: string | null;
  readonly onClosed: () => void;
  readonly phase: CasePhase;
  readonly slotX: number;
  readonly startedAt: number;
  readonly tint: string;
}

type DragMode = "none" | "lid" | "disc";

const IDENTITY_QUATERNION = new Quaternion();
const SNAP_SCREEN_RADIUS = 110;
const SEAT_SECONDS = 0.4;
const SEAT_ARC = 0.3;
const POP_SECONDS = 0.4;
const POP_ARC = 0.3;
const LID_OPEN_FOR_POP_SECONDS = 0.3;
/**
 * 光盘拖出后停在唱片机前方（场景单位，盒子根空间）：
 * 唱片机机身最前缘约 z=1.16，光盘浮在它前面，避免拖拽和吸附时穿模。
 */
const DISC_FRONT_OFFSET = 0.45;

const isWithin = (node: Object3D, parent: Object3D | null): boolean => {
  let current: Object3D | null = node;

  while (current) {
    if (current === parent) {
      return true;
    }

    current = current.parent;
  }

  return false;
};

/**
 * 详情场景：放大的 CD 盒 + 右侧唱片机。
 * - 盒盖右半边向左拖 = 开盖，0–180° 跟手，松手停在原地；
 * - 光盘 hover 时离开卡口，未按住则平滑回位；
 * - 盖子打开到 90° 后才能取盘/放回；光盘移动被限制在铰链线右侧；
 * - 靠近卡口 0.2R 时自动吸附；拖到唱片机转盘附近吸附到盘心；
 * - 播放时不能取盘；返回时按顺序抬臂、回盘、合盖。
 */
export const CaseDetail = ({ bridge, coverPath, onClosed, phase, slotX, startedAt, tint }: CaseDetailProps) => {
  const texture = useCoverTexture(coverPath);
  const { scene } = useLoader(GLTFLoader, CASE_MODEL_URL);
  const { camera, gl } = useThree();
  const built = useMemo(
    () => buildCaseModel(scene, texture, tint, 1.15, true, false, false, true),
    [scene, texture, tint]
  );
  const bounds = useMemo(
    () =>
      built.hinge && built.discHome
        ? discBounds(built.hinge.x, built.discHome.x, built.discHome.y, built.discRadius)
        : null,
    [built.discHome, built.discRadius, built.hinge]
  );
  // 盒面范围（不含打开的盖子）：光盘中心离开这个范围，盖子就可以完全合上。
  const caseBounds = useMemo(() => {
    const wrapper = built.root.children[0];

    return wrapper ? new Box3().setFromObject(wrapper) : null;
  }, [built.root]);

  // 光盘自转枢轴：挂在 discPivot 下，绕盘面法线转。
  const spin = useMemo(() => {
    if (!built.discPivot || !built.cd) {
      return null;
    }

    const spinner = new Group();
    spinner.name = "cd-spin";
    built.discPivot.add(spinner);
    spinner.attach(built.cd);

    return spinner;
  }, [built.cd, built.discPivot]);

  // 盘面外圈贴一层专辑封面：留出中心孔和外沿的空隙。
  const discRadius = useMemo(() => {
    let radius = 0;

    built.cd?.traverse((node) => {
      const mesh = node as Mesh;

      if (mesh.isMesh && mesh.geometry) {
        mesh.geometry.computeBoundingSphere();
        radius = Math.max(radius, mesh.geometry.boundingSphere?.radius ?? 0);
      }
    });

    return radius;
  }, [built.cd]);

  useEffect(() => {
    if (!built.cd || discRadius <= 0) {
      return;
    }

    const geometry = new RingGeometry(discRadius * 0.34, discRadius * 0.86, 96);
    const material = new MeshStandardMaterial({
      color: texture ? "#ffffff" : tint,
      map: texture,
      metalness: 0.05,
      roughness: 0.55,
      side: DoubleSide
    });
    const label = new Mesh(geometry, material);
    label.name = "cd-label";
    label.rotation.x = -Math.PI / 2;
    // 环面 UV 比封面多转了 90°：绕盘面法线顺时针转回来，盘面贴纸才和封面同向。
    label.rotation.z = -Math.PI / 2;
    label.position.y = 0.01;
    built.cd.add(label);

    return () => {
      built.cd?.remove(label);
      geometry.dispose();
      material.dispose();
    };
  }, [built.cd, discRadius, texture, tint]);

  const outerRef = useRef<Group>(null);
  const modelRef = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const pointerInside = useRef(false);
  const pointerNdc = useRef(new Vector2());
  const raycaster = useRef(new Raycaster());
  const lidAngle = useRef(0);
  const discOffset = useRef(new Vector3());
  const discHovered = useRef(false);
  const discHoverLocked = useRef(false);
  const discHeld = useRef(false);
  const discOut = useRef(false);
  const discLift = useRef(0);
  const discOnDeck = useRef(false);
  const drag = useRef({
    mode: "none" as DragMode,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startLid: 0
  });
  const closePlan = useRef<ClosePlan | null>(null);
  const closeStart = useRef(0);
  const closeOffset = useRef(new Vector3());
  const closeReported = useRef(false);
  const seatTween = useRef({
    from: new Vector3(),
    fromQuaternion: new Quaternion(),
    to: new Vector3(),
    toQuaternion: new Quaternion(),
    progress: 1
  });
  const pop = useRef({
    active: false,
    start: 0,
    closeAfter: false,
    waitForStop: false,
    from: new Vector3(),
    fromQuaternion: new Quaternion(),
    to: new Vector3(),
    toQuaternion: new Quaternion()
  });
  const interactive = phase === "detail";

  const seatDisc = (): void => {
    const pivot = built.discPivot;

    if (!pivot) {
      return;
    }

    built.root.updateWorldMatrix(true, false);
    const seat = cdSeatPose(bridge.platterWorld, bridge.platterQuaternion);
    const rootQuaternion = built.root.getWorldQuaternion(new Quaternion());
    seatTween.current.from.copy(pivot.position);
    seatTween.current.fromQuaternion.copy(pivot.quaternion);
    seatTween.current.to.copy(built.root.worldToLocal(seat.position.clone()));
    seatTween.current.toQuaternion
      .copy(rootQuaternion.clone().invert().multiply(seat.quaternion));
    seatTween.current.progress = 0;
    discOnDeck.current = true;
    discOut.current = true;
    discHeld.current = false;
    discHovered.current = false;
    discHoverLocked.current = true;
    drag.current.mode = "none";
    bridge.cdSeated = true;
  };

  /** 纯键盘路径：跳过拖拽，直接把盒中的 CD 吸附到转盘。 */
  useEffect(() => {
    if (phase !== "detail") {
      bridge.placeDiscOnPlatter = null;
      return;
    }

    bridge.placeDiscOnPlatter = () => {
      if (discOnDeck.current || !built.discPivot) {
        return;
      }

      lidAngle.current = Math.PI;
      discOut.current = true;
      seatDisc();
      discOffset.current.set(0, 0, 0);
    };

    return () => {
      bridge.placeDiscOnPlatter = null;
    };
  }, [bridge, phase, seatDisc]);

  /**
   * 点击/按住唱盘上的 CD：按吸附动画的倒放抬起、转正，停在唱片机前方。
   * closeAfter=true 用于返回：转盘停稳后抬起，再交给合盒计划送回卡口。
   */
  const beginPop = (closeAfter = false, waitForStop = false): void => {
    const pivot = built.discPivot;

    if (!pivot || !discOnDeck.current || pop.current.active) {
      return;
    }

    const targetZ = (built.discHome?.z ?? pivot.position.z) + DISC_FRONT_OFFSET;
    pop.current = {
      active: true,
      start: waitForStop ? 0 : performance.now(),
      closeAfter,
      waitForStop,
      from: pivot.position.clone(),
      fromQuaternion: pivot.quaternion.clone(),
      to: new Vector3(pivot.position.x, pivot.position.y, targetZ),
      toQuaternion: IDENTITY_QUATERNION.clone()
    };
    discHeld.current = false;
    discHovered.current = false;
    discHoverLocked.current = true;
    drag.current.mode = "none";
    bridge.cdSeated = false;
  };

  useEffect(() => {
    if (phase !== "closing") {
      closePlan.current = null;
      closeReported.current = false;
      return;
    }

    drag.current.mode = "none";
    discHeld.current = false;
    discHovered.current = false;
    discHoverLocked.current = true;

    if (discOnDeck.current) {
      // 播放中返回：不做减速动画，直接停转并取下 CD。
      beginPop(true);
      return;
    }

    closePlan.current = buildClosePlan(lidAngle.current, discOut.current);
    closeStart.current = performance.now();
    closeOffset.current.copy(discOffset.current);
    closeReported.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const lid = Number(params.get("lid"));

    if (Number.isFinite(lid) && lid > 0) {
      lidAngle.current = Math.min(Math.PI, (lid * Math.PI) / 180);
    }

    if (params.get("disc") === "out" || params.get("disc") === "1") {
      discOut.current = true;
      discOffset.current.set(0.42, 0.34, 0);
    }
  }, []);

  useEffect(() => {
    const element = gl.domElement;

    const clampOffset = (): void => {
      if (!bounds || !built.discHome) {
        return;
      }

      const center = clampDiscCenter(
        built.discHome.x + discOffset.current.x,
        built.discHome.y + discOffset.current.y,
        bounds
      );
      const seated =
        !discOut.current &&
        !discHeld.current &&
        !discHovered.current &&
        discLift.current <= 0.01 &&
        discOffset.current.lengthSq() <= 1e-6;

      if (!seated && caseBounds && lidAngle.current < DISC_LID_LIMIT) {
        // 盖子在安全角以下时，盘沿不能进入盒面。
        const outside = clampDiscOutsideCase(
          center.x,
          center.y,
          built.discRadius,
          {
            minX: caseBounds.min.x,
            maxX: caseBounds.max.x,
            minY: caseBounds.min.y,
            maxY: caseBounds.max.y
          },
          bounds
        );

        discOffset.current.set(
          outside.x - built.discHome.x,
          outside.y - built.discHome.y,
          0
        );
        return;
      }

      discOffset.current.set(center.x - built.discHome.x, center.y - built.discHome.y, 0);
    };

    const snapIfPossible = (): boolean => {
      if (
        !built.discHome ||
        !shouldSnapDisc(
          discOffset.current.x,
          discOffset.current.y,
          built.discRadius,
          canAccessDisc(lidAngle.current)
        )
      ) {
        return false;
      }

      discOffset.current.set(0, 0, 0);
      discOut.current = false;
      discHeld.current = false;
      discHovered.current = false;
      // 鼠标可能还停在光盘上；锁定到离开为止，避免刚吸附又弹出来。
      discHoverLocked.current = true;
      drag.current.mode = "none";

      return true;
    };

    const handleMove = (event: PointerEvent): void => {
      if (phase !== "detail") {
        return;
      }

      pointerInside.current = event.target === element;

      const rect = element.getBoundingClientRect();
      pointer.current.x = Math.min(1, Math.max(-1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      pointer.current.y = Math.min(1, Math.max(-1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));

      if (drag.current.mode === "lid") {
        const seated =
          !discOut.current &&
          !discHeld.current &&
          !discHovered.current &&
          discLift.current <= 0.01 &&
          discOffset.current.lengthSq() <= 1e-6;
        const discCenterX = (built.discHome?.x ?? 0) + discOffset.current.x;
        const discCenterY = (built.discHome?.y ?? 0) + discOffset.current.y;
        const touchingCase = caseBounds
          ? isDiscTouchingCase(discCenterX, discCenterY, built.discRadius, {
              minX: caseBounds.min.x,
              maxX: caseBounds.max.x,
              minY: caseBounds.min.y,
              maxY: caseBounds.max.y
            })
          : true;
        const minAngle =
          !seated && touchingCase && drag.current.startLid >= DISC_LID_LIMIT
            ? DISC_LID_LIMIT
            : 0;

        lidAngle.current = lidAngleForDrag(
          drag.current.startLid,
          event.clientX - drag.current.startX,
          minAngle
        );
      } else if (drag.current.mode === "disc") {
        discOffset.current.x += (event.clientX - drag.current.lastX) * DISC_DRAG_UNITS_PER_PX;
        discOffset.current.y -= (event.clientY - drag.current.lastY) * DISC_DRAG_UNITS_PER_PX;
        drag.current.lastX = event.clientX;
        drag.current.lastY = event.clientY;
        clampOffset();
      }
    };

    const discNearPlatter = (): boolean => {
      if (!built.discPivot || bridge.platterWorld.lengthSq() === 0) {
        return false;
      }

      const seatNdc = bridge.platterWorld.clone().project(camera);
      const discNdc = built.discPivot.getWorldPosition(new Vector3()).project(camera);
      const dx = ((seatNdc.x - discNdc.x) * gl.domElement.clientWidth) / 2;
      const dy = ((seatNdc.y - discNdc.y) * gl.domElement.clientHeight) / 2;

      return Math.hypot(dx, dy) < SNAP_SCREEN_RADIUS;
    };

    const handleUp = (): void => {
      if (phase !== "detail") {
        drag.current.mode = "none";
        return;
      }

      if (drag.current.mode === "disc") {
        discHeld.current = false;

        if (discNearPlatter()) {
          seatDisc();
        } else {
          snapIfPossible();
        }
      }

      drag.current.mode = "none";
    };

    const handleEnter = (): void => {
      pointerInside.current = true;
    };

    const handleLeave = (): void => {
      pointerInside.current = false;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    element.addEventListener("pointerenter", handleEnter);
    element.addEventListener("pointerleave", handleLeave);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      element.removeEventListener("pointerenter", handleEnter);
      element.removeEventListener("pointerleave", handleLeave);
    };
  }, [bounds, built, caseBounds, gl, phase]);

  useFrame((_frame, delta) => {
    const damping = 1 - Math.pow(0.0001, Math.min(delta, 0.1));
    const model = modelRef.current;
    const outer = outerRef.current;
    const now = performance.now();
    const dt = Math.min(delta, 0.1);

    if (outer) {
      if (phase === "entering") {
        const pose = enterCasePose(clamp01((now - startedAt) / 1000 / ENTER_SECONDS), slotX);
        outer.position.set(pose.position[0], pose.position[1], pose.position[2]);
        outer.rotation.x = pose.rotationX;
        outer.rotation.y = pose.rotationY;
        outer.scale.setScalar(pose.scale);
      } else if (phase === "returning") {
        const pose = returnCasePose(clamp01((now - startedAt) / 1000 / RETURN_SECONDS), slotX);
        outer.position.set(pose.position[0], pose.position[1], pose.position[2]);
        outer.rotation.x = pose.rotationX;
        outer.rotation.y = pose.rotationY;
        outer.scale.setScalar(pose.scale);
      } else {
        outer.position.set(INTERACTION_CASE_POSITION[0], INTERACTION_CASE_POSITION[1], INTERACTION_CASE_POSITION[2]);
        outer.rotation.x = 0;
        outer.rotation.y = 0;
        outer.scale.setScalar(1);
      }
    }

    if (model) {
      // 轻微倾斜：只做 ±8°，保证正面对观众；非交互阶段平滑回正。
      // 不能瞬间归零：那会让贴在唱片机上的 CD 跟着根节点闪一下。
      const targetY = interactive ? pointer.current.x * 0.14 : 0;
      const targetX = interactive ? pointer.current.y * -0.09 : 0;
      model.rotation.y = MathUtils.lerp(model.rotation.y, targetY, damping);
      model.rotation.x = MathUtils.lerp(model.rotation.x, targetX, damping);
    }

    if (phase === "closing" && closePlan.current) {
      const frame = closeFrame(closePlan.current, (now - closeStart.current) / 1000);
      lidAngle.current = frame.lidAngle;
      discOffset.current.copy(closeOffset.current).multiplyScalar(1 - frame.discIn);

      if (frame.discIn >= 1) {
        discOffset.current.set(0, 0, 0);
        discOut.current = false;
      }

      if (frame.done) {
        discOut.current = false;
        discHeld.current = false;
        discHovered.current = false;
        discHoverLocked.current = true;

        if (!closeReported.current) {
          closeReported.current = true;
          onClosed();
        }
      }
    }

    if (built.lidPivot) {
      built.lidPivot.rotation.y = -lidAngle.current;
    }

    if (pop.current.active && built.discPivot && built.discHome) {
      // 返回时先把盖子开到 90°。
      if (pop.current.closeAfter && lidAngle.current < Math.PI / 2) {
        lidAngle.current = Math.min(
          Math.PI / 2,
          lidAngle.current + (Math.PI / 2) * (dt / LID_OPEN_FOR_POP_SECONDS)
        );
      }

      if (pop.current.waitForStop) {
        if (!bridge.spinning) {
          pop.current.waitForStop = false;
          pop.current.start = now;
        }
      }

      if (!pop.current.waitForStop) {
        // 吸附动画的倒放：同样时长/弧线，从盘面抬到唱片机前方。
        const t = clamp01((now - pop.current.start) / 1000 / POP_SECONDS);
        built.discPivot.position.lerpVectors(pop.current.from, pop.current.to, t);
        built.discPivot.position.y += Math.sin(Math.PI * t) * POP_ARC;
        built.discPivot.quaternion.slerpQuaternions(
          pop.current.fromQuaternion,
          pop.current.toQuaternion,
          t
        );

        if (spin) {
          spin.rotation.z = bridge.spinAngle;
        }

        if (t >= 1) {
          pop.current.active = false;
          discOnDeck.current = false;
          discOut.current = true;
          discOffset.current.set(
            built.discPivot.position.x - built.discHome.x,
            built.discPivot.position.y - built.discHome.y,
            0
          );

          if (pop.current.closeAfter) {
            closePlan.current = buildClosePlan(lidAngle.current, true);
            closeStart.current = performance.now();
            closeOffset.current.copy(discOffset.current);
            closeReported.current = false;
          }
        }
      }
    } else if (built.discPivot && built.discHome) {
      if (discOnDeck.current) {
        // 盒子的指针倾斜 / 外层转场都会带着 CD 走；每帧从唱盘世界位重新算局部目标。
        // 先更新矩阵，否则会用上一帧的倾斜，转盘减速时 CD 会慢慢漂移。
        built.root.updateWorldMatrix(true, false);
        const seat = cdSeatPose(bridge.platterWorld, bridge.platterQuaternion);
        const rootQuaternion = built.root.getWorldQuaternion(new Quaternion());
        seatTween.current.to.copy(built.root.worldToLocal(seat.position.clone()));
        seatTween.current.toQuaternion
          .copy(rootQuaternion.invert().multiply(seat.quaternion));
        seatTween.current.progress = Math.min(1, seatTween.current.progress + dt / SEAT_SECONDS);
        built.discPivot.position.lerpVectors(
          seatTween.current.from,
          seatTween.current.to,
          seatTween.current.progress
        );
        // 从唱片机前方抬起来再落到盘面，避免盘沿扫过机身。
        built.discPivot.position.y +=
          Math.sin(Math.PI * seatTween.current.progress) * SEAT_ARC;
        built.discPivot.quaternion.slerpQuaternions(
          seatTween.current.fromQuaternion,
          seatTween.current.toQuaternion,
          seatTween.current.progress
        );
        if (spin) {
          spin.rotation.z = bridge.spinAngle;
        }
      } else {
        const lift = shouldLiftDisc({
          canAccess: canAccessDisc(lidAngle.current),
          discHeld: discHeld.current,
          discHovered: discHovered.current,
          discOut: discOut.current,
          hoverLocked: discHoverLocked.current
        });

        discLift.current = MathUtils.damp(discLift.current, lift ? DISC_LIFT : 0, DISC_HOVER_LAMBDA, delta);

        const targetX = built.discHome.x + discOffset.current.x;
        const targetY = built.discHome.y + discOffset.current.y;
        const lambda = discOut.current ? DISC_DRAG_LAMBDA : DISC_HOVER_LAMBDA;

        built.discPivot.position.x = MathUtils.damp(built.discPivot.position.x, targetX, lambda, delta);
        built.discPivot.position.y = MathUtils.damp(built.discPivot.position.y, targetY, lambda, delta);
        built.discPivot.position.z = MathUtils.damp(
          built.discPivot.position.z,
          built.discHome.z + (discOut.current ? DISC_FRONT_OFFSET : discLift.current),
          DISC_DRAG_LAMBDA,
          delta
        );
        built.discPivot.quaternion.slerpQuaternions(
          built.discPivot.quaternion,
          IDENTITY_QUATERNION,
          0.2
        );

        if (spin) {
          spin.rotation.z = MathUtils.damp(spin.rotation.z, 0, 10, delta);
        }
      }
    }

    // 松手时才吸附；拖动中只跟手，不自动吸。
    if (interactive && built.cd && !discOnDeck.current) {
      pointerNdc.current.set(pointer.current.x, -pointer.current.y);
      raycaster.current.setFromCamera(pointerNdc.current, camera);
      const overDisc =
        pointerInside.current && raycaster.current.intersectObject(built.cd, true).length > 0;

      if (!overDisc) {
        discHovered.current = false;
        discHoverLocked.current = false;
      } else if (
        !discHoverLocked.current &&
        (discOut.current || canAccessDisc(lidAngle.current))
      ) {
        discHovered.current = true;
      }
    } else {
      discHovered.current = false;
      discHoverLocked.current = false;
    }

    const cursor =
      interactive && (drag.current.mode === "lid" || drag.current.mode === "disc")
        ? "grabbing"
        : interactive && discHovered.current
          ? "grab"
          : "default";

    if (gl.domElement.style.cursor !== cursor) {
      gl.domElement.style.cursor = cursor;
    }
  });

  const isRightHalfOfLid = (event: ThreeEvent<PointerEvent>): boolean => {
    if (!built.lidCenter) {
      return false;
    }

    const rect = gl.domElement.getBoundingClientRect();
    const center = built.root.localToWorld(built.lidCenter.clone()).project(camera);
    const centerX = rect.left + (center.x * 0.5 + 0.5) * rect.width;

    return event.nativeEvent.clientX >= centerX;
  };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>): void => {
    if (!interactive) {
      return;
    }

    if (built.lid && isWithin(event.object, built.lid)) {
      if (!shouldStartLidDrag(lidAngle.current, isRightHalfOfLid(event))) {
        return;
      }

      drag.current = {
        mode: "lid",
        lastX: event.clientX,
        lastY: event.clientY,
        startX: event.clientX,
        startLid: lidAngle.current
      };
      event.stopPropagation();
      return;
    }

    if (built.cd && isWithin(event.object, built.cd)) {
      if (discOnDeck.current) {
        if (bridge.spinning || bridge.armDown) {
          return;
        }

        beginPop();
        event.stopPropagation();
        return;
      }

      if (!shouldStartDiscDrag(canAccessDisc(lidAngle.current), discOut.current)) {
        return;
      }

      drag.current = {
        mode: "disc",
        lastX: event.clientX,
        lastY: event.clientY,
        startX: event.clientX,
        startLid: lidAngle.current
      };
      discHeld.current = true;
      discOut.current = true;
      discHovered.current = true;
      discHoverLocked.current = false;
      event.stopPropagation();
    }
  };

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <primitive object={built.root} onPointerDown={handlePointerDown} />
      </group>
    </group>
  );
};
