# 更新管理页 (Update Manager)

> **路由**: `/updates`
> **侧边栏高亮**: 同步（子项）或独立入口
> **继承**: MASTER.md 全部规范

---

## 页面概述

集中管理所有 Skill 的版本更新。检测来自 skills.sh 和 Git 仓库的新版本，支持批量更新和单独更新。更新前自动备份，本地已修改的 Skill 更新时展示三方 Diff。

---

## 区域划分

### 顶部状态栏

- 标题（H1）："更新管理"
- 最近检查时间（Caption）："上次检查：5 分钟前"
- 「立即检查更新」Primary Clay 按钮（Lucide: `refresh-cw`）
- 检测频率显示（Caption，可点击跳转设置页）："每日自动检测"

---

### 可更新列表

当有可用更新时，展示更新卡片列表：

**每张更新卡片**（Clay Card）：

| 区域 | 内容 | 样式 |
|------|------|------|
| 左侧 | Skill 名称（H3）+ 描述（Body，1 行截断） | |
| 版本对比 | `v1.0.0` → `v1.2.0` | 当前版本 `cream-500`，箭头 `peach-300`，新版本 `peach-600` 加粗 |
| 来源 | skills.sh / GitHub / Gitee | 来源 Badge |
| 本地修改标识 | 如本地有修改：⚠ "本地已修改" | 蜂蜜橙 Badge |
| 部署数量 | "已部署到 3 个位置" | Caption |
| 操作 | 「更新」按钮 + 「查看变更」Ghost | |

**卡片交互**：
- hover：shadow-card → shadow-card-hover + scale 1.02
- 本地已修改的卡片左侧有 3px 蜂蜜橙色条
- 列表 stagger 渐入

**批量操作栏**（列表顶部）：
- `@shadcn/checkbox` 全选
- `@shadcn/button` 「批量更新选中」Primary Clay
- `@shadcn/select` 更新范围下拉：仅本地 Skill 库 / 本地 Skill 库 + 所有部署 / 自定义选择

---

### 单个 Skill 更新流程

点击「更新」按钮：

**无本地修改时**：
1. 按钮变 loading（SpinningStar）
2. 下载新版本 → 备份旧版本 → 更新本地 Skill 库 + DB
3. 弹出 `@shadcn/alert-dialog` 确认："是否同步到所有已部署位置？"
4. 完成后卡片从列表中移除（缩小淡出动画）

**有本地修改时**：
1. 弹出 `@shadcn/alert-dialog` 提示："此 Skill 本地有修改，更新将覆盖"
2. 展示简要 Diff 预览
3. 操作选项：
   - 「覆盖本地修改」Danger
   - 「合并」Secondary（打开 diff-viewer 三向合并）
   - 「跳过」Ghost
4. 选择后执行更新

---

### 全部最新状态

当没有可用更新时：
- 卡通插画：小猫咪躺在沙发上放松
- 文案（H2）："所有 Skill 都是最新版本～"
- 副文案（Caption）："上次检查：刚刚"
- jellyPop 入场

---

### 更新历史区（`@shadcn/collapsible` 折叠面板）

- 标题（H2）："最近更新记录"
- 时间线列表（同 sync-center 操作历史样式）
- 每条：时间 + Skill 名称 + 旧版本 → 新版本 + 来源 + 结果状态
- 默认折叠，展开使用高度动画

---

## 异步操作

| 操作 | 加载方式 |
|------|---------|
| 检查 skills.sh 更新 | 按钮 Spinner + 文案 "正在检查 skills.sh..."（1s ~ 5s） |
| 检查 Git 仓库更新 | 按钮 Spinner + 文案 "正在检查 Git 仓库..."（1s ~ 5s） |
| 下载新版本 | 卡片内进度条（1s ~ 5s） |
| 备份 + 更新本地 Skill 库 | 卡片内 Spinner（< 1s） |
| 同步到所有部署位置 | 逐项进度（500ms ~ 10s） |
| 批量更新 | `@shadcn/progress` 全局进度条 + 逐项卡片状态更新（5s ~ 30s） |
| 加载可更新列表 | `@shadcn/skeleton` 页面骨架屏（卡片骨架 × 4） |
| 加载更新历史 | `@shadcn/skeleton` 面板内骨架屏 |