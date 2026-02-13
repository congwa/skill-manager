# 项目列表页 (Project List)

> **路由**: `/projects`
> **侧边栏高亮**: 项目
> **继承**: MASTER.md 全部规范

---

## 页面概述

应用主页面，展示所有已导入项目的卡片网格。顶部有统计概览条，支持搜索、筛选和排序。是用户日常使用频率最高的页面。

---

## 区域划分

### 顶部统计条

横向排列 4 个 Colored 卡片（`peach-50` / `lavender-50` / `mint/10` / `sunset/10`）：

| 统计项 | 图标 | 数值动画 |
|--------|------|---------|
| 项目总数 | Lucide: `folder-open` | GSAP 数字滚动（0 → N） |
| Skill 总数 | Lucide: `sparkles` | GSAP 数字滚动 |
| 待处理变更 | Lucide: `bell-ring` | GSAP 数字滚动，> 0 时蜂蜜橙色 |
| 偏离部署数 | Lucide: `alert-triangle` | GSAP 数字滚动，> 0 时草莓红色 |

- 首次加载：4 张卡片用 stagger 交错弹入（0.08s 间隔）
- 数字从 0 滚动到实际值（GSAP `gsap.to`，0.8s，ease: power2.out）

### 操作栏

- 左侧：「添加项目」`@shadcn/button` Primary Clay（Lucide: `plus`）
- 中间：`@shadcn/input-group` 搜索框（实时过滤，debounce 300ms）
- 右侧：`@shadcn/select` 排序下拉 + `@shadcn/toggle-group` 视图切换（网格 / 列表）

### 项目卡片网格

- 布局：`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6`
- 每张卡片为 Interactive Card 变体

**单张项目卡片内容**：
- 项目名称（H3，Varela Round，单行截断）
- 项目路径（Caption，`cream-600`，单行截断 + `@shadcn/tooltip` 显示完整路径）
- 工具图标行：横排展示检测到的工具 SVG 图标（带品牌色），缺失的工具灰显
- Skill 数量徽章（`peach-100` 底 + `peach-700` 字）
- 最近修改时间（Caption，相对时间如"2小时前"）
- 同步状态标签（Badge）：synced 绿 / changed 橙 / unsynced 灰
- 右上角：`@shadcn/dropdown-menu`（`...` 触发），含「重新扫描」「删除项目」

**卡片交互**：
- hover：`shadow-card` → `shadow-card-hover` + `scale: 1.02`（200ms spring）
- 点击：跳转项目详情页（pageTransition）
- 右键/长按：上下文菜单

---

## 添加项目流程

点击「添加项目」按钮后：

1. 弹出 `@shadcn/dialog`（scaleIn 动画）
2. 模态内容：
   - 拖拽区域（同引导页 Step 3 样式）
   - 或「选择目录」按钮
   - 支持批量选择多个目录
3. 选择后开始扫描

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 扫描项目 Skill 目录 | Modal 内进度条 + 状态文案（1s ~ 5s / 项目） |
| 写入项目和 Skill 到数据库 | 进度条（逐项完成 ✓） |
| 刷新项目列表 | 新卡片 jellyPop 弹入到网格末尾 |

---

## 空状态

当无任何项目时：
- 卡通插画：小猫咪抱着空箱子
- 文案（H2）："还没有项目呢～"
- 副文案（Body）："添加一个项目，开始管理你的 Skill 吧"
- 「添加项目」Primary Clay 按钮
- jellyPop 入场动画

---

## 删除项目

- 点击卡片右上角 `...` → 「删除项目」
- 弹出 `@shadcn/alert-dialog` 确认：
  - 标题：“确定要移除这个项目吗？”
  - 说明：“仅从 Skills Manager 中移除，不会删除项目文件”
  - `AlertDialogCancel` + `AlertDialogAction` destructive
- 删除后卡片缩小淡出动画（scale 0.9 + opacity 0，200ms）

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 删除项目及关联部署记录 | Danger 按钮 loading 态（< 500ms） |

---

## 搜索与筛选

- 搜索框：实时过滤项目名称和路径（debounce 300ms）
- 无结果时：显示"没有找到匹配的项目" + 小猫咪疑惑表情
- 筛选动画：使用 Framer Motion `AnimatePresence` + `layout`，卡片重排时有平滑位移动画