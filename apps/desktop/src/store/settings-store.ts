import { create } from "zustand";
import type { AppSettings, LibrarySortKey, MotionTier, ScenePreset, ThemeMode } from "@arlt-hifi/shared";
import { defaultScenePreset } from "@arlt-hifi/shared";

interface SettingsStore {
  readonly cdOrder: readonly string[];
  readonly hydration: "pending" | "ready";
  readonly hydrate: (settings: AppSettings) => void;
  readonly librarySort: LibrarySortKey;
  readonly motionTier: MotionTier;
  readonly setCdOrder: (cdOrder: readonly string[]) => void;
  readonly setLibrarySort: (librarySort: LibrarySortKey) => void;
  readonly setMotionTier: (motionTier: MotionTier) => void;
  readonly setTheme: (theme: ThemeMode) => void;
  readonly scenePreset: ScenePreset;
  readonly setScenePreset: (patch: Partial<ScenePreset>) => void;
  readonly theme: ThemeMode;
}

/**
 * 主题与动效档位。持久化交给主进程的 settings.json（见 use-settings-sync），
 * 这里不再使用 localStorage，避免两套存储互相覆盖。
 */
export const useSettingsStore = create<SettingsStore>()((set) => ({
  theme: "dark",
  motionTier: "standard",
  librarySort: "title",
  cdOrder: [],
  hydration: "pending",
  hydrate: (settings) => {
    set({
      theme: settings.theme,
      motionTier: settings.motionTier,
      librarySort: settings.librarySort ?? "title",
      cdOrder: settings.cdOrder ?? [],
      scenePreset: settings.scenePreset ?? defaultScenePreset,
      hydration: "ready"
    });
  },
  scenePreset: defaultScenePreset,
  setScenePreset: (patch) => {
    set((state) => ({ scenePreset: { ...state.scenePreset, ...patch } }));
  },
  setLibrarySort: (librarySort) => {
    set({ librarySort });
  },
  setCdOrder: (cdOrder) => {
    set({ cdOrder: [...cdOrder] });
  },
  setTheme: (theme) => {
    set({ theme });
  },
  setMotionTier: (motionTier) => {
    set({ motionTier });
  }
}));
