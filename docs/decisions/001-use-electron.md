# ADR 001: 使用 Electron 构建桌面应用

## 状态

已接受。

## 背景

Arlt-HiFi 需要桌面级窗口、文件系统访问、本地音频播放能力，以及基于 Web 技术快速迭代安静克制的桌面播放器 UI。

## 决策

使用 Electron 承载桌面应用。渲染层使用 React + Vite，主进程与 preload 负责文件选择、音乐库扫描、受控本地媒体访问和后续原生音频桥接。

## 影响

- 前端开发体验快，适合 AI-assisted engineering 小步迭代。
- 可以逐步接入 Rust audio-core。
- 需要持续关注包体大小、启动速度和主/渲染进程边界。
