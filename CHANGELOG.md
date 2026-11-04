# Changelog

本文件记录可发布版本的变化。二进制产物只发布在 GitHub Releases，仓库内不保留安装包。

## [1.0.0] - 2026-11-04

首个可发布版本：本地托管曲库 + 3D CD 货架 + CD 盒详情 + 唱片机播放。

### 新增

- 托管曲库：导入 `flac` / `wav` / `mp3` / `m4a` / `ogg`，复制到 `userData/library/<artist>/<album>/<title>.<ext>`，按 `(大小, 时长, 前 256KB SHA-1)` 去重；重命名 / 设封面 / 删除只作用于副本。
- 3D CD 货架：单排实时货架，左右拖动限制在 CD 列表内并带阻尼回弹；搜索可直接飞到目标 CD。
- CD 盒详情：透明宝石盒开盖、盘片拖出、合盒返回。
- CD 唱片机：盘片吸附、Start/Stop 起转、唱臂拖拽与自动回架、落针播放；状态灯与转盘映射真实播放/电机状态。
- CD 详情播放条：进度拖动 / 点击 / 键盘 seek、上一首 / 播放 / 下一首、顺序 / 循环 / 随机，播放键与唱片机共用同一段逻辑。
- 曲库管理：CD 目录树、拖拽合曲与调序、CD 名与歌名行内编辑、批量合并多首为一张 CD、旧库重扫与目录监听。
- 导入体验：取消 / 续传、进度反馈、失败原因提示。
- 设置：材质预设（台面 / 台底 / 墙面）、四档光效、音量环、曲库导入与管理入口。
- 素材署名：CD 盒与唱片机模型按 CC-BY 4.0 在设置浮层署名。
- 在线演示：同一份渲染层可打成静态站点（`pnpm build:web`，内置示例曲库）发布到 GitHub Pages，推送 `main` 由 `.github/workflows/deploy-pages.yml` 自动构建部署；导入曲库、真实播放与设置持久化只在桌面版可用。

### 工程

- monorepo（pnpm workspace）：`apps/desktop`、`packages/shared`、`packages/ui`。
- 安全边界：渲染层只经 preload API 通信，音频与封面经受控媒体协议（支持 Range）读取。
- 静态资源统一走 `assetUrl()` + Vite `BASE_URL`，桌面端（`./`）与 Pages 子路径部署共用同一套代码。
- 质量门禁：`pnpm typecheck` 全绿；`pnpm test` 24 个文件 / 187 个用例（desktop 176 + shared 11）；`pnpm build` 与 `pnpm build:web` 均通过。
- 发布配置：electron-builder 26.18.0，Windows NSIS 安装包（非一键安装、带开始菜单/桌面快捷方式与卸载项），`asar` 打包，产物名 `arlt-hifi-1.0.0-setup.exe`（102,765,961 B，未签名）。
- 安装向导用自定义页（`apps/desktop/build/installer.nsh`）同时选择「软件安装位置」和「曲库位置」：输入框直接显示**最终路径**（选中父目录时自动补 `Arlt-HiFi` / `Arlt-HiFi Library`，并合并多余反斜杠），下方实时预览；曲库默认与软件目录同级，避免卸载误删，安装器把选择结果写进 `userData/install.ini` 供应用读取。
- 许可证：代码 MIT（`LICENSE`），第三方模型 CC-BY 4.0 / 贴图 CC0 按原许可署名。

### 已知限制

- 安装包未做代码签名，SmartScreen 会提示"未知发布者"；安装程序与主程序都不签名。
- 曲库目录在安装时选择，安装后暂不支持在应用内更改；`settings.json`、`library.json` 与封面仍固定在 `%APPDATA%\Arlt-HiFi`。
- 装包版的完整交互链路（导入 → 播放 → 开盒 → 拖盘上机 → 落针 → 播放模式 → 重启恢复）仍待真机手测；本次仅校验了包内文件、版本信息与哈希。
- 列表视图、无 WebGL / 低帧率降级不在 v1.0 范围内。
- 标签写回、拆文件与性能收口留待后续版本。

### 发布产物

- `arlt-hifi-1.0.0-setup.exe`
- SHA-256：`6b7ce0c6b99ca51de8ad024f1f89f1ef9167754f76b10869fa012af72ece3f03`
