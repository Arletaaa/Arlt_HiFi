/** 解析 `Range: bytes=...` 请求：媒体协议必须返回 206 才能让 HTMLAudioElement 真正 seek。 */

export interface ByteRange {
  readonly end: number;
  readonly start: number;
}

/**
 * 支持单段 `bytes=start-end`、`bytes=start-`、`bytes=-suffix`。
 * 返回 null 表示忽略 Range 返回完整内容；返回 "unsatisfiable" 表示 416。
 */
export const parseByteRange = (
  header: string | null,
  size: number
): ByteRange | "unsatisfiable" | null => {
  if (!header) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());

  if (!match) {
    return null;
  }

  const [, rawStart = "", rawEnd = ""] = match;

  if (rawStart.length === 0 && rawEnd.length === 0) {
    return null;
  }

  if (size <= 0) {
    return "unsatisfiable";
  }

  if (rawStart.length === 0) {
    const suffixLength = Number(rawEnd);

    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return "unsatisfiable";
    }

    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(rawStart);

  if (!Number.isSafeInteger(start) || start < 0 || start >= size) {
    return "unsatisfiable";
  }

  const end = rawEnd.length > 0 ? Number(rawEnd) : size - 1;

  if (!Number.isSafeInteger(end) || end < start) {
    return "unsatisfiable";
  }

  return { start, end: Math.min(end, size - 1) };
};
