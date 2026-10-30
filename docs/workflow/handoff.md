# 交接状态（2026-10-30 收口 · 第七轮）

## 最新进展（2026-10-28 → 10-30）

| 日期 | 进展 |
| --- | --- |
| 10-28 | CD 开盒/盘片拖出转场；星空光效；曲库管理独立窗口 → 叠加弹窗；音量环归零与画廊边界修复 |
| 10-29 | 唱片机素材拆件（Deck/Platter/Tonearm/StartStop + 双灯）、1K 贴图、6.18 MB GLB；`turntable-interaction.ts` / `turntable.tsx` / `case-detail.tsx` 接入 |
| 10-30 | commit `79dd69d`：CD 吸附/弹出、Start/Stop 起停转、唱臂落针播放、双灯、播完即停、返回合盒、CC-BY 署名 |
| 10-30 | CD 详情播放条：可拖动进度、上一首/播放/下一首、顺序/循环/随机；播放键绑定唱片机按钮；CD 内多曲队列与元数据排序（ADR 008） |

- **范围定案**：2026-10-30 [ADR 007](../decisions/007-v1-scope-convergence.md)：v1.0 固定单排货架；删除收藏需求；列表/WebGL/低帧率降级不做门禁；进度与参数展示迁入 CD 详情新 UI；原 MVP / 长廊规格标记取消。
- **真机**：2026-10-30 用户在真实桌面启动并跑过主流程，确认正常。
- **门禁**：2026-10-30 复跑 `pnpm typecheck` / `pnpm test` / `pnpm build` 全绿；测试 19 个文件 / 154 个用例（desktop 137 + shared 11 + harness 6）。
- **打包**：新增 `electron-builder@26.18.0`，`electron` 移到 devDependencies，补 `author`；产出 `apps/desktop/release/ArltHiFiPlayer-0.1.0-portable.exe`（98,428,712 B，未签名）。
- **装包冒烟**：portable 从 `LOCALAPPDATA` 启动成功，加载 `arlt-hifi-app://bundle/index.html`，canvas / preload / 封面 / 5 张专辑正常（`.verify/shots/package-smoke.png`）。
- **播放验证**：详情播放条 1440×900 实拍 `.verify/shots/detail-player-controls.png`；store/queue/元数据单测覆盖顺序、循环、随机、单曲 CD、seek、上一首 3 秒规则、CD cue 与暂停切歌。
- **未完成**：装包版完整交互手测；CD 多曲入库/管理；收藏死代码清理。
- **文档**：README / roadmap / next-steps / 唱片机 / ADR 003/005/006/007/008 / [CD 模型](../product/cd-album-model.md)已同步。
- **下一步**：CD 多曲管理层（手动合并/编辑/排序）；清理 favorites；装包完整交互手测。导入侧不做文件夹归组，保持标签自动识别。
- **注意**：10-28 的“切回窗口刷新曲库”在改为叠加弹窗时被移除，当前只在启动、导入、管理操作后重新 `loadLibrary`。

## 这一阶段的成果（2026-10-27 快照）

