import type { AppSettings, Track } from "./types.js";

export const mediaProtocolScheme = "arlt-hifi-media";

export type DesktopPlatform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

export interface AudioFileSelectionResult {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}

/** 单首曲目没进库的原因。 */
export type ImportSkipReason = "duplicate" | "unsupported" | "failed";

export interface ImportSkippedFile {
  readonly filePath: string;
  readonly reason: ImportSkipReason;
}

export interface LibraryImportResult {
  readonly imported: readonly Track[];
  /** 用户中途取消时为 true；已复制的曲目仍保留。 */
  readonly interrupted?: boolean;
  /** 取消时尚未处理的文件，用于“继续导入”。 */
  readonly remainingFilePaths?: readonly string[];
  readonly skipped: readonly ImportSkippedFile[];
}

export interface FolderImportResult extends LibraryImportResult {
  readonly canceled: boolean;
}

/** 导入进度（按已处理文件计数，包含被跳过的）。 */
export interface LibraryImportProgress {
  readonly completed: number;
  readonly total: number;
}

/** 旧库标签重扫结果：只补齐缺失字段，已有值保持不变。 */
export interface LibraryRescanResult {
  /** 标签读取失败、保持原条目的数量。 */
  readonly failed: number;
  readonly tracks: readonly Track[];
  /** 至少补齐一个字段的条目数。 */
  readonly updated: number;
}

/** CD 信息编辑：只改 manifest，不移动文件、不写音频标签。 */
export interface TrackMetadataEdit {
  readonly album: string;
  readonly albumArtist: string;
  readonly discNumber: number;
  readonly trackNumber: number;
}

/**
 * 一次批量提交的曲目编辑：CD 名字走 album，CD 内顺序走 trackNumber。
 * cdId 只给“单曲 CD”用，普通 CD 传 null 表示按标签归组。
 */
export interface TrackEdit {
  readonly album: string;
  readonly albumArtist: string;
  readonly cdId: string | null;
  readonly discNumber: number;
  readonly trackNumber: number;
  readonly trackId: string;
}

export interface ArltHifiDesktopApi {
  readonly platform: DesktopPlatform;
  /** 打开系统多选文件对话框，只选不复制。 */
  readonly selectAudioFiles: () => Promise<AudioFileSelectionResult>;
  /** 把选中的文件复制进 userData/library 并写库。 */
  readonly importAudioFiles: (filePaths: readonly string[]) => Promise<LibraryImportResult>;
  /** 打开系统文件夹对话框，递归导入其中受支持的音频。 */
  readonly importAudioFolder: () => Promise<FolderImportResult>;
  /** 请求中止正在进行的导入；没有导入或已结束时返回 false。 */
  readonly cancelLibraryImport: () => Promise<boolean>;
  /** 读取已托管的曲库（manifest）。 */
  readonly loadLibrary: () => Promise<readonly Track[]>;
  /** 重读旧库标签，补齐缺失的专辑艺术家 / 碟号 / 音轨号等字段；不覆盖已有值。 */
  readonly rescanLibrary: () => Promise<LibraryRescanResult>;
  /** 重命名副本文件与显示标题；id 不变。 */
  readonly renameTrack: (trackId: string, title: string) => Promise<Track>;
  /** 编辑专辑 / 专辑艺术家 / 碟号 / 音轨号；只改 manifest。 */
  readonly editTrack: (trackId: string, edit: TrackMetadataEdit) => Promise<Track>;
  /** 批量写 CD 归属与顺序（合并 / 拆成单曲 / 调序），失败整体不落盘。 */
  readonly applyTrackEdits: (edits: readonly TrackEdit[]) => Promise<readonly Track[]>;
  /** 选择图片并写为该曲目的封面；取消返回 null。 */
  readonly setTrackCover: (trackId: string) => Promise<Track | null>;
  /** 删除副本文件并从曲库移除。 */
  readonly deleteTrack: (trackId: string) => Promise<boolean>;
  /** 用系统文件管理器打开托管音频目录。 */
  readonly openLibraryFolder: () => Promise<void>;
  /** 托管目录被外部修改后推送最新曲库；返回取消订阅函数。 */
  readonly onLibraryChanged: (handler: (tracks: readonly Track[]) => void) => () => void;
  readonly onLibraryImportProgress: (handler: (progress: LibraryImportProgress) => void) => () => void;
  readonly loadSettings: () => Promise<AppSettings>;
  readonly saveSettings: (settings: AppSettings) => Promise<AppSettings>;
}

export const createTrackMediaUrl = (track: Track): string => {
  return `${mediaProtocolScheme}://audio/${encodeURIComponent(track.filePath)}`;
};

export const createCoverMediaUrl = (coverPath: string): string => {
  return `${mediaProtocolScheme}://image/${encodeURIComponent(coverPath)}`;
};
