# Arlt-HiFi

Arlt-HiFi 是一款面向本地 HiFi 音乐播放体验的 Electron 桌面音乐播放器。曲库由软件托管（导入即复制），空间化为一条可横向滑动的 3D CD 货架：每张 CD 对应一张专辑，点击进入 CD 盒详情，搜索可直接飞到目标 CD；详情右侧的唱片机可以放盘、起转、落针播放。

## 在线演示

[打开网页演示](https://arletaaa.github.io/Arlt_HiFi/) — GitHub Pages 托管的是渲染层静态包，内置示例曲库，可以体验 3D 货架、搜索、开盒与唱片机交互。

网页版没有主进程：导入曲库、真实音频播放和设置持久化都依赖 Electron 与本地媒体协议，这些只在[桌面版](#发布与下载)里可用。演示站由 [deploy-pages.yml](.github/workflows/deploy-pages.yml) 在推送到 `main` 时自动构建；首次部署需在仓库 Settings → Pages 把 Source 设为 "GitHub Actions"。

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
Get-FileHash apps/desktop/release/arlt-hifi-1.0.1-setup.exe -Algorithm SHA256
```

- 安装位置与数据位置是两回事：安装向导里可以分别选择「软件安装位置」和「曲库位置」，两者都会在你选择的路径下**新建文件夹**（`Arlt-HiFi` 与 `Arlt-HiFi Library`），并实时显示最终路径。曲库导入后会把音频复制进 `Arlt-HiFi Library`，卸载不会删除它；设置、`library.json` 与封面仍在 `%APPDATA%\Arlt-HiFi`。
- 版本记录见 [CHANGELOG.md](CHANGELOG.md)，当前版本的发布说明见 [docs/releases/v1.0.1.md](docs/releases/v1.0.1.md)。
- 许可证：[MIT](LICENSE)（第三方模型/贴图按各自许可，见 [CREDITS](apps/desktop/public/textures/CREDITS.md)）。
- 交互参考：[The Complete Shelf](https://github.com/MengTo/complete-shelf)（MengTo），仅借鉴连续货架与抽取详情的交互思路，未使用其代码或素材。

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

网页预览使用 `?demo=1` 注入示例曲库；导入、曲库管理等主进程能力在该模式下会提示改用桌面应用。把同一份渲染层打包成静态站点（GitHub Pages 用）：

```bash
pnpm --filter @arlt-hifi/desktop build:web   # 产物：apps/desktop/dist
```

## 当前进度

v1.0.1 已发布：单排 CD 货架 + CD 盒 + 唱片机 + CD 详情信息条、搜索/进度/键盘、曲库导入与管理、标签补齐、导入取消/续传、媒体 seek 均已完成；`typecheck` / `test`（desktop 180 + shared 11）/ `build` / `build:web` 全绿。收藏、长廊/Bay、列表降级不在 v1.0；后续拆文件、性能收口与标签写回不列入本次交付。[收尾清单](docs/product/next-steps.md)、[roadmap](docs/product/roadmap.md)。

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

## 致谢

- [The Complete Shelf](https://github.com/MengTo/complete-shelf)（MengTo）：连续 3D 货架、从货架抽取到详情视图的交互参考。本项目的货架漫游、开盒与取盘交互受其启发，但代码为 React Three Fiber 独立实现，未复制其代码，也未使用其素材；该仓库不随本项目分发。
- [ambientCG](https://ambientcg.com)（CC0 贴图）、CD 盒与唱片机模型的作者（CC-BY 4.0），详见 [CREDITS](apps/desktop/public/textures/CREDITS.md)。