| 领域 | 状态 |
| --- | --- |
| 主界面 | 3D 画廊 + 详情 + 设置浮层；画廊滑动限制在 CD 列表内，越界 30% 阻尼并自动回弹；旧 rail / player-bar / 列表页 / 队列页 / 播放台、壁纸与主题页**已全部删除** |
| 顶栏 | 搜索框（标题/艺术家/专辑近似匹配）+ 结果浮层（最多 8 条，↑↓/Enter/Esc），点击飞到对应 CD |
| 设置 | 全透明浮层（Portal 到 body）：音乐库导入 + 排序 + **管理歌曲（叠加弹窗）** + 材质球 + 三档光效 + 播放模式 + 音量 + 版权；间距已放宽 |
| 曲库 | **软件托管**：导入即复制到 `userData/library/<artist>/<album>/<title>.<ext>`，`userData/library.json` 是唯一真源；三元组去重、封面进 `userData/covers`；支持排序 / 重命名 / 设封面 / 删除 |
| 播放 | **循环播放 / 播完即停**两种模式，不做自动跳曲；有当前曲目时右下角显示音量环（拖拽 / 滚轮 / 键盘，ARIA slider + 读数）；HTMLAudioElement 播放链路保留 |
| 场景预设 | `scenePreset { table, base, wall, light }` 已写入 `settings.json`，台面 / 台底 / 墙面 / **光效**全部**实时驱动**；剪影已删除 |
| 持久化 | Electron 走 `settings.json`；网页预览走 `localStorage["arlt-hifi-settings"]` |
| 素材 | 12 套 2K 材质压缩为 36 个文件（8.9MB），按 `table/ base/ wall/` 分类；`CREDITS.md` 已登记（CC0 + CC-BY） |
| CD 模型 | 合盖版 GLB 接入，封面按内页包围盒精确贴合；详情场景可开盖、盘片可拖出并限位 |
| 光效 | 三档可切换：晨光（暖光柱 + 光斑）、夜色（冷色窄光柱 + 低照度）、聚光（顶部追光 + 光池）；见下文 |
| 阴影 | 已修复：墙面接收阴影、主光角度、台面投影、接触阴影（见下文记录） |
| 构建 | **Electron 主进程/preload 改 esbuild 打包**，修掉"应用一启动就崩"（之前 tsc 产物直接 import TS 源码） |
| 清理 | 删掉 10 个废弃组件、壁纸体系、不可达的播放台/扇开、shell.css 与死样式；CSS 46.4 KB → 22.9 KB |
| 门禁 | `pnpm typecheck` / `pnpm test`（104 + 11 + 6）/ `pnpm build` 全绿 |

## 阴影修复记录（第一轮）

### 根因（三个问题叠加，缺一不可）

1. **墙面不接收阴影**：`Shelf` 与 `BackWall` 的墙 mesh 都没有 `receiveShadow`，CD 的影子只能落在台面上。
2. **主光俯角过大**：原主光 `(3.6, 4.4, 2.4)` 的 `Ly / Lz = 1.83`，0.3m 远的墙面投影要下坠 0.55m；CD 高 1.04–1.56，影子整块落到 `y < 1.04`，正好被台面和 CD 自己挡住。看起来就像"阴影完全没生成"。
3. **台面不投影 + 环境光过亮**：台面只有 `receiveShadow`，所以台面前缘压到柜体的接触阴影根本不存在；`ambient 0.35 + hemisphere 0.2 + environmentIntensity 0.9` 又把本就微弱的投影洗平。

### 改动

- `gallery-stage.tsx`：墙加 `receiveShadow`、台面加 `castShadow`；主光改 `(2.8, 3.6, 3.4)`、强度 2.4、`mapSize 2048`、`bias -0.0003`、`normalBias 0.018`；`ambient 0.12` / `hemisphere 0.12` / `environmentIntensity 0.4`。
- `contact-shadows.tsx`（新增）：径向渐变黑色贴图当 `map`（不要用 `alphaMap`——three 的 alphaMap 取绿通道，canvas 透明渐变会退化成常量），每个 `Disc` 一片 0.68 × 0.3 的贴地平面，台面上方 1.5mm，`opacity 0.62`、`depthWrite: false`。

### 验证

- 对比图：[`shadow-before.jpg`](shadow-before.jpg) → [`shadow-after.jpg`](shadow-after.jpg)。
- 目视：CD 左后方墙面软投影、台面/柜体接触阴影、CD 底部贴地；画廊 64 calls / 8048 tri。

## 音乐导入与托管（第二轮，刀 3）

![设置浮层中的音乐库导入区](library-import.jpg)

### 数据模型

