export type AudioQuality = "unknown" | "lossless" | "lossy" | "hi-res";

export type PlaybackStatus = "idle" | "playing" | "paused";

export type PlaybackMode = "sequential" | "loop" | "shuffle";

/** 一次 seek 请求；nonce 保证连续拖到同一秒也能触发音频层。 */
export interface SeekRequest {
  readonly nonce: number;
  readonly seconds: number;
}

/** 曲目信息的来源：读取文件标签，或从文件名推断。 */
export type MetadataSource = "tags" | "filename";

export type ThemeMode = "dark" | "light";

export type MotionTier = "off" | "standard" | "rich";

/** 曲库排序：手动（cdOrder）/ 标题 / 艺术家 / 时长 / 导入顺序（manifest 顺序）。 */
export type LibrarySortKey = "manual" | "title" | "artist" | "duration" | "imported";

export interface Track {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  /** 专辑艺术家；合辑用它归组，缺省回退到 artist。 */
  readonly albumArtist?: string | undefined;
  /** 音轨号（CD 内顺序）；缺失时为 0。 */
  readonly trackNumber?: number | undefined;
  /** 碟号；多碟专辑按碟拆成多张 CD，缺失时为 0。 */
  readonly discNumber?: number | undefined;
  /**
   * 显式 CD 归属。只有“单曲 CD”（从专辑里拖出去的歌）需要它；
   * 有值时归组优先用它，没值时按标签推导。只写 manifest，不写音频标签。
   */
  readonly cdId?: string | undefined;
  readonly durationSeconds: number;
  readonly quality: AudioQuality;
  readonly sampleRateHz: number;
  readonly bitDepth: number;
  readonly filePath: string;
  /** 已缓存的封面文件路径，无封面为 null。 */
  readonly coverPath: string | null;
  readonly metadataSource: MetadataSource;
}

export interface PlayerSnapshot {
  readonly library: readonly Track[];
  readonly status: PlaybackStatus;
  readonly currentTrack: Track | null;
  readonly queue: readonly Track[];
  readonly playbackMode: PlaybackMode;
  /** 当前曲目每一次“从头开始”的序号；循环单曲时也要让音频层重跑。 */
  readonly playbackEpoch: number;
  readonly seekRequest: SeekRequest | null;
  readonly volume: number;
  readonly muted: boolean;
  readonly positionSeconds: number;
  readonly durationSeconds: number;
  readonly playbackErrorMessage: string | null;
}

/** 持久化到 userData/settings.json 的全部偏好。 */
/** 场景预设：材质与光效的组合（见 docs/decisions/006-library-and-scene-presets.md）。 */
export interface ScenePreset {
  readonly base: string;
  readonly light: string;
  readonly table: string;
  readonly wall: string;
}

export const defaultScenePreset: ScenePreset = {
  table: "wood029",
  base: "wood002",
  wall: "fabric009",
  light: "morning"
};

export interface AppSettings {
  /** CD 的手动顺序（GalleryGroup id 列表）；仅 librarySort === "manual" 时生效。 */
  readonly cdOrder: readonly string[];
  /** 应用内选择的曲库根目录；null = 沿用安装配置 / 默认位置。 */
  readonly libraryRoot: string | null;
  readonly librarySort: LibrarySortKey;
  readonly motionTier: MotionTier;
  readonly playbackMode: PlaybackMode;
  readonly theme: ThemeMode;
  readonly volume: number;
  readonly scenePreset: ScenePreset;
}

export const defaultAppSettings: AppSettings = {
  cdOrder: [],
  libraryRoot: null,
  librarySort: "title",
  motionTier: "standard",
  playbackMode: "sequential",
  theme: "dark",
  volume: 72,
  scenePreset: defaultScenePreset
};
