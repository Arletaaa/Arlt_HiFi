import { defaultAppSettings, getAudioQuality, type ArltHifiDesktopApi, type Track } from "@arlt-hifi/shared";
import { isLightPresetId } from "../lib/light-presets";
import { usePlayerStore } from "../store/player-store";
import { useSettingsStore } from "../store/settings-store";
import { DEMO_DIRECTORY, getDemoQuery } from "./demo-params";

const createDemoTrack = (
  index: number,
  title: string,
  artist: string,
  album: string,
  durationSeconds: number,
  extension: string,
  sampleRateHz: number,
  bitDepth: number
): Track => ({
  id: `demo-track-${index}`,
  title,
  artist,
  album,
  durationSeconds,
  quality: getAudioQuality(`track.${extension}`),
  sampleRateHz,
  bitDepth,
  filePath: `${DEMO_DIRECTORY}\\${album}\\${title}.${extension}`,
  coverPath: null,
  metadataSource: "filename"
});

const demoTracks: readonly Track[] = [
  createDemoTrack(1, "夜想曲 第零番", "灯火アンサンブル", "静かな星", 286, "flac", 96000, 24),
  createDemoTrack(2, "星屑リフレイン", "星屑リフレイン", "星屑リフレイン", 243, "flac", 44100, 16),
  createDemoTrack(3, "Blue Hour Terrace", "Aoi Kaze", "Terrace EP", 214, "wav", 48000, 24),
  createDemoTrack(4, "春の残響", "三日月レコード", "残響集", 198, "flac", 44100, 16),
  createDemoTrack(5, "Neon Tide", "Lumen Broadcast", "Neon Tide", 232, "mp3", 44100, 0),
  createDemoTrack(6, "深海のプラネタリウム", "海月スタジオ", "深海", 305, "flac", 192000, 24),
  createDemoTrack(7, "Paper Lantern March", "Kite & Ash", "Paper Lantern", 187, "m4a", 44100, 0),
  createDemoTrack(8, "雨音コンチェルト", "雨音コンチェルト", "雨の日", 268, "flac", 48000, 24),
  createDemoTrack(9, "Midnight Soda", "Cassette Youth", "Midnight Soda", 176, "mp3", 44100, 0),
  createDemoTrack(10, "透明な八月", "透明な八月", "八月", 254, "flac", 96000, 24),
  createDemoTrack(11, "Velvet Platform", "Night Bus 04", "Terminal", 221, "ogg", 48000, 0),
  createDemoTrack(12, "さよならモノレール", "モノレール", "さよなら", 209, "m4a", 44100, 0),
  createDemoTrack(13, "Glass Harbor", "Shiokaze", "Harbor Lights", 297, "flac", 44100, 16),
  createDemoTrack(14, "夜明け前のブルース", "夜明け前のブルース", "夜明け", 312, "wav", 96000, 24)
];

const webPreviewImportMessage = "网页预览无法导入音乐，请使用 Electron 桌面应用。";
const webPreviewManageMessage = "网页预览无法管理曲库，请使用 Electron 桌面应用。";
const webPreviewLocationMessage = "网页预览无法更改曲库位置，请使用 Electron 桌面应用。";

const rejectWebPreviewImport = async (): Promise<never> => {
  throw new Error(webPreviewImportMessage);
};

const rejectWebPreviewManage = async (): Promise<never> => {
  throw new Error(webPreviewManageMessage);
};

const rejectWebPreviewLocation = async (): Promise<never> => {
  throw new Error(webPreviewLocationMessage);
};

const createDemoApi = (): ArltHifiDesktopApi => ({
  platform: "win32",
  getLibraryLocation: async () => ({ directory: "（网页预览不托管曲库）", source: "default" }),
  chooseLibraryDirectory: rejectWebPreviewLocation,
  selectAudioFiles: rejectWebPreviewImport,
  importAudioFiles: rejectWebPreviewImport,
  importAudioFolder: rejectWebPreviewImport,
  cancelLibraryImport: async () => false,
  loadLibrary: async () => demoTracks,
  rescanLibrary: rejectWebPreviewManage,
  renameTrack: rejectWebPreviewManage,
  editTrack: rejectWebPreviewManage,
  applyTrackEdits: rejectWebPreviewManage,
  setTrackCover: rejectWebPreviewManage,
  deleteTrack: rejectWebPreviewManage,
  openLibraryFolder: rejectWebPreviewManage,
  onLibraryChanged: () => () => {},
  onLibraryImportProgress: () => () => {},
  loadSettings: async () => ({ ...defaultAppSettings }),
  saveSettings: async (settings) => settings
});

/** 静态演示构建（GitHub Pages）：没有 Electron，直接按示例曲库展示。 */
const isStaticDemo = import.meta.env.MODE === "demo";

/**
 * 网页预览（`pnpm dev:web`）和静态演示（`pnpm build:web`）共用：
 * 在浏览器里补齐 preload API，便于不启动 Electron 也能校对界面。
 * 该模块只在上述两种模式下被动态导入，不会进入桌面端生产包。
 */
export const installDemoDesktopApi = (): void => {
  if ((!import.meta.env.DEV && !isStaticDemo) || window.arltHifiDesktop) {
    return;
  }

  Object.defineProperty(window, "arltHifiDesktop", {
    value: createDemoApi(),
    configurable: true
  });

  const params = getDemoQuery();

  if (!params) {
    return;
  }

  // 本地 DEV 预览沿用 `?demo=1` 开关；静态演示站打开即载入示例曲库。
  if (!isStaticDemo && !params.has("demo")) {
    return;
  }

  const theme = params.get("theme");

  if (theme === "dark" || theme === "light") {
    useSettingsStore.getState().setTheme(theme);
  }

  const light = params.get("light");

  if (light && isLightPresetId(light)) {
    useSettingsStore.getState().setScenePreset({ light });
  }

  usePlayerStore.getState().loadLibrary(demoTracks);

  if (!params.has("track")) {
    return;
  }

  const currentTrack = demoTracks[2] ?? demoTracks[0];

  if (!currentTrack) {
    return;
  }

  usePlayerStore.setState({
    currentTrack,
    status: "paused",
    durationSeconds: currentTrack.durationSeconds,
    positionSeconds: 96
  });

  // 预览环境没有真实音频源，忽略由此产生的加载错误，避免演示界面出现假错误条。
  usePlayerStore.subscribe((state) => {
    if (state.playbackErrorMessage) {
      usePlayerStore.setState({
        playbackErrorMessage: null,
        status: state.currentTrack ? "paused" : "idle"
      });
    }
  });
};