- 托管目录：`userData/library/<artist>/<album>/<title>.<ext>`（只复制受支持格式：flac/wav/mp3/m4a/ogg，原文件不动）。
- 曲库清单：`userData/library.json`，`{ version: 1, entries: [{ track, size, headSha1, importedAt }] }`。**manifest 是唯一真源**，启动时读它，并顺手剔除已被手工删掉的文件。
- 去重三元组：`(文件大小, 时长, 前 256KB SHA-1)`；先比大小+时长，命中候选才读头部算哈希，避免几百 MB 母带整份哈希。
- 命名清洗：Windows 非法字符 `<>:"/\|?*` 与控制字符 → `_`，去掉尾部点/空格，单段 ≤ 80 字符；同名不覆盖，自动 ` (2)`、` (3)`。
- 封面沿用 `userData/covers/`，按托管后的路径哈希命名（同一首重复导入不会产生新封面文件）。

### IPC / 渲染进程

| 通道 | 行为 |
| --- | --- |
| `library:select-files` | 系统多选文件对话框（带音频过滤器），只选不复制 |
| `library:import-files` | 按路径复制入库，返回 `{ imported, skipped }` |
| `library:import-folder` | 目录对话框 + 递归收集受支持格式后导入，返回 `{ canceled, imported, skipped }` |
| `library:load` | 读 manifest 并返回曲目（同时刷新媒体协议白名单） |
| `library:import-progress` | 每处理完一个文件推一次 `{ completed, total }` |

- preload 新增 `selectAudioFiles` / `importAudioFiles` / `importAudioFolder` / `loadLibrary` / `onLibraryImportProgress`（返回取消订阅函数）。
- 导入完成后主进程立刻把新音频与封面加入媒体协议白名单（`addAudioFilePaths` / `addImageFilePaths`），不用重启即可播放。
- 渲染进程 `useLibraryImport` 负责对话框 → 导入 → 重新 `loadLibrary` → 重建队列 → 结果文案（导入 N 首 / 已存在 X 首 / 格式不支持 X 首 / 失败 X 首）。
- 设置浮层「音乐库」区：已托管数量 + 「选择音频文件」「导入文件夹」+ 进度（`正在导入 3/10`）与红色错误文案。
- 空曲库时画廊文案改为「曲库为空 · 右下角设置里可导入音乐」。
- **移除旧目录模型**：`select-music-directory` / `scan-music-directory` / `AppSettings.musicDirectory` / App 的目录扫描状态全部删除；网页预览点击导入会提示「请使用 Electron 桌面应用」。

### 构建链路修复（不修则应用无法启动）

- 现象：`electron .` 直接报 `ERR_UNKNOWN_FILE_EXTENSION ".ts"`。原因：主进程 `import "@arlhifi/shared"`，而该包 `exports` 指向 TS 源码，之前的 tsc 产物没有打包，Node 运行时无法加载。
- 另外 preload 编译成 ESM，而沙箱 preload 不支持 ESM import。
- 新增 `apps/desktop/scripts/build-electron.mjs`（esbuild）：
  - `electron/main.ts` → `main.js`（ESM、bundle、external 只有 `electron`；banner 注入 `createRequire`，供依赖里的 CJS 动态 `require("tty")` 使用）；
  - `electron/preload.ts` → `preload.cjs`（CJS，匹配沙箱 preload 限制）。
- `dev-electron.mjs` 改用同一打包脚本；`package.json` build 去掉 tsc emit、增加 esbuild devDependency；删除 `tsconfig.electron-build.json` / `tsconfig.electron-dev.json`。

### 验证

- 单测（真实临时目录 + 真实 WAV）：
  - `library-import.test.ts` 12 项：复制到 artist/album、进度回调、三元组去重（改名仍算重复）、同名 ` (2)` 不覆盖、不支持/不可读文件不中断批次、头部哈希只读 256KB。
  - `library-manifest.test.ts` 5 项：损坏 manifest 当空库、丢弃畸形条目、落盘回读、剔除被删文件。
  - `music-scanner.test.ts` 新增递归收集与大小写扩展名用例；修正 `createTrackFromFilePath` 对 `.FLAC` 的标题截断 bug。
