import { build } from "esbuild";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 主进程与 preload 必须打包：`@arlt-hifi/shared` 只发布 TS 源码，
 * Node 在运行时无法直接加载，之前 tsc 直接产出的 ESM 会让应用一启动就崩。
 * - main：ESM（package.json 是 `"type": "module"`）；
 * - preload：CJS `.cjs`（沙箱 preload 不支持 ESM import）。
 */
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isDev = process.argv.includes("--dev");
const outDir = join(desktopRoot, isDev ? ".dev-electron" : "dist-electron");

rmSync(outDir, { force: true, recursive: true });

const sharedOptions = {
  bundle: true,
  external: ["electron"],
  logLevel: "info",
  platform: "node",
  sourcemap: true,
  target: "node20"
};

await build({
  ...sharedOptions,
  entryPoints: [join(desktopRoot, "electron", "main.ts")],
  format: "esm",
  outfile: join(outDir, "main.js"),
  // 依赖里混着 CJS 代码会动态 require("tty") 之类；ESM 产物里补一个 require。
  banner: {
    js: 'import { createRequire as __arltCreateRequire } from "node:module"; const require = __arltCreateRequire(import.meta.url);'
  }
});

await build({
  ...sharedOptions,
  entryPoints: [join(desktopRoot, "electron", "preload.ts")],
  format: "cjs",
  outfile: join(outDir, "preload.cjs")
});
