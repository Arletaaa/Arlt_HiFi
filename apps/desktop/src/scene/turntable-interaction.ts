/** CD 唱片机的纯逻辑：常量、角度、转速、灯色，方便单测。 */

import { Quaternion, Vector3 } from "three";

export const TURNTABLE_MODEL_URL = "/models/cd-player.glb";

/** 唱片机在交互区的位置：CD 盒右侧、墙面之前。 */
export const DECK_POSITION: readonly [number, number, number] = [1.55, 2.9, 0.2];
/** 模型导出时宽 2.6；缩小一点，给 CD 盒留出间距。 */
export const DECK_SCALE = 0.78;
/** three.js 里模型是 Y-up；先转 90° 让盘面朝镜头，再后仰 32°。 */
export const DECK_ROTATION_X = (58 * Math.PI) / 180;
export const DECK_ROTATION_Y = (-6 * Math.PI) / 180;
/** CD 落在胶垫上方一点点的距离（场景单位）。 */
export const CD_SEAT_GAP = 0.02;
/** CD 从竖直（盒面朝镜头）转到唱片机平面：相对盒面后仰 32°。 */
export const CD_SEAT_TILT = (-32 * Math.PI) / 180;
/** CD 枢轴的 R_x(-90°)，把盘面法线 +Z 对到唱片机的 +Y。 */
export const CD_FLAT_QUATERNION = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2
);

/** CD 实际转速接近 200 rpm（外圈），比黑胶 33⅓ 快很多。 */
export const SPIN_RAD_PER_SECOND = ((200 / 60) * Math.PI * 2);
export const SPIN_UP_SECONDS = 1.2;
/** 停转要短，但保留可见的减速过程。 */
export const SPIN_DOWN_SECONDS = 0.7;

/** 唱臂：0 = 架上，负角度 = 往盘面摆；限制在 CD 外环，不进入盘心。 */
export const ARM_MIN_ANGLE = (-42 * Math.PI) / 180;
export const ARM_MAX_ANGLE = 0;
/** 拖拽灵敏度：约 420px 摆 180°。 */
export const ARM_RAD_PER_PX = Math.PI / 420;
/** 松手时算“落在 CD 上”的角度区间（覆盖 CD 外环）。 */
export const ARM_DROP_MIN = ARM_MIN_ANGLE;
export const ARM_DROP_MAX = (-28 * Math.PI) / 180;
/** 落针停在这个角度（CD 外圈）。 */
export const ARM_PLAY_ANGLE = (-40 * Math.PI) / 180;
/** 唱臂抬起的场景单位高度。 */
export const ARM_LIFT = 0.06;

/** 灯色：黑 / 红 / 绿。 */
export const LAMP_OFF = 0x050505;
export const LAMP_RED = 0xff2a1e;
export const LAMP_GREEN = 0x2bff6a;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** 水平拖拽 → 唱臂角度。 */
export const armAngleForDrag = (
  startAngle: number,
  deltaX: number,
  minAngle = ARM_MIN_ANGLE,
  maxAngle = ARM_MAX_ANGLE
): number => clamp(startAngle + deltaX * ARM_RAD_PER_PX, minAngle, maxAngle);

/** 松手时是否可以把唱臂放到 CD 上。 */
export const shouldDropArm = (angle: number, cdSeated: boolean): boolean =>
  cdSeated && angle <= ARM_DROP_MAX && angle >= ARM_DROP_MIN;

/** 目标速度 0/1，按加速/减速时长线性逼近。 */
export const spinRateAfter = (
  current: number,
  target: number,
  deltaSeconds: number
): number => {
  const duration = target > current ? SPIN_UP_SECONDS : SPIN_DOWN_SECONDS;
  const step = deltaSeconds / duration;

  return target > current
    ? Math.min(target, current + step)
    : Math.max(target, current - step);
};

export const leftLampColor = (cdSeated: boolean, motorOn: boolean): number => {
  if (!cdSeated) {
    return LAMP_OFF;
  }

  return motorOn ? LAMP_GREEN : LAMP_RED;
};

export const rightLampColor = (playing: boolean): number =>
  playing ? LAMP_GREEN : LAMP_OFF;

/**
 * CD 在唱片机上的世界姿态：位置 = 转盘中心 + 盘面法线方向的间隙，
 * 四元数 = 转盘世界四元数 × R_x(-90°)。
 */
export const cdSeatPose = (
  platterWorld: Vector3,
  platterQuaternion: Quaternion,
  gap = CD_SEAT_GAP
): { position: Vector3; quaternion: Quaternion } => ({
  position: platterWorld
    .clone()
    .add(new Vector3(0, gap, 0).applyQuaternion(platterQuaternion)),
  quaternion: platterQuaternion.clone().multiply(CD_FLAT_QUATERNION)
});

/** 详情播放条需要知道唱片机是否在转、唱臂是否在盘上、CD 是否就位。 */
export interface TurntableTransport {
  armDown: boolean;
  cdSeated: boolean;
  spinning: boolean;
}

/** CaseDetail 与 Turntable 共享的可变状态；只在 detail 场景里使用。 */
export interface TurntableBridge {
  readonly platterWorld: Vector3;
  readonly platterQuaternion: Quaternion;
  cdSeated: boolean;
  armDown: boolean;
  spinning: boolean;
  spinAngle: number;
  /** 由 Turntable 注册：详情播放条的播放键与唱片机 Start/Stop 走同一段逻辑。 */
  toggleStartStop: (() => void) | null;
}

export const createTurntableBridge = (): TurntableBridge => ({
  platterWorld: new Vector3(),
  platterQuaternion: new Quaternion(),
  cdSeated: false,
  armDown: false,
  spinning: false,
  spinAngle: 0,
  toggleStartStop: null
});