- 网页预览截图：音乐库区、「14 首已托管」、两个按钮；点击后出现红色提示。
- **未验证**：真实 Electron 窗口里的文件对话框、IPC 导入、媒体协议播放。本机 Electron 创建窗口即 `0xC0000005` 崩溃（最小 `new BrowserWindow` 同样崩），属于当前 DSH 会话环境限制；需要在真实桌面会话跑 `pnpm dev` 复验。

## 管理音乐 + 搜索飞行 + 音量环（第三轮，刀 4）

![设置浮层里的排序与曲目管理](library-manage.jpg)

### 排序

- `AppSettings.librarySort: "title" | "artist" | "duration" | "imported"`，写进 `settings.json`，默认 `title`。
- `sortTracks`（曲目列表）与 `groupTracksForGallery(tracks, sortKey)`（画廊槽位）共用同一套 key；`imported` 直接保留 manifest 顺序。
- 画廊与设置里的曲目列表都会跟着排序；槽位还带 `durationSeconds`（整张专辑总时长）与 `order`（首次出现位置）。

### 管理（只动副本）

| 操作 | 行为 |
| --- | --- |
| 重命名 | `library:rename-track`：清洗标题 → 同目录改副本文件名（重名自动 ` (2)`）→ 更新 manifest 的 title/filePath；**id 保持不变**，收藏与队列不受影响 |
| 设封面 | `library:set-track-cover`：图片复制到 `covers/override-<id hash>-<时间戳>.<ext>`，删除旧的自定义封面（标签提取的封面不动） |
| 删除 | `library:delete-track`：删副本 + 自定义封面 + manifest 条目；渲染进程二次确认（第一次点「删除」变成「确认删除」） |

- 渲染进程 `useLibraryManage` 统一处理忙碌态/错误文案，成功后重新 `loadLibrary()`；每次变更后主进程重设媒体协议白名单。
- 设置浮层「曲目」区：默认折叠，展开后是滚动列表（标题/艺人·专辑·时长 + 重命名/封面/删除）；重命名是行内输入框（Enter 保存 / Esc 取消）。

### 搜索飞行

- 搜索**不再过滤画廊**：输入后在搜索框下方列出最多 8 条结果（标题 + 艺人·专辑），↑↓ 换选中项、Enter 飞、Esc 清空；点击结果同样触发。
- 飞行 = 把目标槽位滑到正中（循环时走最短方向，不改相机）；落地后该 CD 抽出 2.2 秒（前推 0.16、旋转 0.24、缩放 1.06）。
- 在详情/播放层级里搜索也会先回到画廊再飞行（`focusGroupId + focusNonce` 驱动）。
- 无障碍：输入框 `role="combobox"` + `aria-expanded/aria-controls/aria-activedescendant`，列表 `role="listbox"` / `option`。

![搜索飞行后目标 CD 被抽出](search-flight.jpg)

### 音量环

- `components/volume-ring.tsx`：270° SVG 仪表，指针拖拽（角度映射 0–100）、滚轮 ±5、方向键 ±5（Shift ±10）、Home/End。
- `role="slider"` + `aria-valuemin/max/now/valuetext`，中心数值读数；连按用 ref 取最新值，避免同一帧内多次事件丢步。
- 只要存在当前曲目就显示（详情场景里开始播放后也能直接调）；`stage === "player"` 目前不可达，见技术债。

![播放界面的音量环](volume-ring.jpg)

### 验证

- 单测：`library-manage.test.ts` 8 项（改名/重名避让/非法字符清洗、封面复制与旧覆盖删除、删除副本与条目）、`album-groups.test.ts` 增加 artist/imported/时长用例、`library-filter.test.ts` 增加 imported 排序。
- 网页预览：设置浮层排序 + 管理列表 + 行内重命名 + 二次确认；搜索浮层、点击后目标 CD 居中并抽出；音量环键盘 72→82、滚轮 82→77；排序切换后画廊首张从「八月」变为「静かな星」。
- **未验证**：Electron 窗口里的原生文件对话框、IPC 改名/换封面/删除。本机 Electron 仍无法创建窗口（`0xC0000005`），需在真实桌面会话跑 `pnpm dev` 复验。

