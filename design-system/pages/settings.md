# 设置页 (Settings)

> **路由**: `/settings`
> **侧边栏高亮**: 设置
> **继承**: MASTER.md 全部规范

---

## 页面概述

应用全局配置页面，左侧为设置分类导航，右侧为对应设置面板。所有设置修改即时保存到 `app_settings` 表，无需全局保存按钮。

---

## 区域划分

### 左侧设置导航

`@shadcn/sidebar` 或自定义垂直菜单列表（宽度 200px，`cream-50` 背景）：

| 菜单项 | 图标 |
|--------|------|
| 通用 | Lucide: `settings` |
| 本地 Skill 库 | Lucide: `folder` |
| Git 仓库 | Lucide: `git-branch` |
| 同步 | Lucide: `refresh-cw` |
| 更新 | Lucide: `download` |
| 工具目录 | Lucide: `wrench` |
| 数据管理 | Lucide: `database` |
| 关于 | Lucide: `info` |

- 选中项：`peach-100` 背景 + 左侧 3px 蜜桃粉色条
- hover：`peach-50` 背景
- 点击时右侧面板 fadeInUp 切换

### 右侧设置面板

每个设置分组为一个 Default Card，内含表单控件。

---

## 通用设置

| 设置项 | 控件类型 | 说明 |
|--------|---------|------|
| 语言 | `@shadcn/select` | 简体中文 / English |
| 主题 | `@shadcn/radio-group` 3 选项卡片 | 亮色 / 暗色 / 跟随系统（每个选项带预览缩略图） |
| 启动行为 | `@shadcn/select` | 打开上次页面 / 打开项目列表 / 打开同步中心 |
| 通知 | `@shadcn/switch` | 启用/禁用系统通知 |

**主题切换**：
- 3 个小预览卡片（80px × 60px），展示对应主题的色彩缩略
- 选中卡片：`peach-300` 边框 + 右上角 ✓
- 切换时整个应用色彩平滑过渡（CSS transition 300ms）

---

## 本地 Skill 库

| 设置项 | 控件类型 | 说明 |
|--------|---------|------|
| 库路径 | `@shadcn/input` + `@shadcn/button` 「浏览」 | 默认 `~/.skills-manager/skills/` |
| 当前状态 | 只读信息 | Skill 数量、占用空间、最近修改时间 |

**修改路径时**：
- 弹出 `@shadcn/alert-dialog`：“修改路径后需要迁移所有 Skill 文件，确认？”"
- 迁移进度条（可能较慢）

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 统计库信息 | 内联 Spinner（< 1s） |
| 迁移文件到新路径 | 全屏进度条（5s ~ 60s） |

---

## Git 仓库配置

| 设置项 | 控件类型 | 说明 |
|--------|---------|------|
| 平台 | `@shadcn/tabs`（GitHub / Gitee） | 可分别配置 |
| 仓库地址 | `@shadcn/input` | URL |
| 认证方式 | `@shadcn/radio-group`（SSH Key / HTTPS Token） | |
| 导出分支 | `@shadcn/input` | 默认 `main` |
| 连接测试 | `@shadcn/button` outline 「测试连接」 | |

**连接测试**：
- 按钮变 loading（BounceDots）
- 成功：按钮变薄荷绿 + ✓ + "连接成功"（3s 后恢复）
- 失败：按钮变草莓红 + ✗ + 错误信息

**平台 Tab 切换**：`layoutId` 指示条动画

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 测试 Git 连接 | 按钮 loading（1s ~ 5s） |
| 保存配置 | 即时保存，输入框右侧闪现 ✓（< 200ms） |

---

## 同步设置

| 设置项 | 控件类型 | 说明 |
|--------|---------|------|
| 自动导出频率 | `@shadcn/select` | 手动 / 每日 / 变更时 |
| 变更通知 | `@shadcn/switch` | 文件变更时是否弹出通知 |
| 文件监听 | `@shadcn/switch` | 是否后台监听项目目录变更 |

---

## 更新设置

| 设置项 | 控件类型 | 说明 |
|--------|---------|------|
| 检测频率 | `@shadcn/select` | 启动时 / 每小时 / 每日 / 手动 |
| 自动更新 | `@shadcn/switch` | 发现新版本时自动更新（仅本地 Skill 库） |

---

## 工具目录配置

展示 5 个工具的目录配置卡片，每张包含：

| 设置项 | 控件类型 | 说明 |
|--------|---------|------|
| 工具名 + 图标 | 只读 | 工具 SVG 品牌图标 + 名称 |
| 项目级目录模式 | Input（只读展示） | 如 `.windsurf/skills/` |
| 全局目录路径 | `@shadcn/input` + `@shadcn/button` 「浏览」 | 可自定义 |
| 检测状态 | Badge | 已检测到 / 未安装 |

- 每张工具卡片为 Colored Card，底色使用对应工具品牌色的极淡版
- 未安装的工具卡片灰显

---

## 数据管理

| 设置项 | 控件类型 | 说明 |
|--------|---------|------|
| 数据库路径 | `@shadcn/input` 只读 | `~/.skills-manager/db/skills.db` |
| 数据库大小 | 只读文字 | "2.3 MB" |
| 备份目录 | `@shadcn/input` + `@shadcn/button` 「浏览」 | `~/.skills-manager/backups/` |
| 历史记录保留 | `@shadcn/input` 数字 + "天" | 默认 90 天 |
| 清理历史 | 「立即清理」Outline 按钮 | 清理超过保留天数的 sync_history / change_events |
| 导出数据库 | 「导出」Outline 按钮 | 导出 .db 文件到指定位置 |
| 导入数据库 | 「导入」Outline 按钮 | 从 .db 文件恢复（危险操作） |

**清理历史**：
- 弹出 `@shadcn/alert-dialog`：“将清理 N 条历史记录，确认？”"
- 执行后 Toast 成功通知

**导入数据库**：
- `@shadcn/alert-dialog` Danger 样式确认：“导入将覆盖当前所有数据，确认？”"
- 导入前自动备份当前数据库

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 清理历史记录 | 按钮 loading（< 2s） |
| 导出数据库 | 按钮 loading + 文件保存对话框 |
| 导入数据库 | 进度条（1s ~ 10s） |

---

## 关于

- 应用名称 + Logo（居中）
- 版本号
- 技术栈信息
- 开源许可
- 「检查应用更新」按钮
- 社区链接（GitHub / 文档）

---

## 通用交互

- 所有 `@shadcn/switch` 开关：切换时有弹簧动画（Framer Motion `layout`）
- 所有 `@shadcn/input` 修改：失焦后自动保存，右侧短暂闪现薄荷绿 ✓
- 所有 `@shadcn/select` 下拉：选择后即时保存，右侧短暂闪现 ✓
- 保存反馈统一使用 ✓ 闪现（200ms fade in → 1s visible → 200ms fade out）