# ADR 002: 使用 pnpm workspace monorepo

## 状态

已接受。

## 背景

项目会同时包含桌面应用、共享类型、UI 组件、文档、fixtures，后续还会加入 audio-core。单仓库能让类型、测试和文档一起演进。

## 决策

使用 pnpm workspace：

- `apps/desktop` 放桌面应用。
- `packages/shared` 放共享类型与工具。
- `packages/ui` 放基础 UI 组件。
- `docs` 与 `fixtures` 放产品、架构与测试占位资源。

## 影响

- 依赖关系清晰，适合逐包 typecheck/test。
- 公共逻辑可以通过 workspace 包复用。
- 后续新增 Rust audio-core 时，应保持与 UI 和应用层解耦。
