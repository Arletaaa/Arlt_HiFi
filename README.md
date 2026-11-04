# Arlt-HiFi

Arlt-HiFi 是一款面向本地 HiFi 音乐播放体验的 Electron 桌面音乐播放器。曲库由软件托管（导入即复制），空间化为一条可横向滑动的 3D CD 货架：每张 CD 对应一张专辑，点击进入 CD 盒详情，搜索可直接飞到目标 CD；详情右侧的唱片机可以放盘、起转、落针播放。

## 产品方向

- 托管曲库：导入的 `flac`、`wav`、`mp3`、`m4a`、`ogg` 复制到 `userData/library/<artist>/<album>/<title>.<ext>`，按 `(大小, 时长, 前 256KB SHA-1)` 去重；重命名 / 设封面 / 删除只作用于副本。
- 3D 画廊：唯一主视图，实时渲染的单排 CD 货架；左右拖动限制在 CD 列表内，越界会带阻尼回弹。点击 CD 打开详情的透明宝石盒，可开盖、拖出盘片；右侧 CD 唱片机支持吸附盘片、起转和唱臂落针播放。场景是"曲库本身"，不是装饰舞台——判定与边界见 [ADR 005](docs/decisions/005-scene-gallery.md)。
- 搜索与排序：标题 / 艺术家 / 时长 / 导入时间排序；搜索框列出匹配曲目，回车或点击飞到对应 CD 并抽出高亮。
- 播放 MVP：使用 `HTMLAudioElement` 播放托管曲目。把盘片放上唱片机、落下唱臂即开始播放，抬起唱臂即暂停；详情页左下角的播放条提供可拖动进度、上一首 / 播放 / 下一首，以及顺序 / 循环 / 随机三种模式。播放键与唱片机 Start/Stop 共用同一段逻辑，循环作用于整张 CD；右下角音量环支持拖拽 / 滚轮 / 键盘。
- CD 与多曲：一张 CD 对应一个专辑组，组内曲目按碟号 / 音轨号排序；详情播放条只在这张 CD 内切歌。归组规则与导入/管理计划见 [CD 模型](docs/product/cd-album-model.md)。
- 设置：场景材质预设（台面 / 台底 / 墙面）与光效（晨光 / 夜色 / 聚光 / 星空）、曲库导入与管理、音量；播放模式已移到详情播放条，管理弹窗可编辑 CD 信息并批量合并多首为一张 CD。
- 安全边界：React 通过 preload API 与 Electron 主进程通信，不直接访问 Node/Electron；本地音频与封面通过受控媒体协议读取。
- 素材署名：CD 盒与唱片机模型均为 CC-BY 4.0，署名入口在设置浮层底部。

## 技术栈

- pnpm workspace
- Electron（主进程与 preload 由 esbuild 打包）
- React
- TypeScript strict mode
- Vite
- Zustand
- three.js + @react-three/fiber（场景层）
- Tailwind CSS（preflight）
- Vitest

## 发布与下载

- 可发布产物是 Windows 安装包：`arlt-hifi-<version>-setup.exe`（NSIS，非一键安装，可自选安装目录）。当前未签名，SmartScreen 会提示"未知发布者"。
- 安装包**不入库**：`apps/desktop/release/` 已在 `.gitignore` 中，产物只挂到 GitHub Releases。仓库保留源码、构建配置与署名，减少仓库体积与历史负担。
- 本地出包与校验：

```bash
pnpm install
pnpm build
pnpm --filter @arlt-hifi/desktop dist   # 产物：apps/desktop/release/arlt-hifi-<version>-setup.exe
Get-FileHash apps/desktop/release/arlt-hifi-1.0.0-setup.exe -Algorithm SHA256
```

- 安装位置与数据位置是两回事：程序默认装在当前用户目录（可改装到 D 盘），但设置、`library.json`、封面与**导入后复制的曲库**都在 `%APPDATA%\Arlt-HiFi`（默认 C 盘）。曲库体积等于导入音频总量，卸载时可选择是否保留。
- 版本记录见 [CHANGELOG.md](CHANGELOG.md)，当前版本的发布说明见 [docs/releases/v1.0.0.md](docs/releases/v1.0.0.md)。
- 许可证：[MIT](LICENSE)（第三方模型/贴图按各自许可，见 [CREDITS](apps/desktop/public/textures/CREDITS.md)）。

## 本地开发

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会启动 Vite 前端开发服务并打开 Electron 桌面窗口。只调试前端页面时：

```bash
pnpm dev:web
```

`pnpm start` 运行生产构建（`pnpm build` 之后），可附带 Electron 参数，例如 `pnpm start -- --remote-debugging-port=9224`。

如果项目目录受 Windows 权限限制（例如 DSH 工作区：Low integrity / deny-delete），Electron 无法直接从工作区启动；`dev` / `start` 会自动把运行时复制到 `%LOCALAPPDATA%\arlt-hifi-dev\electron-<version>` 再启动，首次会多花几秒。

网页预览使用 `?demo=1` 注入示例曲库；导入、曲库管理等主进程能力在该模式下会提示改用桌面应用。

## 当前进度

v1.0.0 已发布：单排 CD 货架 + CD 盒 + 唱片机 + CD 详情信息条、搜索/进度/键盘、曲库导入与管理、标签补齐、导入取消/续传、媒体 seek 均已完成；`typecheck` / `test`（desktop 171 + shared 11）/ `build` 全绿。收藏、长廊/Bay、列表降级不在 v1.0；后续拆文件、性能收口与标签写回不列入本次交付。[收尾清单](docs/product/next-steps.md)、[roadmap](docs/product/roadmap.md)。

## 质量检查

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @arlt-hifi/desktop dist  # Windows 安装包（NSIS）
pnpm --filter @arlt-hifi/desktop dist:offline  # 无签名/无网络时快速出包
```

`dist` 产物在 `apps/desktop/release/arlt-hifi-<version>-setup.exe`，当前未签名。`dist:offline` 会跳过 EXE 图标/版本编辑与签名，只用于本地冒烟。

如果项目目录受 DSH 的 Windows 权限限制，**不要直接从 `release/` 运行未打包的 `win-unpacked`**：会被 ACL 拦住而无反应。测安装包时先复制到桌面或 `%LOCALAPPDATA%`，或在真机上直接安装。

## 工作区结构

- `apps/desktop`：Electron + React 桌面应用（渲染层、`src/scene/` 场景层、主进程）
- `packages/shared`：共享类型、工具函数与格式化
- `packages/ui`：设计 token 与基础 UI 组件
- `docs/product`：产品愿景、MVP、场景规格与路线图
- `docs/decisions`：架构决策记录（ADR）
- `fixtures/audio`：音频测试样本占位说明
- `fixtures/visuals`：视觉资源占位说明

## 当前阶段约束

- TypeScript 使用 strict mode。
- 不使用 `any`，除非用注释解释原因。
- 当前播放 MVP 使用 `HTMLAudioElement`，不接入 Rust audio-core。
- 3D 场景是"曲库本身"：每个 3D 元素都必须对应真实曲目或真实播放状态。
- 唱片机的转盘、唱臂、状态灯必须映射真实播放/电机状态，不做纯装饰动画。
- 不做装饰性右侧舞台、角色立绘、Live2D、MV 或视频背景。
- 场景代码只运行在渲染层，封面图片只通过受控媒体协议读取。