## 清理与门禁（第四轮，刀 5）

### 删除

- **渲染层组件**：`app-rail`、`player-bar`、`queue-page`、`library-page`、`settings-page`、`track-row`、`cover-art`、`empty-state`、`vinyl-record`、`background-scene`。
- **壁纸体系**（ADR-006 决策 2 已把壁纸并入场景预设）：`wallpaper-store`、设置里的 `backgroundImagePath / wallpaperBlur / wallpaperDim`、`selectBackgroundImage` IPC、`createBackgroundMediaUrl` / `BackgroundImageSelectionResult`、`fixtures/themes`。
- **场景死代码**：`Fan`（扇开）、`PlayerStage`（播放台）、`stage` / `expandedGroup` 状态与对应 DOM（展开遮罩、播放控制条）、`Disc` 的 `isFavorite` / `scale` / `spinning`、`favoriteGroupIds` 整条 prop 链、未使用的 three 导入与 `DISC_RADIUS`。
- **其他**：`audio-controller`（seek 只有死播放栏在用）、`shell.css`（25 KB，133 个类没有一个活页面在用）、`base.css` 的 `.spin`、`scene.css` 里 17 个死类、`demo-params` 的 4 个死 helper、`HifiSignalInfo` 类型、墙面/柜体/台面只加载不使用的 normal map。
- **顺带修复**：详情页返回按钮原来压在左上 `MUSIC COLLECTION` 上（两者都在 top-left），下移到 `top: 96px`。

### 保留（有意为之）

- `favorites` 仍在 store / `settings.json` 里；2026-10-30 已决定删除该需求（ADR 007），代码待清理。
- `packages/ui` 的 Button / Knob 等组件当前没有调用方，但 token 样式 `@arlhifi/ui/styles.css` 仍被使用，包整体保留。
- `shared` 的 `formatSampleRate / formatBitDepth / getQualityLabel` 等格式化函数暂时没有 UI 调用方，将用于 CD 详情信息条。
- theme / motion 设置仍会写到 `<html data-theme/data-motion>`，由 `@arlhifi/ui` 的样式消费。

### 验证

- `pnpm typecheck`、`pnpm test`（101 + 11 + 6）、`pnpm build` 全绿；`tsc --noUnusedLocals --noUnusedParameters` 对渲染层与 electron 配置均无输出。
- 清理后画廊仍是 64 calls / 8048 tri；详情场景 17 calls / 2768 tri；设置浮层的音乐库 / 排序 / 管理 / 材质 / 音量均正常；CSS 产物 46.4 KB → 22.9 KB。

## 工作区权限导致的 Electron 启动崩溃（第五轮）

- 现象：`pnpm dev` / `pnpm start` 里 Vite 正常启动，Electron 随即以 **2147483651（0x80000003，STATUS_BREAKPOINT）** 退出；加 `--no-sandbox` 后变成 **3221225477（0xC0000005）**，都发生在 app ready 之前。
- 根因：**不是 Windows 26200 / GPU 沙箱**。`G:\MyProjects` 与项目目录带有 DSH 工作区的 Windows 权限设置（Low integrity 标签 + Everyone 删除子项 deny + `S-1-4-*` 授权）。把同一份 Electron 复制到 `G:\electron33-probe` 或 `%LOCALAPPDATA%` 就能启动，应用代码与 Windows 版本都正常；之前怀疑的 `--disable-gpu-sandbox` 无效，已移除。
- 修复 1（dev / start）：
  - 新增 `scripts/electron-runtime.mjs`：把 Electron 运行时复制到 `%LOCALAPPDATA%\arlt-hifi-dev\electron-<version>`，按版本缓存。
  - `scripts/dev-electron.mjs`、`scripts/start-electron.mjs` 优先使用缓存副本；首次仍从工作区启动，60s 内以 0x80000003 退出时自动复制并重启。`start` 改为 `node scripts/start-electron.mjs`，并把额外参数转发给 Electron（如 `pnpm start -- --remote-debugging-port=9224`）。
  - 两个脚本都会剥离宿主继承的 `ELECTRON_RUN_AS_NODE`。
