import { useCallback, useState } from "react";
import { getDesktopErrorMessage } from "../lib/desktop-error";
import { usePlayerStore } from "../store/player-store";

export type LibraryRescanPhase = "idle" | "running" | "done" | "error";

export interface LibraryRescanState {
  readonly message: string | null;
  readonly phase: LibraryRescanPhase;
}

const webPreviewMessage = "网页预览无法重扫曲库，请使用 Electron 桌面应用。";

const describeRescan = (updated: number, failed: number): string => {
  const parts: string[] = [];

  if (updated > 0) {
    parts.push(`已补齐 ${updated} 首`);
  }

  if (failed > 0) {
    parts.push(`标签读取失败 ${failed} 首`);
  }

  return parts.length > 0 ? parts.join(" · ") : "没有可补齐的标签字段。";
};

/** 重扫旧库缺失的标签字段；完成后用主进程返回的曲库刷新 store。 */
export const useLibraryRescan = () => {
  const loadLibrary = usePlayerStore((state) => state.loadLibrary);
  const [state, setState] = useState<LibraryRescanState>({ message: null, phase: "idle" });

  const rescan = useCallback((): void => {
    const api = window.arltHifiDesktop;

    if (!api) {
      setState({ message: webPreviewMessage, phase: "error" });
      return;
    }

    setState({ message: null, phase: "running" });

    void api
      .rescanLibrary()
      .then((result) => {
        loadLibrary(result.tracks);
        setState({ message: describeRescan(result.updated, result.failed), phase: "done" });
      })
      .catch((error: unknown) => {
        setState({ message: getDesktopErrorMessage(error, "重扫失败，请重试。"), phase: "error" });
      });
  }, [loadLibrary]);

  return { busy: state.phase === "running", rescan, state };
};
