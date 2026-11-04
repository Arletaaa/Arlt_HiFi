import { useCallback, useEffect, useState } from "react";
import type { ImportSkippedFile, LibraryImportProgress, LibraryImportResult } from "@arlt-hifi/shared";
import { getDesktopErrorMessage } from "../lib/desktop-error";
import { usePlayerStore } from "../store/player-store";

export type LibraryImportPhase = "idle" | "running" | "done" | "error";

export interface LibraryImportState {
  readonly message: string | null;
  readonly phase: LibraryImportPhase;
  readonly progress: LibraryImportProgress | null;
  /** 取消后尚未处理的文件；继续导入时复用。 */
  readonly remaining: readonly string[] | null;
}

const idleState: LibraryImportState = { message: null, phase: "idle", progress: null, remaining: null };
const webPreviewMessage = "网页预览无法导入音乐，请使用 Electron 桌面应用。";

const countReason = (skipped: readonly ImportSkippedFile[], reason: ImportSkippedFile["reason"]): number =>
  skipped.filter((entry) => entry.reason === reason).length;

const describeImport = (result: LibraryImportResult): string => {
  const parts: string[] = [];

  if (result.interrupted) {
    parts.push("已取消");
  }

  if (result.imported.length > 0 || !result.interrupted) {
    parts.push(`已导入 ${result.imported.length} 首`);
  }

  const duplicates = countReason(result.skipped, "duplicate");
  const unsupported = countReason(result.skipped, "unsupported");
  const failed = countReason(result.skipped, "failed");

  if (duplicates > 0) {
    parts.push(`已存在 ${duplicates} 首`);
  }

  if (unsupported > 0) {
    parts.push(`格式不支持 ${unsupported} 首`);
  }

  if (failed > 0) {
    parts.push(`失败 ${failed} 首`);
  }

  if (!result.interrupted && result.imported.length === 0 && result.skipped.length === 0) {
    return "没有找到可导入的音频文件。";
  }

  return parts.join(" · ");
};

/** 导入动作 + 进度 + 结果文案；取消后可继续处理剩余文件。 */
export const useLibraryImport = () => {
  const loadLibrary = usePlayerStore((state) => state.loadLibrary);
  const [state, setState] = useState<LibraryImportState>(idleState);

  useEffect(() => {
    const api = window.arltHifiDesktop;

    if (!api) {
      return;
    }

    return api.onLibraryImportProgress((progress) => {
      setState((current) => (current.phase === "running" ? { ...current, progress } : current));
    });
  }, []);

  const finishImport = useCallback(
    async (result: LibraryImportResult): Promise<void> => {
      const api = window.arltHifiDesktop;

      if (api) {
        loadLibrary(await api.loadLibrary());
      }

      setState({
        message: describeImport(result),
        phase: "done",
        progress: null,
        remaining: result.interrupted ? result.remainingFilePaths ?? [] : null
      });
    },
    [loadLibrary]
  );

  const continueImport = useCallback((): void => {
    const api = window.arltHifiDesktop;
    const remaining = state.remaining;

    if (!api || !remaining || remaining.length === 0) {
      return;
    }

    setState({ message: null, phase: "running", progress: null, remaining: null });

    void api
      .importAudioFiles(remaining)
      .then(finishImport)
      .catch((error: unknown) => {
        setState({
          message: getDesktopErrorMessage(error, "继续导入失败，请重试。"),
          phase: "error",
          progress: null,
          remaining
        });
      });
  }, [finishImport, state.remaining]);

  const runImport = useCallback(
    async (kind: "files" | "folder"): Promise<void> => {
      const api = window.arltHifiDesktop;

      if (!api) {
        setState({ message: webPreviewMessage, phase: "error", progress: null, remaining: null });
        return;
      }

      setState({ message: null, phase: "running", progress: null, remaining: null });

      try {
        let result: LibraryImportResult;

        if (kind === "files") {
          const selection = await api.selectAudioFiles();

          if (selection.canceled || selection.filePaths.length === 0) {
            setState(idleState);
            return;
          }

          result = await api.importAudioFiles(selection.filePaths);
        } else {
          const folder = await api.importAudioFolder();

          if (folder.canceled) {
            setState(idleState);
            return;
          }

          result = folder;
        }

        await finishImport(result);
      } catch (error) {
        setState({
          message: getDesktopErrorMessage(error, "导入失败，请重试。"),
          phase: "error",
          progress: null,
          remaining: null
        });
      }
    },
    [finishImport]
  );

  const importFiles = useCallback((): void => {
    void runImport("files");
  }, [runImport]);

  const importFolder = useCallback((): void => {
    void runImport("folder");
  }, [runImport]);

  const cancelImport = useCallback((): void => {
    const api = window.arltHifiDesktop;

    if (!api) {
      return;
    }

    void api.cancelLibraryImport().catch(() => undefined);
  }, []);

  return {
    cancelImport,
    continueImport,
    importFiles,
    importFolder,
    state,
    busy: state.phase === "running"
  };
};