- 修复 2（生产渲染白屏）：`file://` 下 Chromium 会拦截 module script，渲染层里的 `/textures/...` 绝对路径还会落到盘根。新增 `electron/app-protocol.ts`，生产包用 `arlt-hifi-app://bundle/index.html` 把 `dist` 当站点根（带 MIME 与路径穿越保护），不再用 `loadFile`。
- 附带：`app.setName("Arlt HiFi Player")`，让 dev / start / 打包产物统一用 `%APPDATA%\Arlt HiFi Player`（此前 dev 会落到 `%APPDATA%\Electron`）。
- 验证：`pnpm dev` 从缓存直接启动；`pnpm start -- --remote-debugging-port=9224` 打开 `arlt-hifi-app://bundle/index.html`，canvas 正常、preload API 存在、无资源 404（控制台只剩 Electron 的开发期 CSP 警告）。
- 注意：`%LOCALAPPDATA%\arlt-hifi-dev` 约 200MB；删掉后下次启动会重新复制。打包产物安装到正常目录后不依赖这个缓存。

## 场景预设与光效（第六轮）

- 删除「剪影」：设置项、`ScenePreset.silhouette`、默认值与 `mergeSettings` 读取、4 套 leaf 贴图（16 文件 2.14MB）一起移除；`CREDITS.md` / ADR-006 / README 同步。
- 光效移到原剪影的位置，并真正接入场景（`scene/light-effects.tsx`）：
  - **晨光**：6 片暖色光柱 + 150 个暖色光斑，暖主光；
  - **夜色**：3 片冷色窄光柱 + 70 个冷色光斑，压低环境光、主光转冷；
  - **聚光**：无光柱/光斑，顶部 SpotLight + 墙面/台面光池，压暗四周。
- 设置排版：保留原来的单栏透明浮层（不做两栏/深色卡片），只放宽间距——面板内边距 26/30、模块间距 20、材质两组列距 28、材质球条内边距 22/20、音量行上边距 28；光效组放在原剪影的位置（墙面同一行）。
- 验证：三档光效截图对比（晨光暖色光柱、夜色冷色低照度、聚光中央光池），设置浮层保持透明、背景可见，间距比原来宽松；`pnpm typecheck` / `pnpm test` / `pnpm build` 全绿。

## 音量环归零修复（2026-10-28）

- 现象：音量环拖到 0 后再往底部缺口挪一点，读数直接跳到 100。
- 根因：底部 90° 缺口内的角度被 `+360°` 后落进 405°–494°，再 clamp 成 100；设置里的线性滑块本身正常（CDP 验证归零保持 0）。
- 修复：`lib/volume.ts` 新增 `volumeFromPointerAngle`，缺口内返回 `null` 并忽略这次移动；`volume-ring.tsx` 用它替换原来的角度换算，并记录是否穿过了缺口——从另一侧出来且与当前值相差 >45 时保持当前边界值，回到当前值附近才重新接管。
- 验证：CDP 模拟拖拽——135°→0，穿过缺口到 100 侧仍为 0，回到 0 侧附近恢复为 2；从 100 穿过缺口到 0 侧仍为 100，回到 100 侧附近为 98。

## 播放模式与画廊边界（2026-10-28，播放模式部分已被 ADR 008 取代）

