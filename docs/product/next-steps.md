# v1.0 收口清单与下一步

> 最后更新：2026-11-04
> 范围依据：[ADR 007](../decisions/007-v1-scope-convergence.md)、[roadmap](roadmap.md)。
> 2026-11-04 收尾：v1.0 交付完成。拆文件、标签写回、性能收口与 CI 不再列入本次交付，保留为后续 backlog。
> 本文保留“还没完成什么”的历史记录，方便后续排期。

## 0. 已定范围（2026-10-30）

- **画廊收敛为单排货架**：长廊 / Bay 生长 / 跨 Bay 移动移出 v1.0，转入 v1.1+ backlog。
- **删除收藏需求**：不做入口、金边、列表 ★；`favorites` 代码已从类型、store、settings、demo 与单测清理。
- **降级不做 v1.0 门禁**：列表视图、无 WebGL 降级、低帧率自动降级都不要求；只保留基础键盘与 ARIA。
- **进度与参数展示迁入 CD 详情新 UI**：不恢复旧播放栏，在详情场景里加轻量信息条。
- **原 MVP 与长廊规格标记取消**：保留历史，不再作为验收基线。

## 1. 当前基线

- 主链路已通：托管曲库导入/管理 → 3D CD 货架 → CD 盒详情（开盖/取盘）→ 唱片机（吸附/起转/落针播放）→ 返回展厅。
- 搜索、设置（材质/四档光效/音量）、音量环、详情播放条（顺序/循环/随机）已接入；曲库排序已并入管理弹窗（CD 上下箭头写 `cdOrder`），设置页不再有排序。
- 管理弹窗是 CD 目录树：拖拽合曲/调序/拆单曲，CD 名与歌名行内改；陈列区左下角大字跟着正中 CD 变化（模糊滑入），小字是该 CD 的歌曲名（超长裁剪加 …）。
- 2026-10-30：`pnpm typecheck` 四个 workspace 项目通过；用户在真实桌面启动并跑过主流程，确认正常。
- 2026-10-29 23:55 有 `dist` / `dist-electron` 构建产物，晚于最后一次源码改动。
- **未验证**：最新提交后的 `pnpm test` / `pnpm build` 未在受限会话复跑；Windows 安装包从未实际构建。

## 2. P0：交付前必须完成

### P0-1 门禁复跑

- [x] 在非 DSH 沙箱环境跑 `pnpm typecheck` / `pnpm test` / `pnpm build`。
- 2026-11-04 发版复跑（1.0.0）：三条命令退出码 0；`typecheck` 3 个 workspace 项目；`test` 24 个文件 / 187 个用例（desktop 176 + shared 11）；`build` 产出 `dist` 与 `dist-electron`。
- 备注：Vite 仍提示 `gallery-stage` chunk 915.33 kB（gzip 249.85 kB），不阻塞构建。

### P0-2 Windows 安装包打包

- [x] `pnpm --filter @arlt-hifi/desktop dist`（配置见 `apps/desktop/electron-builder.yml`）。
- 1.0.0 结果：`apps/desktop/release/arlt-hifi-1.0.0-setup.exe`（NSIS 安装包），102,765,962 B；未签名；`FileVersion` / `ProductVersion` 均为 `1.0.0`。
- SHA-256：`a94675684445b704130a2453e9cb5ec9b54afd83462519fa341a8feb90216ddb`。
- 安装页：`apps/desktop/build/installer.nsh` 自定义页同时选择安装位置与曲库位置，两者都在所选路径下新建文件夹并实时预览；安装器把曲库路径写入 `userData/install.ini`，主进程 `install-paths.ts` 读取后作为导入目标。
- 构建修正：`electron` 移到 `devDependencies`，新增 `electron-builder@26.18.0` 与 `author`；`dist` 脚本不再硬编码 `--win portable`，目标由 `electron-builder.yml` 决定；本机直连 GitHub 不可用时用 `ELECTRON_BUILDER_BINARIES_MIRROR` 走镜像。

### P0-3 安装包冒烟

- [x] **启动与主界面（0.1.0 portable 包）**：portable 包从 `LOCALAPPDATA` 启动，加载 `arlt-hifi-app://bundle/index.html`；canvas、preload、封面与 5 张专辑正常，截图见 `.verify/shots/package-smoke.png`。
- [ ] **完整交互**：导入文件夹 → 播放 → 开盒 → 拖盘上机 → 落针 → 顺序/循环/随机 → 返回 → 重启恢复设置，仍待真机手测。
- 1.0.0 包本轮只做了静态校验：asar 内仅 `dist` / `dist-electron` / `package.json`（71 项，无 `node_modules`）、CREDITS 与模型贴图齐全、版本信息与哈希已记录；沙箱内无法弹出 GUI 窗口，启动冒烟请在真机复验。
- 备注：装包版读取的是现有 `%APPDATA%\Arlt-HiFi` 曲库，说明 manifest 与媒体协议在打包后可用。

### P0-4 文档与提交

- [x] README / roadmap / handoff / 唱片机文档同步。
- [x] 决策落成 ADR 007，MVP 与长廊规格标记取消。
- [x] 本轮决策文档提交并推送。
- [x] P0 结果、打包配置与阻塞项提交并推送。

## 3. P1：v1.0 剩余产品工作

### 3.1 CD 详情播放条（已实现，[ADR 008](../decisions/008-cd-playback.md)）

