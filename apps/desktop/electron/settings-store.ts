import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultAppSettings, defaultScenePreset, type AppSettings, type LibrarySortKey, type MotionTier, type PlaybackMode, type ScenePreset, type ThemeMode } from "@arlt-hifi/shared";

const settingsFileName = "settings.json";

const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;

const isThemeMode = (value: unknown): value is ThemeMode => value === "dark" || value === "light";

const isMotionTier = (value: unknown): value is MotionTier =>
  value === "off" || value === "standard" || value === "rich";

const isLibrarySortKey = (value: unknown): value is LibrarySortKey =>
  value === "manual" || value === "title" || value === "artist" || value === "duration" || value === "imported";

const readCdOrder = (raw: unknown): readonly string[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const order: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }

    const id = entry.trim();

    if (id.length === 0 || id.length > 240 || seen.has(id)) {
      continue;
    }

    seen.add(id);
    order.push(id);

    if (order.length >= 2000) {
      break;
    }
  }

  return order;
};

const isPlaybackMode = (value: unknown): value is PlaybackMode =>
  value === "sequential" || value === "loop" || value === "shuffle";

/** 旧设置只有 stop / repeat-one；迁移到新的三态播放模式。 */
const normalizePlaybackMode = (value: unknown): PlaybackMode => {
  if (isPlaybackMode(value)) {
    return value;
  }

  if (value === "stop") {
    return "sequential";
  }

  if (value === "repeat-one") {
    return "loop";
  }

  return defaultAppSettings.playbackMode;
};

/** 把磁盘上的任意 JSON 收敛为合法设置（纯函数，可单测）。 */
const readPreset = (raw: unknown): ScenePreset => {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const pick = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.trim().length > 0 && value.length < 64 ? value : fallback;

  return {
    table: pick(record.table, defaultScenePreset.table),
    base: pick(record.base, defaultScenePreset.base),
    wall: pick(record.wall, defaultScenePreset.wall),
    light: pick(record.light, defaultScenePreset.light)
  };
};

export const mergeSettings = (raw: unknown): AppSettings => {
  if (typeof raw !== "object" || raw === null) {
    return defaultAppSettings;
  }

  const record = raw as Record<string, unknown>;

  return {
    cdOrder: readCdOrder(record.cdOrder),
    librarySort: isLibrarySortKey(record.librarySort) ? record.librarySort : defaultAppSettings.librarySort,
    motionTier: isMotionTier(record.motionTier) ? record.motionTier : defaultAppSettings.motionTier,
    playbackMode: normalizePlaybackMode(record.playbackMode),
    theme: isThemeMode(record.theme) ? record.theme : defaultAppSettings.theme,
    volume: clampInt(record.volume, 0, 100, defaultAppSettings.volume),
    scenePreset: readPreset(record.scenePreset)
  };
};

export const getSettingsFilePath = (userDataDirectory: string): string => join(userDataDirectory, settingsFileName);

export const readSettings = async (userDataDirectory: string): Promise<AppSettings> => {
  try {
    const contents = await readFile(getSettingsFilePath(userDataDirectory), "utf8");

    return mergeSettings(JSON.parse(contents));
  } catch {
    return defaultAppSettings;
  }
};

export const writeSettings = async (userDataDirectory: string, settings: AppSettings): Promise<void> => {
  const filePath = getSettingsFilePath(userDataDirectory);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
};
