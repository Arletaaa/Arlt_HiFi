import { extname } from "node:path";

export type MediaKind = "audio" | "image";

const supportedAudioExtensions = new Set([".flac", ".wav", ".mp3", ".m4a", ".ogg"]);
const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const mediaContentTypes: Record<string, string> = {
  ".flac": "audio/flac",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".webp": "image/webp"
};

/** 自定义协议返回文件流时必须自己带 Content-Type，浏览器不会按扩展名猜。 */
export const getMediaContentType = (filePath: string): string =>
  mediaContentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";

export const isSupportedAudioFile = (filePath: string): boolean =>
  supportedAudioExtensions.has(extname(filePath).toLowerCase());

export const isSupportedImageFile = (filePath: string): boolean =>
  supportedImageExtensions.has(extname(filePath).toLowerCase());

export const isSupportedMediaFile = (kind: MediaKind, filePath: string): boolean =>
  kind === "audio" ? isSupportedAudioFile(filePath) : isSupportedImageFile(filePath);

export interface ResolvedMediaRequest {
  readonly filePath: string;
  readonly kind: MediaKind;
}

/** 把 `arlt-hifi-media://audio/<encoded path>` 解析为受控文件路径。 */
export const resolveMediaRequest = (requestUrl: string): ResolvedMediaRequest | null => {
  let url: URL;

  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  const kind: MediaKind | null = url.host === "audio" ? "audio" : url.host === "image" ? "image" : null;

  if (!kind) {
    return null;
  }

  const encodedPath = url.pathname.replace(/^\//, "");

  if (encodedPath.length === 0) {
    return null;
  }

  try {
    return { kind, filePath: decodeURIComponent(encodedPath) };
  } catch {
    return null;
  }
};

export interface MediaAccessList {
  /** 替换该类型的整个白名单（扫描结果用）。 */
  readonly add: (kind: MediaKind, filePaths: readonly string[]) => void;
  readonly allow: (kind: MediaKind, filePaths: readonly string[]) => void;
  readonly has: (kind: MediaKind, filePath: string) => boolean;
}

/** 每种媒体类型只允许播放/显示被显式放行的文件。 */
export const createMediaAccessList = (): MediaAccessList => {
  const allowedPaths: Record<MediaKind, Set<string>> = {
    audio: new Set<string>(),
    image: new Set<string>()
  };

  return {
    allow: (kind, filePaths) => {
      const target = allowedPaths[kind];
      target.clear();

      for (const filePath of filePaths) {
        if (isSupportedMediaFile(kind, filePath)) {
          target.add(filePath);
        }
      }
    },
    add: (kind, filePaths) => {
      const target = allowedPaths[kind];

      for (const filePath of filePaths) {
        if (isSupportedMediaFile(kind, filePath)) {
          target.add(filePath);
        }
      }
    },
    has: (kind, filePath) => allowedPaths[kind].has(filePath)
  };
};
