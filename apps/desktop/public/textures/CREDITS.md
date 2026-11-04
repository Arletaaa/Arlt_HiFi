# 素材来源与许可

本目录中的资源全部来自可自由使用的来源。**新增素材必须在此登记，否则不得提交。**

纹理统一按 `textures/<类别>/<材质 id>-{color,normal,roughness}.jpg` 存放：
颜色贴图最长边 2048、法线与粗糙度 1024，JPEG 渐进式，总计约 8.9 MB。

设置面板的材质球使用 `textures/swatches/<材质 id>.jpg`：由对应 `-color.jpg`
中心裁切后缩放到 192×192（quality 85），来源与许可同上，仅作预览，不参与 3D 渲染。

## 纹理（全部 ambientCG，CC0，无需署名）

| 类别 | 材质 id | 原始素材 |
| --- | --- | --- |
| `table/` | wood002 / wood007 / wood092 / wood096 | Wood002 / Wood007 / Wood092 / Wood096 2K JPG |
| `base/` | wood029 / wood066 / wood069 / wood095 | Wood029 / Wood066 / Wood069 / Wood095 2K JPG |
| `wall/` | fabric009 / fabric048 / leather012 / woodsiding009 | Fabric009 / Fabric048 / Leather012 / WoodSiding009 2K JPG |

来源：https://ambientcg.com — 许可证 CC0 1.0（可商用、可修改、无需署名）。

## 三维模型

| 文件 | 来源 | 许可 | 状态 |
| --- | --- | --- | --- |
| `apps/desktop/public/models/cd-case.glb` | [Sketchfab: cd-jewel-case](https://sketchfab.com/3d-models/cd-jewel-case-f6c8386e76e54918b551ebdd276479dd) | **CC-BY 4.0 — 必须署名** | 已启用，署名：`"CD Jewel Case" by 蓝人组合, licensed CC-BY 4.0, via Sketchfab` |
| `apps/desktop/public/models/cd-player.glb` | Sketchfab "CD player" — 作者 [nguyentrongtam0512](https://sketchfab.com/nguyentrongtam0512) | **CC-BY 4.0 — 必须署名** | 已启用，署名：`"CD player" by nguyentrongtam0512, licensed CC-BY 4.0, via Sketchfab` |

> CC-BY 要求界面可见署名：设置面板底部已同时显示两个模型的署名，且不得移除。

## 交互参考

- [The Complete Shelf](https://github.com/MengTo/complete-shelf)（MengTo）：连续货架漫游、抽取到详情视图的交互参考。本项目只借鉴交互思路，未使用其代码或素材，其仓库不随本项目分发。

## 规则

1. 只接受 **CC0 / 公有领域 / CC-BY（可署名）**；不接受 NC / ND / 来源不明。
2. 贴图入库前压缩：颜色 2048、法线与粗糙度 1024、单张 ≤ 1.5 MB。
3. 模型入库前确认面数 ≤ 5k、贴图内嵌（`.glb`）。
4. 新增类别时同步更新本文件与 `docs/decisions/006-library-and-scene-presets.md`。