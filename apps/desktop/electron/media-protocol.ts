import electron from "electron";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { createMediaAccessList, getMediaContentType, resolveMediaRequest } from "./media-access.js";
import { parseByteRange } from "./media-range.js";

const { protocol } = electron;

export const mediaProtocolScheme = "arlt-hifi-media";

export const registerMediaProtocolPrivileges = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: mediaProtocolScheme,
      privileges: {
        stream: true,
        supportFetchAPI: true
      }
    }
  ]);
};

const createFileStream = (filePath: string, start?: number, end?: number): ReadableStream<Uint8Array> => {
  const stream =
    start !== undefined && end !== undefined
      ? createReadStream(filePath, { end, start })
      : createReadStream(filePath);

  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
};

export const createMediaProtocolAccess = () => {
  const access = createMediaAccessList();

  return {
    /** 重新扫描时整体替换音频白名单。 */
    allowAudioFilePaths: (filePaths: readonly string[]): void => {
      access.allow("audio", filePaths);
    },
    /** 导入后累加放行：不能把还没重启的旧曲目挤掉。 */
    addAudioFilePaths: (filePaths: readonly string[]): void => {
      access.add("audio", filePaths);
    },
    /** 封面与壁纸累加放行：选择壁纸不能把已放行的封面挤掉。 */
    addImageFilePaths: (filePaths: readonly string[]): void => {
      access.add("image", filePaths);
    },
    registerHandler: (): void => {
      protocol.handle(mediaProtocolScheme, async (request) => {
        const resolved = resolveMediaRequest(request.url);

        if (!resolved || !access.has(resolved.kind, resolved.filePath)) {
          return new Response("Media file is not available.", { status: 403 });
        }

        let fileSize: number;

        try {
          fileSize = (await stat(resolved.filePath)).size;
        } catch {
          return new Response("Media file is not available.", { status: 404 });
        }

        const contentType = getMediaContentType(resolved.filePath);
        const range = parseByteRange(request.headers.get("range"), fileSize);

        if (range === "unsatisfiable") {
          return new Response(null, {
            status: 416,
            headers: {
              "accept-ranges": "bytes",
              "content-range": `bytes */${fileSize}`,
              "content-type": contentType
            }
          });
        }

        if (!range) {
          return new Response(request.method === "HEAD" ? null : createFileStream(resolved.filePath), {
            status: 200,
            headers: {
              "accept-ranges": "bytes",
              "content-length": String(fileSize),
              "content-type": contentType
            }
          });
        }

        return new Response(
          request.method === "HEAD" ? null : createFileStream(resolved.filePath, range.start, range.end),
          {
            status: 206,
            headers: {
              "accept-ranges": "bytes",
              "content-length": String(range.end - range.start + 1),
              "content-range": `bytes ${range.start}-${range.end}/${fileSize}`,
              "content-type": contentType
            }
          }
        );
      });
    }
  };
};
