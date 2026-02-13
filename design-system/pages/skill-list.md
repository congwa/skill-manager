# Skill 列表页 (Skill List)

> **路由**: `/skills`
> **侧边栏高亮**: Skills
> **继承**: MASTER.md 全部规范

---

## 页面概述

Skill 的全局浏览页面，提供 4 种视图模式切换。用户可在此查看所有 Skill 的分布、状态和部署情况。是 Skill 管理的核心入口。

---

## 视图切换标签栏

页面顶部水平标签栏，使用 `@shadcn/tabs`（`<Tabs>` / `<TabsList>` / `<TabsTrigger>` / `<TabsContent>`）：

| 标签 | 图标 | 说明 |
|------|------|------|
| 按工具 | Lucide: `wrench` | 以工具为一级分类 |
| 按项目 | Lucide: `folder-open` | 以项目为一级分类 |
| 全局汇总 | Lucide: `layers` | 去重汇总所有 Skill |
| 全局 Skill | Lucide: `globe` | 仅全局目录部署的 Skill |

- 当前选中标签：`bg-peach-100 text-peach-700 border-peach-300`
- 标签下方滑动指示条：Framer Motion `layoutId="tab-indicator"` 弹簧动画
- 切换视图时内容区使用 `AnimatePresence` + `fadeInUp` 过渡

---

## 通用操作栏

标签栏下方，所有视图共享：

- `@shadcn/input-group` 搜索框（Lucide: `search`，debounce 300ms，过滤 Skill 名称/描述）
- `@shadcn/select` 筛选下拉：
  - 状态：全部 / synced / diverged / missing / untracked
  - 来源：全部 / 本地 / skills.sh / GitHub / Gitee
- `@shadcn/select` 排序下拉：名称 / 最近修改 / 部署数量

---

## 视图 A：按工具分组

每个工具一个 `@shadcn/collapsible` 可折叠面板（同项目详情页样式）：

- 面板头：工具 SVG 图标 + 工具名（H2）+ Skill 数量 + 状态摘要
- 面板内：Skill 卡片网格（`grid grid-cols-1 lg:grid-cols-2 gap-4`）

**Skill 小卡片**（Interactive Card，紧凑版）：
- Skill 名称（H3）+ 版本标签
- 所属位置：项目名 或 "全局"（Caption）
- 状态 Badge
- hover 浮起 + 点击跳转详情

---

## 视图 B：按项目分组

每个项目一个 `@shadcn/collapsible` 可折叠面板：

- 面板头：Lucide: `folder-open` + 项目名（H2）+ 工具图标列表 + Skill 数量
- 面板内：按工具再分小组，每组内为 Skill 小卡片列表

---

## 视图 C：全局汇总

去重展示所有 Skill，每个 Skill 一张 Clay Card（较大）：

- Skill 名称（H2）+ 版本 + 来源标签
- 描述（Body，2 行截断）
- 部署统计行：`部署到 3 个项目 · 5 个位置`
- 偏离统计：`1 处偏离`（蜂蜜橙，仅有偏离时显示）
- `@shadcn/collapsible` 展开箭头 → 展开后显示部署位置详情列表（`@shadcn/table` 工具+项目+状态）
- 展开/折叠使用 Framer Motion `AnimatePresence` + 高度动画

---

## 视图 D：全局 Skill

仅展示 `project_id IS NULL` 的部署：

- 按工具分组
- 样式同视图 A，但仅包含全局部署

---

## 异步操作

| 操作 | 加载方式 |
|------|---------|
| 加载 Skill 列表 + 部署关系 | `@shadcn/skeleton` 页面级骨架屏（卡片形骨架块 × 6，stagger 渐入） |
| 搜索过滤 | 即时过滤（< 100ms，本地数据），卡片用 `layout` 重排动画 |
| 切换视图 | fadeInUp 过渡（200ms） |
| 展开部署详情 | 高度动画 + 内容 stagger 渐入（< 300ms） |

---

## 空状态

无任何 Skill 时：
- 卡通插画：小猫咪双手摊开
- 文案："还没有任何 Skill 呢～"
- 副文案："从 skills.sh 安装，或者导入一个项目试试"
- 双按钮：「浏览 skills.sh」Primary Clay + 「添加项目」Outline