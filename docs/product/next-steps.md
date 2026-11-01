# v1.0 收口清单与下一步

> 最后更新：2026-10-30
> 范围依据：[ADR 007](../decisions/007-v1-scope-convergence.md)、[roadmap](roadmap.md)、[交接记录](../workflow/handoff.md)。
> 本文只记录“还没完成什么、接下来做什么”。

## 0. 已定范围（2026-10-30）

- **画廊收敛为单排货架**：长廊 / Bay 生长 / 跨 Bay 移动移出 v1.0，转入 v1.1+ backlog。
- **删除收藏需求**：不做入口、金边、列表 ★；现有 favorites 代码作为死代码清理。
- **降级不做 v1.0 门禁**：列表视图、无 WebGL 降级、低帧率自动降级都不要求；只保留基础键盘与 ARIA。
- **进度与参数展示迁入 CD 详情新 UI**：不恢复旧播放栏，在详情场景里加轻量信息条。
- **原 MVP 与长廊规格标记取消**：保留历史，不再作为验收基线。

## 1. 当前基线

- 主链路已通：托管曲库导入/管理 → 3D CD 货架 → CD 盒详情（开盖/取盘）→ 唱片机（吸附/起转/落针播放）→ 返回展厅。
- 搜索、排序、设置（材质/四档光效/音量）、音量环、详情播放条（顺序/循环/随机）已接入。
- 2026-10-30：`pnpm typecheck` 四个 workspace 项目通过；用户在真实桌面启动并跑过主流程，确认正常。
- 2026-10-29 23:55 有 `dist` / `dist-electron` 构建产物，晚于最后一次源码改动。
- **未验证**：最新提交后的 `pnpm test` / `pnpm build` 未在受限会话复跑；Windows 安装包从未实际构建。

## 2. P0：交付前必须完成

### P0-1 门禁复跑

- [x] 在非 DSH 沙箱环境跑 `pnpm typecheck` / `pnpm test` / `pnpm build`。
- 结果：三条命令退出码 0；`typecheck` 4 个 workspace 项目；`test` 19 个文件 / 157 个用例（desktop 140 + shared 11 + harness 6）；`build` 产出 `dist` 与 `dist-electron`。
- 备注：Vite 仍提示 `gallery-stage` chunk 907.93 kB（gzip 247.56 kB），不阻塞构建。

### P0-2 Windows portable 打包

- [x] `pnpm --filter @arlhifi/desktop dist`（配置见 `apps/desktop/electron-builder.yml`）。
- 结果：`apps/desktop/release/ArltHiFiPlayer-0.1.0-portable.exe`，98,435,549 B；未签名。
- 构建修正：`electron` 移到 `devDependencies`，新增 `electron-builder@26.18.0` 与 `author`。

### P0-3 安装包冒烟

- [x] **启动与主界面**：portable 包从 `LOCALAPPDATA` 启动，加载 `arlt-hifi-app://bundle/index.html`；canvas、preload、封面与 5 张专辑正常，截图见 `.verify/shots/package-smoke.png`。
- [ ] **完整交互**：导入文件夹 → 播放 → 开盒 → 拖盘上机 → 落针 → 顺序/循环/随机 → 返回 → 重启恢复设置，仍待真机手测。
- 备注：装包版读取的是现有 `%APPDATA%\Arlt HiFi Player` 曲库，说明 manifest 与媒体协议在打包后可用。

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
- **验证**：typecheck/build 通过；store/queue 单测 157 项全绿（2026-10-30）；详情条 1440×900 实拍见 `.verify/shots/detail-player-controls.png`（dev 预览态）。

### 3.2 CD 多曲入库与管理（已实现基础版）

- [x] 读取 `albumArtist` / `discNumber` / `trackNumber`，按 `albumArtist + album + disc` 归组，按碟号/音轨号排序。
- [x] 管理层逐首编辑专辑/专辑艺术家/碟号/音轨号；相同值自动合并为一张 CD，覆盖写入 manifest，不移动文件、不写标签。
- [ ] 批量选择多首一起合并。
- [ ] 旧 manifest 重扫，补齐新字段。
- 不做“导入文件夹作为一张 CD”；同一专辑由软件按标签自动识别，标签不对时由用户手动管理。
- 说明见 [CD 模型与多曲归组](cd-album-model.md)。

### 3.3 清理收藏死代码

- [ ] 删除 `favorites`：shared 类型、`AppSettings` / `PlayerSnapshot`、player-store 的 state/action、settings-store 的读写、use-settings-sync、demo 数据、相关单测。
- 验收：仓库内不再有 `favorites` / `toggleFavorite` 引用；旧 `settings.json` 里的 `favorites` 字段被忽略；typecheck/test 通过。

### 3.4 基础键盘与 ARIA（可选）

- [ ] 搜索框、设置、返回已有基础 ARIA；补 Tab 焦点顺序与 Esc 行为。
- 不做列表视图、无 WebGL 降级、低帧率自动降级。
- 验收：不碰鼠标可完成“浏览 → 打开 CD → 播放/暂停 → 返回”；不要求降级视图。

### 3.5 曲库日常运维（可排 v1.1）

- [ ] 切回窗口刷新曲库：该逻辑在“管理歌曲改为叠加弹窗”时被移除，确认是否恢复。
- [ ] 文件夹监听 / 手动刷新。
- [ ] 导入取消 / 断点续传。
- [ ] 重命名写回标签（需要 tag writer，单独评估）。

## 4. P2：工程与打磨

- [ ] 拆 `gallery-stage.tsx`（800+ 行）与 `case-detail.tsx`（746 行）。
- [ ] 组件级测试：目前只有纯函数、store、Electron 单测。
- [ ] 帧率与显存收口：1280×820 ≥ 45fps、纹理 LRU、静止零渲染。
- [ ] 构建冒烟进 CI（当前 GitHub Actions 已删除）。
- [ ] 唱片机 GLB 6.18 MB：首次进入加载时间与缓存策略。
- [ ] 静音按钮（可选，与音量环/设置重复，不列为必须）。

## 5. 建议顺序

1. **P0-1 门禁复跑 → P0-2 打包 → P0-3 装包冒烟**：先证明“可交付”。
2. **CD 多曲入库与管理**：导入文件夹作为 CD + 管理合并；这是下一步产品工作。
3. **清理收藏死代码**：独立提交，便于回滚。
4. **可选键盘 / 曲库运维 / P2**：不阻塞交付。

## 6. 明确不做（v1.0）

- 长廊 / Bay 生长、跨 Bay 移动。
- 收藏、金边外观、收藏列表。
- 列表视图、无 WebGL 降级、低帧率自动降级。
- 队列页、悬浮播放台、旧播放栏。
- Rust audio-core、自动更新、崩溃上报、账号/云同步、装饰性舞台。
