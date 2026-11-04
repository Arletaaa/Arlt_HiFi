import { useEffect, useState } from "react";
import type { MotionTier } from "@arlt-hifi/shared";
import { useSettingsStore } from "../store/settings-store";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const usePrefersReducedMotion = (): boolean => {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(() => {
    return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
  });

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = (event: MediaQueryListEvent): void => {
      setPrefersReduced(event.matches);
    };

    query.addEventListener("change", handleChange);

    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, []);

  return prefersReduced;
};

/** 系统偏好优先于用户设置。 */
export const useEffectiveMotionTier = (): MotionTier => {
  const motionTier = useSettingsStore((state) => state.motionTier);
  const prefersReduced = usePrefersReducedMotion();

  return prefersReduced ? "off" : motionTier;
};

/** 把主题与动效档位写到 <html> 上，供 CSS 选择器使用。 */
export const useApplyPreferences = (): void => {
  const theme = useSettingsStore((state) => state.theme);
  const motionTier = useEffectiveMotionTier();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.motion = motionTier;
  }, [motionTier, theme]);
};
