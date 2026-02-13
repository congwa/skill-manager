# 项目详情页 (Project Detail)

> **路由**: `/projects/:projectId`
> **侧边栏高亮**: 项目
> **继承**: MASTER.md 全部规范

---

## 页面概述

展示单个项目下所有工具的 Skill 部署情况。顶部为项目信息头，下方按工具分组展示 Skill 列表。支持在此页面直接执行部署、扫描和一致性检查。

---

## 区域划分

### 项目信息头

- 返回按钮（`@shadcn/button` ghost，Lucide: `arrow-left`）+ `@shadcn/breadcrumb`：项目列表 > 项目名称
- 项目名称（H1，Varela Round）
- 项目路径（Caption，`cream-600`，可点击复制，hover 显示 Lucide: `copy`）
- 最后扫描时间（Caption）
- 操作按钮组（右侧）：
  - 「重新扫描」Outline 按钮（Lucide: `scan`）
  - 「部署 Skill」Primary Clay 按钮（Lucide: `plus`）
  - 「一致性检查」Ghost 按钮（Lucide: `shield-check`）

### 工具分组区

每个检测到的工具渲染为一个 `@shadcn/collapsible` 可折叠面板：

**面板头部**：
- 工具 SVG 图标（品牌色，24px）+ 工具名称（H2）
- Skill 数量徽章
- 一致性状态摘要：`3 synced · 1 diverged`（彩色文字）
- 折叠/展开箭头（旋转动画 180°，200ms）

**面板内容**（Skill 列表）：
- 列表布局（非网格，适合信息密度）
- 每行一个 Skill：

| 列 | 内容 | 样式 |
|----|------|------|
| Skill 名称 | 名称文字 | H3，`cream-800`，可点击跳转详情 |
| 版本 | `v1.0.0` | Caption，`lavender-500` 底标签 |
| 状态 | Badge 标签 | 按 MASTER.md 语义色映射 |
| 部署路径 | 截断显示 | Caption，`cream-500`，`@shadcn/tooltip` hover |
| 最后同步 | 相对时间 | Caption，`cream-500` |
| 操作 | 图标按钮组 | 同步 / 查看 / 删除 |

**Skill 行交互**：
- hover：行背景 `peach-50/50`，200ms 渐变
- 点击名称：跳转 Skill 详情页
- 操作按钮：hover 时显示 tooltip

---

## 部署 Skill 到此项目

点击「部署 Skill」按钮后弹出 `@shadcn/dialog`（scaleIn）：

1. Skill 选择：从本地 Skill 库列表中 `@shadcn/checkbox` 勾选（带 `@shadcn/input` 搜索过滤）
2. 工具选择：`@shadcn/checkbox` 多选该项目下可用的工具
3. 冲突预检：检查目标目录是否已有同名文件
4. 确认部署

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 加载本地 Skill 库列表 | Modal 内骨架屏（< 300ms） |
| 冲突预检 | 逐项检查动画，每项前显示 ✓ 或 ⚠（1s ~ 3s） |
| 执行部署（文件拷贝 + DB 写入） | 进度条 + 逐项完成（500ms ~ 5s） |

---

## 重新扫描

点击「重新扫描」后：
- 按钮变 loading（SpinningStar）
- 扫描完成后列表刷新，新发现的 Skill 用 jellyPop 弹入
- 状态变更的 Skill 行闪烁高亮（蜂蜜橙边框脉动 2 次）

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 扫描项目 Skill 目录 | 按钮 Spinner + 顶部进度条（1s ~ 5s） |
| 对比数据库更新状态 | 内联于扫描流程 |

---

## 一致性检查

点击「一致性检查」后：
- 顶部出现进度条（蜜桃粉渐变）
- 检查完成后弹出结果 `sonner` Toast：
  - 全部一致："所有 Skill 状态正常 ✓"（薄荷绿 Toast）
  - 有偏差：""发现 N 项偏差，请前往同步中心处理"（蜂蜜橙 Toast，可点击跳转）

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 遍历部署记录 + 计算 checksum | 进度条 + 文案 "正在检查 12/45..."（1s ~ 10s） |
| 更新数据库状态 | 内联于检查流程 |

---

## 空状态

项目下无任何 Skill 时：
- 卡通插画：小猫咪看着空文件夹
- 文案："这个项目还没有 Skill 呢～"
- 「部署 Skill」Primary Clay 按钮 + 「重新扫描」Ghost 按钮