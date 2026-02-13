# skills.sh 仓库浏览页 (Skills Store)

> **路由**: `/store`
> **侧边栏高亮**: 仓库
> **继承**: MASTER.md 全部规范

---

## 页面概述

集成 skills.sh 在线仓库的浏览和搜索界面，类似应用商店体验。支持排行榜、分类浏览、搜索安装。本地已安装的 Skill 会标注状态。

---

## 区域划分

### 顶部搜索区

- `@shadcn/input-group` 大搜索框（居中，宽度 60%，`rounded-pill`，`shadow-card`）
  - Lucide: `search` 图标前缀
  - placeholder：“搜索 Skill...”
  - 输入时 debounce 500ms 调用 skills.sh API
- 搜索框下方：热门标签行（横向滚动），如 "React" "TypeScript" "Testing" "Git"
  - 标签样式：Outline 按钮（`rounded-pill`，小尺寸）
  - 点击标签 = 搜索该关键词

### 排行榜区（默认首屏）

- 标题（H2）：“热门 Skill”
- `@shadcn/carousel` 横向滚动卡片列表（或 `@shadcn/scroll-area` + `snap-x`）
- 每张卡片为 Clay Card：
  - 排名数字（左上角，`honey` 色大字）
  - Skill 名称（H3）
  - 描述（Body，2 行截断）
  - 兼容工具图标行
  - 安装量 + 评分星星（`honey` 填充）
  - 本地状态标签：「已安装 v1.0」薄荷绿 / 「可更新」蜂蜜橙 / 无标签
- 卡片宽度固定 280px，间距 16px
- 滑动时 snap 对齐

### 分类浏览区

- 标题（H2）："按分类浏览"
- 分类标签网格（`grid grid-cols-2 md:grid-cols-4 gap-3`）
- 每个分类为 Colored Card：
  - 分类图标（Lucide，居中，32px）
  - 分类名称（H3）
  - Skill 数量（Caption）
  - 背景色：每个分类不同的淡色（peach-50 / lavender-50 / mint/10 / sky/10 等）
- 点击分类：页面滚动到该分类的 Skill 列表

### 搜索结果区

搜索时替换排行榜和分类，显示搜索结果：

- 网格布局（`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6`）
- 每张结果卡片（Interactive Card）：
  - Skill 名称（H3）+ 版本
  - 描述（Body，3 行截断）
  - 兼容工具图标行
  - 安装量 + 星级评分
  - 本地已安装标签（如有）
  - 「安装」Primary Clay 按钮 / 「已安装」灰色禁用按钮 / 「更新」蜂蜜橙按钮
- 无结果：小猫咪摇头 + "没找到相关 Skill"

---

## 安装流程

点击「安装」按钮 → 打开 install-wizard（参见 install-wizard.md），预填 Skill 信息和来源为 `skills-sh`。

---

## 异步操作

| 操作 | 加载方式 |
|------|---------|
| 加载排行榜 | `@shadcn/skeleton` 横向卡片骨架屏 × 5（stagger 渐入） |
| 加载分类列表 | `@shadcn/skeleton` 分类卡片骨架屏网格 |
| 搜索 API 请求 | `@shadcn/skeleton` 搜索结果区骨架屏（1s ~ 3s），搜索框右侧 `@shadcn/spinner` |
| 获取 Skill 详情 | 弹窗内骨架屏 |
| 检查本地安装状态 | 内联于列表加载（对比数据库，< 200ms） |

---

## 离线状态

网络不可用时：
- 顶部 Banner（蜂蜜橙底）："当前无法连接 skills.sh，请检查网络"
- 隐藏搜索和排行榜
- 仅展示本地已安装的 Skill 列表（从数据库查询）