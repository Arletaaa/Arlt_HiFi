import electron from "electron";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";

const { protocol } = electron;

export const appScheme = "arlt-hifi-app";
const appHost = "bundle";

/** 生产构建的入口 URL；相对资源与 `/textures/...` 都会落在同一个源上。 */
export const appEntryUrl = `${appScheme}://${appHost}/index.html`;

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

/**
 * 生产包不能再用 `file://`：Chromium 会拦截 file:// 的 module script，
 * 而且渲染层里的 `/textures/...` 绝对路径会指到磁盘根目录。
 * 用自定义 scheme 把 dist 目录当作站点根，以上问题一起消失。
 */
export const registerAppProtocolPrivileges = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: appScheme,
      privileges: {
        secure: true,
        standard: true,
        stream: true,
        supportFetchAPI: true
      }
    }
  ]);
};

export const createAppProtocolHandler = (distDirectory: string) => ({
  registerHandler: (): void => {
    protocol.handle(appScheme, async (request) => {
      const url = new URL(request.url);
      const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/u, "");
      const filePath = normalize(join(distDirectory, requestPath.length > 0 ? requestPath : "index.html"));
      const relativePath = relative(distDirectory, filePath);

      if (relativePath.startsWith("..") || relativePath.includes(":")) {
        return new Response("Not found", { status: 404 });
      }

      try {
        const contents = await readFile(filePath);
        const contentType = contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
        // 资源文件名带构建哈希，可以长缓存；贴图/模型路径固定，给 10 分钟，
        // 保证反复开关设置时小球贴图不再重新读盘 + 解码。
        const cacheControl = requestPath.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=600";

        return new Response(contents, {
          headers: { "cache-control": cacheControl, "content-type": contentType }
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
  }
});
