import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { LibraryLocationSource } from "@arlt-hifi/shared";
import { isSupportedAudioFile } from "./media-access.js";

/** 曲库根目录的来源：应用内设置 > 安装器配置 > 默认位置。 */
export type LibraryRootSource = LibraryLocationSource;

export interface ResolvedLibraryRoot {
  readonly directory: string;
  readonly source: LibraryRootSource;
}

/** Windows 盘符 / UNC 路径（测试机不一定是 Windows，所以不只用 path.isAbsolute）。 */
const isWindowsAbsolutePath = (value: string): boolean =>
  /^[a-zA-Z]:[\\/]/u.test(value) || value.startsWith("\\\\");

/** 路径长度上限，给 Windows 的 260 字符总长留余量。 */
const MAX_LIBRARY_ROOT_LENGTH = 240;

/** 把任意值收敛成合法的绝对路径；空串、相对路径、超长值一律回 null（纯函数）。 */
export const normalizeLibraryRoot = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_LIBRARY_ROOT_LENGTH) {
    return null;
  }

  return isAbsolute(trimmed) || isWindowsAbsolutePath(trimmed) ? trimmed : null;
};

/**
 * 决定当前曲库根目录（纯函数）：
 * `settings.libraryRoot` → 安装器写的 `install.ini` → `userData/library`。
 */
export const resolveLibraryRoot = (options: {
  readonly installedRoot: string | null;
  readonly settingsRoot: string | null;
  readonly userDataDirectory: string;
}): ResolvedLibraryRoot => {
  const settingsRoot = normalizeLibraryRoot(options.settingsRoot);

  if (settingsRoot) {
    return { directory: settingsRoot, source: "settings" };
  }

  const installedRoot = normalizeLibraryRoot(options.installedRoot);

  if (installedRoot) {
    return { directory: installedRoot, source: "installer" };
  }

  return { directory: join(options.userDataDirectory, "library"), source: "default" };
};

/** target 是否在 root 目录内（含子目录；root 自身不算）。 */
export const isPathInside = (root: string, target: string): boolean => {
  const relativePath = relative(resolve(root), resolve(target));

  return relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath);
};

/**
 * 目标目录里是否已有音频文件（含子目录）。
 * 只用于切换曲库前的提示，扫描到 `maxEntries` 个目录项就停下，避免选中超大目录时卡住。
 */
export const directoryContainsAudioFiles = async (directoryPath: string, maxEntries = 4000): Promise<boolean> => {
  const pending = [directoryPath];
  let seen = 0;

  while (pending.length > 0 && seen < maxEntries) {
    const current = pending.pop();

    if (!current) {
      break;
    }

    let entries;

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      seen += 1;

      if (seen > maxEntries) {
        break;
      }

      if (entry.isDirectory()) {
        pending.push(join(current, entry.name));
      } else if (entry.isFile() && isSupportedAudioFile(entry.name)) {
        return true;
      }
    }
  }

  return false;
};