- 播放模式只剩「循环播放 / 播完即停」：`PlaybackMode = "repeat-one" | "stop"`，写入 `settings.json`；删除 sequential / shuffle、自动跳曲、`playNext` / `playPrevious` / `cyclePlaybackMode` 与队列导航纯函数。
- 播完行为：循环模式在 `ended` 事件里直接重播本曲（否则 store 状态没变化，effect 不会重跑）；即停模式保持暂停、`currentTrack` 不变。
- 设置底部新增「播放」两个选项（与音量同一行）；删除画廊右下角的三条横线（`.gallery-dashes`，原本在设置按钮左侧）。
- 画廊去掉无限循环：offset 限制在 `[-(n-1)*GAP, 0]`；越界拖动只有 30% 跟手，松手吸附并平滑回弹；不再取模、不再渲染 400 张。
- 验证：CDP 拖拽到最左后停在最后一张（小曲库 3 张也不扩散）；设置里切换模式时 `aria-pressed` 与 store 同步；音量环 0/100 穿越缺口不再跳变。

## 曲库管理叠加弹窗（2026-10-28）

- 「管理歌曲」不新开系统窗口，而是在设置浮层之上再叠一个同风格弹窗：设置保持打开，叠加层自己再应用一次 `backdrop-filter: blur(14px)` + 0.38 遮罩，形成第二层虚化。
- 弹窗通过 portal 挂到 body，`z-index: 10000`；内容为标题/数量 + 打开音频文件夹/刷新 + TrackManager 列表（重命名 / 封面 / 删除），列表区域加半透明底保证可读。
- 关闭按钮、Esc、点击弹窗背景都只关闭管理弹窗，设置保持打开（App 的 Esc 处理会避开管理弹窗）。
- 新增 `library:open-folder`：`mkdir` 后 `shell.openPath(userData/library)`；设置弹窗和管理弹窗都有按钮，网页预览提示改用桌面应用。
- 验证：CDP 检查两层 `.settings-overlay`、管理层 `z-index: 10000` 与 `blur(14px)`；关闭/Esc/背景点击后设置仍在；14 条示例曲目正常显示。

## 未解决（2026-10-27 快照）

> 以下清单是 10-27 的记录。唱片机接入后，部分条目已处理或性质变化；
> 最新缺口、优先级与待决事项见 [next-steps](../product/next-steps.md)。

### 1. 技术债

- **重命名没有写标签**：只改了副本文件名和 manifest 里的 title（`music-metadata` 只读，没有引入 tag writer）。重新导入同一个源文件会带回旧标签。
- 重命名正在播放的曲目时，`currentTrack` 仍按 id 保留旧对象（文件路径已变）；极端情况下暂停/恢复可能读不到文件。
- 搜索行为是"结果浮层 + 飞行"（按 ADR-006 决策 3），不再过滤画廊；如果还想要过滤需要另做开关。
- 设置浮层内容较长（音乐库 + 排序 + 管理 + 场景 + 播放模式 + 音量），极窄窗口下需要滚动；后续可把「管理」拆成独立面板。
- 导入在**批末**写 manifest：中途崩溃/断电会留下孤儿副本，再次导入同名文件会变成 ` (2)`；如需更强一致性，可每成功一首就落盘或先写临时清单。
- 曲库没有「刷新/监听文件变化」：手工往 `userData/library` 放文件不会被发现；删文件只在下次 `library:load` 时剔除。
- 导入是串行逐文件处理，没有取消；几百首的文件夹会占用 UI（有进度但没有停止按钮）。
- 设置面板的「光效」目前用 Canvas 贴图 + 叠加平面模拟（光柱/光斑/光池），不是真正的体积光；聚光灯参数在 `scene/light-effects.tsx` 顶部常量里调。
- `gallery-stage.tsx` 仍有 600+ 行，混了相机、货架、CD、详情、光效、搜索飞行、音量环，建议拆 `scene/shelf.tsx`、`scene/carousel.tsx`、`scene/stage.tsx`。
- 详情场景的盘片自转：10-30 已由唱片机转盘带动 CD 旋转，原限制解除。
- 网页预览的 `localStorage` 与 Electron 的 `settings.json` 是两套存储，字段变更时要同步 `mergeSettings`；且 demo API 存在时 `useSaveSettings` 走 demo 的 `saveSettings`，preview 实际不写 localStorage。
- `?merge=1` 的网格合并路径保留但默认关闭，未验证收益。
- 收藏需求已删除（ADR 007）；现有 store / `settings.json` 字段待清理。
- `electron-builder` 打包从未实际执行；开发版真实桌面已由用户于 10-30 确认，装包版仍需验证。
- `packages/ui` 的组件与 `shared` 的部分格式化函数暂无调用方（见"保留"）。

