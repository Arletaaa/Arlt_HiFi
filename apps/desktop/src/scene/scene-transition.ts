/** 陈列区 ↔ 交互区的转场时间轴与合盒计划：纯函数，方便单测。 */

export type ScenePhase = "gallery" | "entering" | "detail" | "closing" | "returning";

/** 只有进入交互区之后才存在的阶段。 */
export type CasePhase = Exclude<ScenePhase, "gallery">;

/** 搜索框等陈列区专属界面：只在真正回到陈列区时显示，交互区与转场中隐藏。 */
export const isGalleryChromeVisible = (phase: ScenePhase): boolean => phase === "gallery";

export const GALLERY_CAMERA: readonly [number, number, number] = [0, 1.78, 3.95];
export const GALLERY_LOOK: readonly [number, number, number] = [0, 1.30, 0];
export const DETAIL_CAMERA: readonly [number, number, number] = [0, 2.15, 7.0];
/** 注视点抬高：交互区整体上移，台面和相邻 CD 都落到画面下缘之外。 */
export const DETAIL_LOOK: readonly [number, number, number] = [-0.1, 3.42, 0.1];

/** 交互盒离墙留出 0.4m：盖子开到 180° 也不会碰到墙面；左半边，右侧留给 CD 机。 */
export const INTERACTION_CASE_POSITION: readonly [number, number, number] = [-0.75, 3.2, 0.85];
/** 陈列态 CD 盒高 0.52，交互态模型高 1.15；飞行体直接用交互模型缩放，避免换模型跳变。 */
export const DISPLAY_CASE_HEIGHT = 0.52;
export const INTERACTION_CASE_HEIGHT = 1.15;
export const DISPLAY_CASE_SCALE = DISPLAY_CASE_HEIGHT / INTERACTION_CASE_HEIGHT;

export const ENTER_SECONDS = 1.05;
export const RETURN_SECONDS = 1.0;

/** 进入时 CD 后仰 20° 的初始倾角。 */
export const ENTER_TILT = -0.35;

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const easeInOutCubic = (value: number): number => {
  const t = clamp01(value);

  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

const lerp3 = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number
): [number, number, number] => [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];

export interface CameraPose {
  readonly position: [number, number, number];
  readonly target: [number, number, number];
}

export const cameraPose = (phase: ScenePhase, progress: number): CameraPose => {
  const t = easeInOutCubic(progress);

  switch (phase) {
    case "gallery":
      return { position: [...GALLERY_CAMERA], target: [...GALLERY_LOOK] };
    case "entering":
      return {
        position: lerp3(GALLERY_CAMERA, DETAIL_CAMERA, t),
        target: lerp3(GALLERY_LOOK, DETAIL_LOOK, t)
      };
    case "returning":
      return {
        position: lerp3(DETAIL_CAMERA, GALLERY_CAMERA, t),
        target: lerp3(DETAIL_LOOK, GALLERY_LOOK, t)
      };
    default:
      return { position: [...DETAIL_CAMERA], target: [...DETAIL_LOOK] };
  }
};

export interface CasePose {
  readonly position: [number, number, number];
  readonly rotationX: number;
  readonly rotationY: number;
  readonly scale: number;
}

export const caseStartPosition = (slotX: number): [number, number, number] => [slotX, 1.30, 0];

/** 点击时 CD 通常处于 hover（前移 0.07、偏转 0.18rad），飞行体从这里接管，避免第一帧回弹。 */
export const caseHoverPosition = (slotX: number): [number, number, number] => [slotX, 1.30, 0.07];
export const CASE_HOVER_YAW = 0.18;

export const enterCasePose = (progress: number, slotX: number): CasePose => {
  const t = easeInOutCubic(progress);
  const tilt = ENTER_TILT * Math.sin(Math.PI * easeInOutCubic(clamp01(progress / 0.6)));

  return {
    position: lerp3(caseHoverPosition(slotX), INTERACTION_CASE_POSITION, t),
    rotationX: tilt,
    rotationY: CASE_HOVER_YAW * (1 - easeInOutCubic(clamp01(progress / 0.5))),
    scale: lerp(DISPLAY_CASE_SCALE, 1, t)
  };
};

export const returnCasePose = (progress: number, slotX: number): CasePose => {
  const t = easeInOutCubic(progress);

  return {
    position: lerp3(INTERACTION_CASE_POSITION, caseStartPosition(slotX), t),
    rotationX: 0,
    rotationY: 0,
    scale: lerp(1, DISPLAY_CASE_SCALE, t)
  };
};

const LID_CLOSE_SECONDS = 0.3;
const LID_OPEN_SECONDS = 0.22;
const DISC_RETURN_SECONDS = 0.3;

export interface ClosePlan {
  readonly lid0: number;
  readonly discOut: boolean;
  readonly lidHeld: number;
  readonly openEnd: number;
  readonly discEnd: number;
  readonly lidEnd: number;
  readonly total: number;
}

/** 返回前把盒盖/光盘收好：盘在外时先开够 90°、盘回卡口、再合盖。 */
export const buildClosePlan = (lidAngle: number, discOut: boolean): ClosePlan => {
  const lid0 = Math.min(Math.PI, Math.max(0, lidAngle));
  const needsOpen = discOut && lid0 < Math.PI / 2 - 1e-6;
  const openEnd = needsOpen ? LID_OPEN_SECONDS : 0;
  const discEnd = discOut ? openEnd + DISC_RETURN_SECONDS : 0;
  const lidHeld = discOut ? Math.max(lid0, Math.PI / 2) : lid0;
  const lidNeedsClose = lidHeld > 0.001;
  const lidEnd = (discOut ? discEnd : 0) + (lidNeedsClose ? LID_CLOSE_SECONDS : 0);
  const total = Math.max(lidEnd, discEnd);

  return { lid0, discOut, lidHeld, openEnd, discEnd, lidEnd, total };
};

export interface CloseFrame {
  readonly lidAngle: number;
  /** 0 = 光盘完全在外，1 = 已回到卡口。 */
  readonly discIn: number;
  readonly done: boolean;
}

export const closeFrame = (plan: ClosePlan, elapsedSeconds: number): CloseFrame => {
  const elapsed = Math.max(0, elapsedSeconds);

  if (plan.total <= 1e-6 || elapsed >= plan.total - 1e-6) {
    return { lidAngle: 0, discIn: 1, done: true };
  }

  if (!plan.discOut) {
    return {
      lidAngle: lerp(plan.lid0, 0, easeInOutCubic(elapsed / LID_CLOSE_SECONDS)),
      discIn: 1,
      done: false
    };
  }

  if (elapsed < plan.openEnd) {
    return {
      lidAngle: lerp(plan.lid0, plan.lidHeld, easeInOutCubic(elapsed / plan.openEnd)),
      discIn: 0,
      done: false
    };
  }

  if (elapsed < plan.discEnd) {
    return { lidAngle: plan.lidHeld, discIn: easeInOutCubic((elapsed - plan.openEnd) / DISC_RETURN_SECONDS), done: false };
  }

  return {
    lidAngle: lerp(plan.lidHeld, 0, easeInOutCubic((elapsed - plan.discEnd) / LID_CLOSE_SECONDS)),
    discIn: 1,
    done: false
  };
};
