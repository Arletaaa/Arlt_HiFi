import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeLibraryRoot } from "./library-root.js";

/** NSIS 安装器把用户选择的曲库目录写在 userData 下的这个文件里。 */
export const installConfigFileName = "install.ini";

/** 只解析 `[paths]` 下的 `libraryRoot`；其它键与节忽略（纯函数，可单测）。 */
export const parseInstalledLibraryRoot = (contents: string): string | null => {
  const normalized = contents.replace(/^\uFEFF/u, "").replace(/\u0000/gu, "");

  for (const line of normalized.split(/\r?\n/u)) {
    const match = /^\s*libraryRoot\s*=\s*(.+)$/u.exec(line);
    const value = match?.[1]?.trim();

    if (value === undefined || value.length === 0) {
      continue;
    }

    return normalizeLibraryRoot(value);
  }

  return null;
};

/**
 * 依次在 userData 与安装目录里找 install.ini（安装器两处都会写一份，
 * 防止 $APPDATA 指向别的账户时读不到）。两种编码都尝试。
 */
export const readInstalledLibraryRoot = async (
  userDataDirectory: string,
  installDirectory?: string | null
): Promise<string | null> => {
  const directories = [userDataDirectory, installDirectory].filter(
    (directory): directory is string => typeof directory === "string" && directory.length > 0
  );

  for (const directory of directories) {
    try {
      const buffer = await readFile(join(directory, installConfigFileName));
      const hasUtf16Bom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
      const payload = hasUtf16Bom ? buffer.subarray(2) : buffer;
      const looksUtf16 = payload.length >= 2 && payload[1] === 0x00;
      const candidates = looksUtf16
        ? [payload.toString("utf16le"), buffer.toString("utf8")]
        : [buffer.toString("utf8"), payload.toString("utf16le")];

      for (const contents of candidates) {
        const root = parseInstalledLibraryRoot(contents);

        if (root !== null) {
          return root;
        }
      }
    } catch {
      // 这个位置没有配置文件，继续看下一个。
    }
  }

  return null;
};
