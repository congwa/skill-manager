# 同步中心页 (Sync Center)

> **路由**: `/sync`
> **侧边栏高亮**: 同步
> **继承**: MASTER.md 全部规范

---

## 页面概述

系统的「控制塔」，集中展示所有变更事件、一致性状态和 Git 备份操作。顶部为概览统计卡片，下方为 Tab 切换的三大面板：变更事件、一致性报告、操作历史。

---

## 区域划分

### 顶部概览统计条

横向排列 4 个 Colored 统计卡片：

| 统计项 | 图标 | 底色 | 数值特殊状态 |
|--------|------|------|------------|
| Git 连接状态 | Lucide: `git-branch` | `mint/10` | 已连接（绿）/ 未配置（灰）/ 断开（红） |
| 最近导出时间 | Lucide: `cloud-upload` | `lavender-50` | 相对时间，"从未"时显示蜂蜜橙 |
| 待处理变更 | Lucide: `bell-ring` | `sunset/10` | > 0 时蜂蜜橙数字 + 脉动圆点 |
| 偏离部署数 | Lucide: `alert-triangle` | `strawberry/10` | > 0 时草莓红数字 |

- stagger 弹入 + GSAP 数字滚动

### 操作按钮栏

统计卡片下方，横向操作按钮：

- 「执行一致性检查」Primary Clay（Lucide: `shield-check`）
- 「备份导出到 Git」Outline（Lucide: `cloud-upload`）
- 「从 Git 恢复」Outline（Lucide: `cloud-download`）

---

### Tab 面板区

`@shadcn/tabs` 3 个 Tab 页签：变更事件 | 一致性报告 | 操作历史

Tab 切换使用 `layoutId` 指示条 + `AnimatePresence` 内容过渡。

---

#### Tab 1: 变更事件

展示文件监听检测到的变更事件（来自 `change_events` 表）。

**列表结构**（每行一条事件）：

| 列 | 内容 | 样式 |
|----|------|------|
| 类型图标 | modified/created/deleted/renamed | 彩色图标（蜂蜜橙/薄荷绿/草莓红/天空蓝） |
| Skill 名称 | 名称 | H3，可点击跳转详情 |
| 项目 | 项目名 | Caption |
| 工具 | 工具 SVG 图标 | 品牌色 16px |
| 时间 | 相对时间 | Caption |
| 处理状态 | pending / resolved / ignored | Badge |
| 操作 | 按钮组 | 见下方 |

**待处理事件操作按钮**：
- 「更新本地 Skill 库」Ghost（将磁盘修改同步回本地 Skill 库 + DB）
- 「重新部署」Ghost（用本地 Skill 库版本覆盖磁盘）
- 「查看 Diff」Ghost（打开 diff-viewer）
- 「忽略」Ghost

**列表交互**：
- 待处理事件行：左侧 3px 蜂蜜橙色条
- hover：行背景 `peach-50/50`
- 列表 stagger 渐入

**筛选**：
- `@shadcn/select` 状态筛选：全部 / 待处理 / 已处理 / 已忽略
- `@shadcn/select` 事件类型筛选：修改 / 新增 / 删除 / 重命名

---

#### Tab 2: 一致性报告

展示数据库记录与磁盘文件的一致性检查结果。

**三个子区域**（各为一个 `@shadcn/collapsible` 可折叠面板）：

**偏离列表（diverged）**：
- 面板头：蜂蜜橙圆点 + "已偏离" + 数量
- 每行：Skill 名称 + 项目 + 工具 + 部署 checksum vs 库 checksum（截断）+ 操作
- 操作：「重新部署」/「更新本地库」/「查看 Diff」

**丢失列表（missing）**：
- 面板头：草莓红圆点 + "文件丢失" + 数量
- 每行：Skill 名称 + 项目 + 工具 + 预期路径
- 操作：「重新部署」/「删除记录」

**未追踪列表（untracked）**：
- 面板头：天空蓝圆点 + "未追踪" + 数量
- 每行：发现的路径 + 所属项目 + 工具
- 操作：「导入到本地 Skill 库」/「忽略」

**全部一致时**：
- 显示成功界面：小猫咪打勾 + "所有部署状态正常！"（薄荷绿文字）
- jellyPop 入场

---

#### Tab 3: 操作历史

时间线列表展示 `sync_history` 记录：

- 每条：时间 + 操作类型 Badge + Skill 名称 + 项目/工具 + 结果状态
- 操作类型色：deploy（薄荷绿）/ update（天空蓝）/ delete（草莓红）/ export（薰衣草）/ import（蜂蜜橙）
- 失败记录：红色边框 + 展开查看错误信息
- 默认展示最近 50 条，`@shadcn/pagination` 分页或「加载更多」按钮

---

## 一致性检查流程

点击「执行一致性检查」后：

1. 按钮变 loading（SpinningStar）
2. 顶部出现蜜桃粉进度条
3. 状态文案实时更新："正在检查第 12/45 个部署..."
4. 完成后：
   - 进度条消失
   - Tab 自动切换到「一致性报告」
   - 统计卡片数字刷新（GSAP 滚动）
   - 结果 Toast 通知

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 遍历所有部署 + checksum 计算 | 进度条 + 文案（1s ~ 30s） |
| 扫描未追踪文件 | 内联于检查流程 |
| 更新数据库状态 | 内联 |

---

## 备份导出到 Git

点击「备份导出到 Git」后：

1. 弹出 `@shadcn/alert-dialog` 确认，展示：
   - 目标仓库地址
   - 将导出的 Skill 数量
   - 如有偏离部署，警告提示
2. 确认后执行导出推送

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 扁平化导出到临时目录 | 进度条 + 文案（1s ~ 5s） |
| 生成 README.md | 内联（< 500ms） |
| Git push | 进度条 + 文案 "正在推送到 GitHub..."（3s ~ 30s） |

---

## 从 Git 恢复

点击「从 Git 恢复」→ 跳转到 git-import 页面，预填已配置的仓库地址。