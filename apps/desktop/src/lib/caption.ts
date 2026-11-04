/** 陈列区左下角小字：把 CD 内歌曲名拼一行，超出字数裁剪并以 … 结尾。 */
export const truncateText = (text: string, maxChars: number): string => {
  if (maxChars <= 0) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
};

export const formatTrackTitles = (titles: readonly string[], maxChars = 34): string =>
  truncateText(
    titles
      .map((title) => title.trim())
      .filter((title) => title.length > 0)
      .join(" / "),
    maxChars
  );
