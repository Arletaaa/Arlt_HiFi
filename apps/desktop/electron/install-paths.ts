import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

/** NSIS 安装器把用户选择的曲库目录写在 userData 下的这个文件里。 */
export const installConfigFileName = "install.ini";

/** Windows 盘符路径（测试机不一定是 Windows，所以不只用 path.isAbsolute）。 */
const isWindowsAbsolutePath = (value: string): boolean => /^[a-zA-Z]:[\\/]/u.test(value) || value.startsWith("\\\\");

/** 只解析 `[paths]` 下的 `libraryRoot`；其它键与节忽略（纯函数，可单测）。 */
export const parseInstalledLibraryRoot = (contents: string): string | null => {
  const normalized = contents.replace(/^\uFEFF/u, "");

  for (const line of normalized.split(/\r?\n/u)) {
    const match = /^\s*libraryRoot\s*=\s*(.+)$/u.exec(line);
    const value = match?.[1]?.trim();

    if (value === undefined || value.length === 0) {
      continue;
    }

    return isAbsolute(value) || isWindowsAbsolutePath(value) ? value : null;
  }

  return null;
};

/** 读取安装器写下的曲库目录；没有安装记录（开发模式）时返回 null。 */
export const readInstalledLibraryRoot = async (userDataDirectory: string): Promise<string | null> => {
  try {
    return parseInstalledLibraryRoot(await readFile(join(userDataDirectory, installConfigFileName), "utf8"));
  } catch {
    return null;
  }
};
