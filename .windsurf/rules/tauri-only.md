---
description: 本项目仅在 Tauri 桌面环境中运行，无需 Web 浏览器兼容
---

# Tauri-Only 规则

## 核心原则

本项目是 **Tauri v2 桌面应用**，前端代码 **始终运行在 Tauri WebView 中**，不会在普通浏览器中使用。

## 禁止事项

1. **禁止 `isTauri()` 环境判断** — 永远是 Tauri 环境，不需要分支判断
2. **禁止 mock 数据 fallback** — 所有数据来自 Rust 后端 (SQLite)，不需要前端模拟数据
3. **禁止 `setTimeout` 模拟异步** — 使用真实 Tauri `invoke` 调用
4. **禁止 Web-only 降级逻辑** — 如 `if (!isTauri()) return` 等守卫条件

## 数据流

```
前端 (React + Zustand) → invoke() → Rust 命令 → SQLite 数据库
```

- 所有 CRUD 操作通过 `@tauri-apps/api/core` 的 `invoke` 调用
- Store 直接调用 `tauri-api.ts` 中的封装函数，无需 fallback
- 文件操作通过 Rust 命令（不用 Web File API）

## 可用的 Tauri 插件

- `@tauri-apps/plugin-dialog` — 文件/目录选择对话框
- `@tauri-apps/plugin-fs` — 文件系统操作
- `@tauri-apps/plugin-shell` — 外部命令执行

## 编码规范

- Store 中获取数据直接调用 API，catch 时 set 空数组/默认值，不要 set mock 数据
- 页面中的操作函数直接调用 API，不需要 `if (isTauri())` 包裹
- 错误处理统一使用 `toast.error()` + `console.error()`