### 2. 后续方向

原始五刀已全部完成。接下来优先考虑：

1. 标签写入（重命名同步 tag），需要引入 tag writer 或按格式手写。
2. 曲库刷新/监听、导入取消与断点续传。
3. CD 详情信息条：进度 + seek + 格式 / 采样率 / 位深（不恢复旧播放栏）。
4. 基础键盘与 ARIA；不做列表 / WebGL 降级。
5. 组件级测试、Electron 打包冒烟与真机帧率验证。

最新优先级、验收标准与待决项已整理到 [next-steps](../product/next-steps.md)。

## 验收命令

```powershell
pnpm typecheck          # 四个 workspace 项目全绿（desktop 两个 tsconfig + ui + shared + harness）
pnpm test               # desktop 137 + shared 11 + harness 6（共 154）
pnpm build              # esbuild 打包 main/preload + vite 打包 dist
pnpm --filter @arlhifi/desktop dist  # electron-builder portable
pnpm dev:web            # http://localhost:5173/?demo=1&perf=1
pnpm dev                # Vite + Electron（首次会按需把运行时复制到 LOCALAPPDATA）
pnpm start              # 跑 dist；可跟参数，如 pnpm start -- --remote-debugging-port=9224
```

2026-10-30 验收补充：

- `pnpm typecheck`、`pnpm test`（154）、`pnpm build` 全部通过。
- `ArltHiFiPlayer-0.1.0-portable.exe` 已产出；从 `LOCALAPPDATA` 启动，app 协议、canvas、preload、封面与曲库加载正常。
- 装包版的完整导入/播放/唱片机交互仍需真机手测；安装包未签名。

本机环境提示（DSH 沙箱下）：

- `pnpm typecheck/test/build`、`vite`、Chrome、Electron 都需要 `danger-full-access`，否则子进程 `spawn EPERM`。
- 编辑器的原子保存会在源码目录生成 `.xxx.tmpdir` 临时目录，Vite 的 `fs.watch` 会 `EBUSY` 崩溃；用 `$env:CHOKIDAR_USEPOLLING='1'` 启动。
- `pnpm build` 需要把 `$env:TEMP` / `$env:TMP` 指到工作区内，否则 esbuild 删除系统临时文件被沙箱拒绝。
- DSH 环境自带 `ELECTRON_RUN_AS_NODE=1`：`dev` / `start` 脚本已在子进程环境里剥离；手动跑 Electron 时要自己 `Remove-Item Env:ELECTRON_RUN_AS_NODE`。
- **工作区目录不能直接启动 Electron**（DSH 的 Low integrity / deny-delete 权限会让 Chromium 以 0x80000003 崩），两个启动脚本已自动改用 `%LOCALAPPDATA%\arlt-hifi-dev\electron-<version>` 的副本；`--disable-gpu-sandbox` / `--no-sandbox` 都不是解法。
- 生产窗口用 `arlt-hifi-app://bundle/index.html`，不要再改回 `loadFile`（module script 会被拦、绝对资源路径会失效）。
- headless Chrome 正常；截图脚本可临时放 `.tmp-browser/shot.mjs`（Node 内置 WebSocket 直连 CDP），用完删掉。
