# 首次引导页 (Onboarding)

> **路由**: `/onboarding`
> **触发条件**: 首次启动应用（数据库无任何项目记录时）
> **继承**: MASTER.md 全部规范

---

## 页面概述

全屏沉浸式引导流程，共 4 步，底部有步骤指示器（软糯小圆点）。每步切换使用 GSAP timeline 编排入场动画序列。背景为奶油白 `cream-50` 带柔和渐变光斑装饰。

---

## 步骤流程

### Step 1: 欢迎页

**内容**：
- 居中大标题（Display 32px，Varela Round）："欢迎来到 Skills Manager"
- 副标题（Body 14px，Nunito Sans）："轻松管理你所有 AI 编码工具的 Skill"
- 品牌吉祥物插画：小猫咪挥手打招呼
- 「开始设置」主按钮（Primary Clay）

**动画**：
- GSAP timeline 编排：插画先弹入（jellyPop 0.5s）→ 标题从下方渐入（0.3s delay）→ 副标题渐入（0.2s delay）→ 按钮渐入（0.2s delay）
- 背景光斑缓慢浮动（CSS animation，infinite，20s cycle）

**异步操作**：无

---

### Step 2: 配置本地 Skill 库路径

**内容**：
- 标题（H1）："选择你的 Skill 仓库位置"
- 路径输入框（`@shadcn/input` + `@shadcn/field` + `@shadcn/label`），默认值 `~/.skills-manager/skills/`
- 「选择文件夹」按钮（`@shadcn/button` secondary）打开系统文件选择器
- 路径合法性实时校验（绿色 ✓ / 红色提示）
- 说明文案（Caption）：“这里会存放所有 Skill 的标准文件”

**动画**：
- 整体从右侧滑入（pageTransition）
- 输入框 focus 时边框渐变发光

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 校验路径是否可写 | 输入框右侧小 Spinner（< 500ms） |
| 创建目录结构 | 按钮 loading 态（< 1s） |

---

### Step 3: 导入第一个项目

**内容**：
- 标题（H1）："添加你的第一个项目"
- 大面积拖拽区域（虚线边框 `cream-300`，`rounded-xl`），支持拖拽文件夹
- 或「选择项目目录」按钮（Primary Clay）
- 导入后展示扫描结果：
  - 项目名称 + 路径
  - 检测到的工具图标列表（带品牌色）
  - 发现的 Skill 数量
  - 每个工具下的 Skill 名称列表（`@shadcn/collapsible` 折叠/展开）
- 「跳过，稍后添加」Ghost 按钮

**动画**：
- 拖拽区域：idle 状态边框有呼吸脉动（opacity 0.5 ↔ 1，2s cycle）
- 拖入时：边框变蜜桃粉 + 缩放 1.02 + 背景变 `peach-50`
- 扫描中：拖拽区域替换为扫描动画
- 扫描结果：工具图标依次弹入（stagger 0.1s），Skill 列表交错渐入

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 扫描项目 Skill 目录 | `@shadcn/progress` 进度条 + 状态文案（1s ~ 5s） |
| 将 Skill 导入数据库 | `@shadcn/progress` + 逐项完成动画（1s ~ 5s） |

---

### Step 4: 配置 Git 远程仓库（可选）

**内容**：
- 标题（H1）："备份到 Git 仓库（可选）"
- 平台选择：GitHub / Gitee 切换标签（`@shadcn/tabs` 或 `@shadcn/button-group`）
- 仓库 URL 输入框（`@shadcn/input`）
- 认证方式选择：`@shadcn/radio-group`（SSH Key / HTTPS Token）
- 「测试连接」按钮（`@shadcn/button` secondary）
- 连接结果：成功显示绿色 ✓ + 仓库信息 / 失败显示红色 ✗ + 错误提示
- 「跳过，以后再说」Ghost 按钮
- 「完成设置」Primary Clay 按钮

**动画**：
- 平台切换：标签下方滑动指示条（layoutId 动画）
- 测试连接：按钮变为 loading（BounceDots），完成后结果 jellyPop 弹入

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 测试 Git 连接 | 按钮 loading 态（1s ~ 5s） |
| 保存配置到数据库 | 按钮 loading 态（< 500ms） |

---

## 步骤指示器

- 底部居中，4 个小圆点
- 当前步：蜜桃粉实心 `w-3 h-3`
- 已完成步：薄荷绿实心 `w-2.5 h-2.5`
- 未完成步：`cream-300` 空心 `w-2.5 h-2.5`
- 切换时：Framer Motion `layoutId` 动画
- 支持点击已完成步骤回跳

---

## 完成引导后

- 全屏庆祝动画：小猫咪举旗 + 彩色纸屑飘落（GSAP timeline，2s）
- 1.5s 后自动跳转到项目列表页（带 pageTransition）