- **入口**：CD 放上转盘即出现（不要求已播放），替换详情页左下角专辑 caption；CD 取走才隐藏。
- **控制**：可拖动/点击/键盘 seek；上一首 / 播放 / 下一首；顺序 / 循环 / 随机；所有按钮可交互。
- **状态**：转 + 臂在盘上 = NOW PLAYING；转 + 臂抬起 = SPINNING（不出声、进度停）；不转 + 臂在盘上 = PAUSED；不转 + 臂抬起 = READY。
- **播放键**：与唱片机 Start/Stop 共用 `TurntableBridge.toggleStartStop`；臂抬起时只起转不出声，落臂才播放。
- **模式**：顺序 = 播到 CD 最后一首停止；循环 = 整张 CD 回绕；随机 = CD 内随机切歌。旧设置 `stop`/`repeat-one` 自动迁移。
- **单曲 CD**：仍然显示完整按钮；顺序模式下“下一首”重播当前曲，避免按钮失效。
- **参数**：真实格式 / 采样率 / 位深 / 质量，无 mock；缺失显示 `—`。
- **设置**：设置浮层不再有播放模式。
- **验证**：typecheck/build 通过；store/queue 单测 154 项全绿（2026-10-30）；详情条 1440×900 实拍见 `.verify/shots/detail-player-controls.png`（dev 预览态）。

### 3.2 CD 多曲入库与管理（已实现）

- [x] 读取 `albumArtist` / `discNumber` / `trackNumber`，按 `albumArtist + album + disc` 归组，按碟号/音轨号排序。
- [x] 管理层改成 CD 目录树：CD 名行内改名、可折叠、封面取组内第一首；歌曲行内改名。
- [x] 拖拽（行左 ⋮ 把手）把歌并进别的 CD / 组内调序；拖到「单曲 CD」区拆成单曲（写 `cdId`）。
- [x] CD 上下箭头调整 CD 顺序，写 `settings.json` 的 `cdOrder` 并切到「手动」排序，货架同序。
- [x] 一次拖拽的所有改动走一条批量 IPC（`library:apply-edits`）整体落盘，替换原来的逐首写入。
- [x] 设置里的「重扫标签」会重读旧库标签，补齐缺失的 `albumArtist` / `discNumber` / `trackNumber` 等字段；只补空缺，不覆盖已有专辑名、音轨号和单曲 CD 归属。
- 不做“导入文件夹作为一张 CD”；同一专辑由软件按标签自动识别，标签不对时由用户手动管理。
- 说明见 [CD 模型与多曲归组](cd-album-model.md)。

### 3.3 清理收藏死代码（已删除）

- [x] 删除 `favorites`：shared 类型、`AppSettings` / `PlayerSnapshot`、player-store 的 state/action、settings-store 的读写、use-settings-sync、demo 数据、相关单测。
- 验收：仓库内不再有 `favorites` / `toggleFavorite` 引用；旧 `settings.json` 里的 `favorites` 字段被忽略；typecheck/test 通过。

### 3.4 基础键盘与 ARIA（可选）

- [x] 基础键盘：陈列区 `←` / `→` 切 CD、`Enter` 打开居中 CD，交互区 `Esc` 返回；中心 CD 标题用 `aria-live` 播报。
- [x] 3D CD 的键盘投影：每张 CD 有只对读屏可见的按钮，Tab 聚焦时货架滑到它，Enter/点击直接打开。
- [x] 纯键盘闭环：交互区 `Space` 第一次把 CD 放上转盘，第二次自动落臂播放，再按暂停；`Esc` 返回。
- 不做列表视图、无 WebGL 降级、低帧率自动降级。
- 验收：不碰鼠标可完成“浏览 → 打开 CD → 播放/暂停 → 返回”；不要求降级视图。

### 3.5 曲库日常运维（可排 v1.1）

- [x] 切回窗口刷新曲库：窗口重新获得焦点时重新读取 manifest，外部删改曲目无需重启。
- [x] 文件夹监听：托管目录中的文件被外部删除/移动后自动重读清单并推送；切回窗口刷新也已接入。
- [x] 导入取消 + 断点续传：取消时返回未处理文件，设置里可点「继续导入 N 首」；已复制的曲目保留。
- [ ] 重命名写回标签（需要 tag writer，单独评估）。

## 4. P2：工程与打磨

- [x] **设置浮层的材质小球每次打开都重新加载**：已修。素材路径固定，改为模块加载时预热 + 自定义协议返回 `cache-control`（`assets/` 长缓存，贴图/模型 10 分钟），反复开关设置不再逐张重新读盘解码。
- [x] **拖拽 CD 过程中禁用点击**：已修。CD 的 click 用 R3F 的 `event.delta`（按下到松手的位移）判断，超过 6px 视为滑动，不打开详情，回归位置不再错乱。
- [ ] 拆 `gallery-stage.tsx`（800+ 行）与 `case-detail.tsx`（746 行）。
- [x] 组件级测试：新增 `DetailPlayer` 的 `react-dom/server` 渲染测试；交互级测试仍需 jsdom/testing-library。
- [ ] 帧率与显存收口：1280×820 ≥ 45fps、纹理 LRU、静止零渲染。
- [x] CI：按产品要求跳过，不接 GitHub Actions。
- [ ] 唱片机 GLB 6.18 MB：首次进入加载时间与缓存策略。
- [ ] 静音按钮（可选，与音量环/设置重复，不列为必须）。

## 5. 建议顺序

1. **P0-1 门禁复跑 → P0-2 打包 → P0-3 装包冒烟**：先证明“可交付”。
2. **CD 多曲管理**：逐首编辑、批量合并与旧库重扫均已完成。
3. **清理收藏死代码**：已完成。
4. **可选键盘 / 曲库运维 / P2**：不阻塞交付。

## 6. 明确不做（v1.0）

- 长廊 / Bay 生长、跨 Bay 移动。
- 收藏、金边外观、收藏列表。
- 列表视图、无 WebGL 降级、低帧率自动降级。
- 队列页、悬浮播放台、旧播放栏。
- Rust audio-core、自动更新、崩溃上报、账号/云同步、装饰性舞台。
