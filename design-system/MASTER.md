# Skills Manager - 设计系统 (Design System)

> **版本**: v1.0.0
> **风格代号**: 「软糯星球」(Soft Planet)
> **设计基调**: 软软糯糯 · 卡通 · 弹性动画 · 触感反馈
> **灵感来源**: 喵喵记账、Notion 的柔和感、Clay UI 的立体触感
> **技术栈**: React + Vite + Zustand + TailwindCSS + **shadcn/ui** + Framer Motion + GSAP

---

## 一、设计哲学

### 1.1 核心理念

**「让每一次操作都像捏软糖一样治愈」**

Skills Manager 管理的是开发者的技能配置——一件严肃但枯燥的事。我们的设计目标是让这个过程变得 **有趣、柔软、有温度**。

- **软糯触感**：所有元素都有圆润边角、柔和阴影、弹性反馈，像棉花糖和果冻
- **卡通活力**：用可爱的插画、微表情图标、跳动的动画传递情绪
- **有呼吸感**：大量留白、缓慢渐入、让界面像在「呼吸」
- **异步友好**：每个数据库操作、文件扫描、网络请求都有专属的趣味加载动画

### 1.2 设计关键词

| 维度 | 关键词 |
|------|--------|
| 视觉 | 圆润、柔软、3D感、果冻质地、奶油色调 |
| 动效 | 弹跳、果冻晃动、呼吸脉动、滑入滑出、骨架屏 |
| 情感 | 治愈、温暖、友好、安心、有趣 |
| 交互 | 按压回弹、拖拽吸附、滑动切换、长按确认 |

---

## 二、色彩系统

### 2.1 主色板（暖奶油调）

灵感来自奶茶、棉花糖和日落晚霞，整体色温偏暖，拒绝冷硬科技感。

| 角色 | 色名 | HEX | 用途 |
|------|------|-----|------|
| **主色** | 蜜桃粉 | `#FF9BAD` | 主按钮、活跃状态、品牌色 |
| **主色深** | 玫瑰粉 | `#E8788A` | 主色 hover/active 状态 |
| **主色浅** | 樱花粉 | `#FFD4DC` | 主色背景色、选中态背景 |
| **辅色** | 薰衣草紫 | `#B8A9E8` | 次级按钮、标签、辅助强调 |
| **辅色深** | 葡萄紫 | `#9B8AD4` | 辅色 hover/active |
| **辅色浅** | 丁香紫 | `#E8E0F7` | 辅色背景 |
| **强调色** | 向日葵黄 | `#FFD666` | 警告、星标、高亮、CTA |
| **成功色** | 薄荷绿 | `#7DD4A8` | 成功状态、synced 标识 |
| **警告色** | 蜂蜜橙 | `#FFB067` | 警告状态、diverged 标识 |
| **危险色** | 草莓红 | `#FF7B7B` | 错误、删除、missing 标识 |
| **信息色** | 天空蓝 | `#7BC4E8` | 信息提示、链接、untracked 标识 |

### 2.2 中性色（奶油灰阶）

不使用纯黑 `#000` 或纯白 `#FFF`，所有中性色带暖调。

| 角色 | 色名 | HEX | 用途 |
|------|------|-----|------|
| **背景色** | 奶油白 | `#FFF8F3` | 页面主背景 |
| **卡片背景** | 棉花白 | `#FFFFFF` | 卡片、弹窗、浮层 |
| **次级背景** | 杏仁奶 | `#FFF0E6` | 分区背景、侧栏背景 |
| **分割线** | 焦糖线 | `#F0E0D4` | 分割线、边框 |
| **禁用背景** | 灰奶油 | `#F5EDE6` | 禁用元素背景 |
| **正文字** | 可可棕 | `#4A3728` | 主要文字 |
| **次级字** | 拿铁棕 | `#8B7355` | 次要说明文字 |
| **占位符字** | 淡奶棕 | `#C4A882` | placeholder、提示文字 |
| **禁用字** | 雾奶棕 | `#D4C4B0` | 禁用文字 |

### 2.3 语义色映射（部署状态）

| 数据库状态 | 色彩 | 标签文案 | 图标 |
|-----------|------|---------|------|
| `synced` | 薄荷绿 `#7DD4A8` | 已同步 | Lucide: `check-circle` |
| `diverged` | 蜂蜜橙 `#FFB067` | 已偏离 | Lucide: `alert-triangle` |
| `missing` | 草莓红 `#FF7B7B` | 文件丢失 | Lucide: `file-x` |
| `untracked` | 天空蓝 `#7BC4E8` | 未追踪 | Lucide: `file-question` |

### 2.4 TailwindCSS 自定义色彩配置

```typescript
// tailwind.config.ts
const config = {
  theme: {
    extend: {
      colors: {
        peach: {
          50: '#FFF5F7',
          100: '#FFD4DC',
          200: '#FFB8C4',
          300: '#FF9BAD',
          400: '#FF8299',
          500: '#FF6B85',
          600: '#E8788A',
          700: '#D4566A',
          800: '#B83A50',
          900: '#9C2038',
        },
        lavender: {
          50: '#F5F0FF',
          100: '#E8E0F7',
          200: '#D4C8F0',
          300: '#B8A9E8',
          400: '#A494DE',
          500: '#9B8AD4',
          600: '#8270C0',
          700: '#6A58AC',
          800: '#524098',
          900: '#3A2884',
        },
        cream: {
          50: '#FFF8F3',
          100: '#FFF0E6',
          200: '#F5EDE6',
          300: '#F0E0D4',
          400: '#D4C4B0',
          500: '#C4A882',
          600: '#8B7355',
          700: '#6B5540',
          800: '#4A3728',
          900: '#2E2118',
        },
        honey: '#FFD666',
        mint: '#7DD4A8',
        sunset: '#FFB067',
        strawberry: '#FF7B7B',
        sky: '#7BC4E8',
      },
    },
  },
}
```

---

## 三、字体系统

### 3.1 字体配对

| 角色 | 字体 | 权重 | 说明 |
|------|------|------|------|
| **标题字体** | Varela Round | 400 (仅有) | 圆润可爱，天然卡通感，用于所有标题 |
| **正文字体** | Nunito Sans | 300/400/500/600/700 | 柔和友好，可读性好，用于正文和 UI 文字 |
| **代码字体** | JetBrains Mono | 400/500 | SKILL.md 内容预览、Diff 对比、代码块 |
| **中文备选** | "PingFang SC", "Microsoft YaHei" | - | 中文 fallback |

### 3.2 字号体系（px / rem）

| 层级 | 大小 | 行高 | 用途 |
|------|------|------|------|
| **Display** | 32px / 2rem | 1.2 | 引导页大标题 |
| **H1** | 24px / 1.5rem | 1.3 | 页面标题 |
| **H2** | 20px / 1.25rem | 1.35 | 区块标题 |
| **H3** | 16px / 1rem | 1.4 | 卡片标题、分组标题 |
| **Body** | 14px / 0.875rem | 1.6 | 正文 |
| **Caption** | 12px / 0.75rem | 1.5 | 辅助说明、时间戳、状态标签 |
| **Tiny** | 10px / 0.625rem | 1.4 | 角标、小徽章 |

### 3.3 Google Fonts 导入

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&family=Varela+Round&family=JetBrains+Mono:wght@400;500&display=swap');
```

---

## 四、圆角系统

**核心原则**：所有可见元素都要圆润，绝不出现直角。

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-xs` | 6px | 小标签、徽章 |
| `--radius-sm` | 10px | 输入框、小按钮 |
| `--radius-md` | 14px | 普通按钮、下拉框 |
| `--radius-lg` | 20px | 卡片、面板 |
| `--radius-xl` | 28px | 弹窗、大面板 |
| `--radius-full` | 9999px | 圆形头像、药丸按钮 |

```typescript
// tailwind.config.ts extend
borderRadius: {
  'xs': '6px',
  'sm': '10px',
  'md': '14px',
  'lg': '20px',
  'xl': '28px',
  'pill': '9999px',
},
```

---

## 五、阴影系统（Claymorphism 风格）

**核心原则**：用多层柔和阴影营造 3D 软糯立体感，绝不使用硬阴影。

| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-soft` | `0 2px 8px rgba(74,55,40,0.06)` | 轻微浮起（标签、小元素） |
| `--shadow-card` | `0 4px 16px rgba(74,55,40,0.08), 0 1px 4px rgba(74,55,40,0.04)` | 卡片默认阴影 |
| `--shadow-card-hover` | `0 8px 24px rgba(74,55,40,0.12), 0 2px 8px rgba(74,55,40,0.06)` | 卡片 hover 浮起 |
| `--shadow-float` | `0 12px 40px rgba(74,55,40,0.15), 0 4px 12px rgba(74,55,40,0.08)` | 弹窗、Tooltip |
| `--shadow-clay` | `0 6px 20px rgba(74,55,40,0.1), inset 0 -2px 6px rgba(255,255,255,0.6), inset 0 2px 4px rgba(255,255,255,0.4)` | Claymorphism 按钮/卡片（内外双阴影） |
| `--shadow-pressed` | `0 1px 4px rgba(74,55,40,0.08), inset 0 2px 6px rgba(74,55,40,0.1)` | 按下状态 |

```typescript
// tailwind.config.ts extend
boxShadow: {
  'soft': '0 2px 8px rgba(74,55,40,0.06)',
  'card': '0 4px 16px rgba(74,55,40,0.08), 0 1px 4px rgba(74,55,40,0.04)',
  'card-hover': '0 8px 24px rgba(74,55,40,0.12), 0 2px 8px rgba(74,55,40,0.06)',
  'float': '0 12px 40px rgba(74,55,40,0.15), 0 4px 12px rgba(74,55,40,0.08)',
  'clay': '0 6px 20px rgba(74,55,40,0.1), inset 0 -2px 6px rgba(255,255,255,0.6), inset 0 2px 4px rgba(255,255,255,0.4)',
  'pressed': '0 1px 4px rgba(74,55,40,0.08), inset 0 2px 6px rgba(74,55,40,0.1)',
},
```

---

## 六、间距系统

基于 4px 网格，所有间距为 4 的倍数。

| Token | 值 | 用途 |
|-------|-----|------|
| `space-1` | 4px | 图标与文字间距 |
| `space-2` | 8px | 紧凑内间距 |
| `space-3` | 12px | 标签内间距、列表项间距 |
| `space-4` | 16px | 卡片内间距、表单元素间距 |
| `space-5` | 20px | 区块间距 |
| `space-6` | 24px | 卡片间距 |
| `space-8` | 32px | 大区块间距 |
| `space-10` | 40px | 页面区域间距 |
| `space-12` | 48px | 页面顶部/底部留白 |

---

## 七、动画系统

### 7.1 动画哲学

**「每一个异步操作都值得一个可爱的等待」**

所有数据库查询、文件扫描、网络请求、Git 操作均为异步，必须有明确的加载反馈。动画不是装饰，是信息。

### 7.2 Framer Motion 全局弹簧配置

```typescript
// src/lib/motion.ts
export const springConfig = {
  gentle: { type: 'spring', stiffness: 120, damping: 14 },    // 柔和弹跳：页面切换、卡片展开
  bouncy: { type: 'spring', stiffness: 300, damping: 20 },    // 弹性按钮：按钮点击回弹
  snappy: { type: 'spring', stiffness: 500, damping: 30 },    // 快速吸附：拖拽、下拉菜单
  jelly:  { type: 'spring', stiffness: 200, damping: 10 },    // 果冻晃动：成功/错误反馈
}

export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: springConfig.gentle,
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: springConfig.bouncy,
}

export const jellyPop = {
  initial: { scale: 0 },
  animate: { scale: [0, 1.15, 0.95, 1.02, 1] },
  transition: { duration: 0.5, ease: 'easeOut' },
}
```

### 7.3 按钮交互动画

```typescript
// 按钮 hover + 按下效果（所有按钮必须使用）
export const buttonMotion = {
  whileHover: { scale: 1.04, transition: springConfig.bouncy },
  whileTap: { scale: 0.95, transition: { duration: 0.1 } },
}

// Clay 按钮（主要操作按钮）
export const clayButtonMotion = {
  whileHover: {
    scale: 1.04,
    boxShadow: '0 8px 24px rgba(74,55,40,0.12), inset 0 -2px 6px rgba(255,255,255,0.6)',
  },
  whileTap: {
    scale: 0.96,
    boxShadow: '0 1px 4px rgba(74,55,40,0.08), inset 0 2px 6px rgba(74,55,40,0.1)',
  },
}
```

### 7.4 页面切换动画

```typescript
// 使用 framer-motion AnimatePresence
// 页面进入：从右侧滑入 + 渐显
// 页面退出：向左滑出 + 渐隐
export const pageTransition = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0, transition: springConfig.gentle },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
}
```

### 7.5 列表交错动画（Stagger）

```typescript
// 卡片列表交错渐入
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

export const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: springConfig.gentle },
}
```

### 7.6 加载动画分级（核心）

**根据异步操作时长匹配不同的加载动画：**

| 时长范围 | 加载方式 | 动画描述 | 使用场景 |
|---------|---------|---------|---------|
| **< 300ms** | 无动画 | 直接展示结果 | 本地数据库简单查询 |
| **300ms ~ 1s** | 骨架屏 (Skeleton) | 奶油色脉动块替代内容区域 | 数据库复杂查询、本地文件读取 |
| **1s ~ 3s** | 趣味 Spinner | 弹跳的小圆点 / 旋转的小星星 | 文件扫描、checksum 计算、部署拷贝 |
| **3s ~ 10s** | 进度条 + 状态文案 | 软糯进度条 + 实时状态（"正在扫描 .windsurf/skills/ ..."） | Git clone、批量部署、一致性检查 |
| **> 10s** | 全屏进度页 | 带卡通插图的进度页面 + 分步骤进度 + 预计剩余时间 | Git push/pull、全量导入导出 |

### 7.7 骨架屏规范

```tsx
// 骨架屏使用奶油色，带柔和脉动
// bg-cream-200 animate-pulse rounded-lg
// 形状应与实际内容区域一致
<div className="animate-pulse space-y-4">
  <div className="h-6 bg-cream-200 rounded-lg w-1/3" />      {/* 标题 */}
  <div className="h-4 bg-cream-200 rounded-lg w-2/3" />      {/* 描述 */}
  <div className="flex gap-2">
    <div className="h-8 w-20 bg-cream-200 rounded-md" />     {/* 标签 */}
    <div className="h-8 w-20 bg-cream-200 rounded-md" />
  </div>
</div>
```

### 7.8 趣味 Spinner 组件

提供 3 种可互换的 Spinner 样式：

| 名称 | 描述 | 适用场景 |
|------|------|---------|
| **BounceDots** | 3 个小圆点依次弹跳 | 通用加载 |
| **SpinningStar** | 旋转的小星星（蜜桃粉渐变） | 安装、更新 |
| **PulsingHeart** | 跳动的小心形 | 同步、备份 |

### 7.9 GSAP 使用场景

仅在以下高级动画场景使用 GSAP（其余全部用 Framer Motion）：

| 场景 | GSAP 功能 | 说明 |
|------|----------|------|
| 引导页步骤动画 | `gsap.timeline()` | 多步骤编排的入场动画序列 |
| 进度条动画 | `gsap.to()` | 精确控制进度百分比和缓动 |
| 数字滚动 | `gsap.to()` | Skill 数量、部署数量等数字跳动 |
| Diff 高亮动画 | `ScrollTrigger` | Diff 视图中滚动到变更区域时高亮 |

### 7.10 `prefers-reduced-motion` 适配

```typescript
// 所有动画必须尊重用户的减弱动效偏好
import { useReducedMotion } from 'framer-motion'

export function useMotionConfig() {
  const shouldReduce = useReducedMotion()
  return {
    transition: shouldReduce ? { duration: 0 } : springConfig.gentle,
    animate: shouldReduce ? {} : undefined,
  }
}
```

---

## 八、组件体系（shadcn/ui + 自定义）

### 8.0 shadcn/ui 组件映射表

**核心原则**：所有基础 UI 组件优先使用 **shadcn/ui**，通过 TailwindCSS 自定义主题覆盖默认样式实现「软糯星球」风格。仅在 shadcn/ui 不提供或无法满足需求时才自建组件。

安装命令示例：`npx shadcn@latest add button card dialog tabs`

| 设计系统组件 | shadcn/ui 组件 | 自定义覆盖要点 |
|-------------|---------------|--------------|
| 按钮 Button | `@shadcn/button` | 覆盖圆角为 `rounded-xl`、添加 clay 阴影、Framer Motion 弹性动画 |
| 按钮组 | `@shadcn/button-group` | 药丸形组合，用于平台切换 / 视图切换 |
| 卡片 Card | `@shadcn/card` | 覆盖圆角为 `rounded-2xl`、clay 阴影、hover 浮起 |
| 标签 Badge | `@shadcn/badge` | 自定义语义色（synced/diverged/missing/untracked） |
| 弹窗 Dialog | `@shadcn/dialog` + `@shadcn/alert-dialog` | 覆盖蒙层为 `cream-900/30 backdrop-blur-sm`、scaleIn 动画 |
| Toast 通知 | `@shadcn/sonner` | 自定义 4 种语义色主题，从顶部滑入 |
| 输入框 Input | `@shadcn/input` + `@shadcn/field` + `@shadcn/label` | 覆盖边框色 `cream-300`、focus `peach-300` |
| 输入框组 | `@shadcn/input-group` | 搜索框带图标前缀 |
| 文本域 | `@shadcn/textarea` | 同 Input 覆盖 |
| 下拉选择 | `@shadcn/select` | 覆盖圆角和边框色 |
| 下拉菜单 | `@shadcn/dropdown-menu` | 卡片右上角 `...` 操作菜单 |
| 右键菜单 | `@shadcn/context-menu` | 项目卡片 / Skill 行右键 |
| Tab 标签页 | `@shadcn/tabs` | 自定义 `layoutId` 指示条动画（Framer Motion） |
| 折叠面板 | `@shadcn/collapsible` | 工具分组面板、设置分组 |
| 手风琴 | `@shadcn/accordion` | FAQ / 帮助 / 多段折叠 |
| 面包屑 | `@shadcn/breadcrumb` | 自定义分隔符为 `/`、颜色 `cream-500` |
| 进度条 | `@shadcn/progress` | 覆盖填充色为蜜桃粉渐变 |
| 骨架屏 | `@shadcn/skeleton` | 覆盖底色为 `cream-200`、`animate-pulse` |
| Spinner | `@shadcn/spinner` | 蜜桃粉色，3 种变体（BounceDots/SpinningStar/PulsingHeart） |
| Toggle/Switch | `@shadcn/switch` | 覆盖 active 色为 `peach-400` |
| Tooltip | `@shadcn/tooltip` | 覆盖为 `cream-800` 底 + 白字 + `rounded-lg` |
| 表格 | `@shadcn/table` | Skill 部署列表、变更事件列表 |
| Radio 单选 | `@shadcn/radio-group` | 冲突解决选项 |
| Checkbox 多选 | `@shadcn/checkbox` | 批量操作勾选 |
| 侧边栏 | `@shadcn/sidebar` | 完整侧边栏方案含折叠态、菜单分组 |
| 抽屉 Sheet | `@shadcn/sheet` | 移动端侧边栏、快捷面板 |
| 空状态 | `@shadcn/empty` | 配合自定义卡通插画 + 文案 |
| 分割线 | `@shadcn/separator` | 焦糖色 `cream-300` |
| 命令面板 | `@shadcn/command` | 全局搜索（Cmd+K） |
| 滚动区域 | `@shadcn/scroll-area` | 长列表 / 代码预览区 |
| 可调整面板 | `@shadcn/resizable` | Skill 编辑器左右面板 |
| 悬浮卡片 | `@shadcn/hover-card` | 路径 hover 显示完整路径 |
| 分页 | `@shadcn/pagination` | 操作历史列表分页 |
| 键盘快捷键 | `@shadcn/kbd` | Skill 编辑器快捷键提示 |
| 轮播 | `@shadcn/carousel` | skills.sh 热门排行横向滚动 |
| 表单 | `@shadcn/form` | 设置页、引导页表单验证 |
| 弹出框 | `@shadcn/popover` | 筛选下拉、日期选择 |
| 导航菜单 | `@shadcn/navigation-menu` | 顶部导航（如有二级） |

### 8.0.1 shadcn/ui 主题覆盖策略

通过 CSS 变量覆盖 shadcn/ui 默认主题，使其融入「软糯星球」风格：

```css
/* globals.css - shadcn/ui 主题覆盖 */
@layer base {
  :root {
    --background: 30 100% 98%;        /* cream-50 #FFF8F3 */
    --foreground: 24 30% 22%;         /* cream-800 #4A3728 */
    --card: 0 0% 100%;               /* white */
    --card-foreground: 24 30% 22%;
    --primary: 10 100% 71%;           /* peach-300 #FF9BAD */
    --primary-foreground: 0 0% 100%;
    --secondary: 262 47% 78%;         /* lavender-300 #B8A9E8 */
    --secondary-foreground: 0 0% 100%;
    --muted: 25 50% 93%;             /* cream-100 #FFF0E6 */
    --muted-foreground: 30 25% 44%;  /* cream-600 #8B7355 */
    --accent: 25 100% 93%;           /* cream-100 */
    --accent-foreground: 24 30% 22%;
    --destructive: 0 100% 71%;       /* strawberry #FF7B7B */
    --border: 25 40% 89%;            /* cream-300 #F0E0D4 */
    --input: 25 40% 89%;
    --ring: 10 100% 80%;             /* peach-100 #FFD4DC */
    --radius: 0.875rem;              /* 14px，全局默认圆角 */
  }
}
```

### 8.1 按钮（Button） — 基于 `@shadcn/button`

| 变体 | shadcn variant | 样式覆盖 | 用途 |
|------|---------------|---------|------|
| **Primary** | `default` | 蜜桃粉底 + 白字 + clay 阴影 | 主要操作：安装、部署、保存 |
| **Secondary** | `secondary` | 薰衣草紫底 + 白字 + clay 阴影 | 次要操作：取消、返回 |
| **Ghost** | `ghost` | 透明底 + 蜜桃粉字 + hover 浅粉底 | 行内操作：编辑、查看 |
| **Outline** | `outline` | 白底 + 蜜桃粉边框 + 蜜桃粉字 | 轻量操作：筛选、标签切换 |
| **Danger** | `destructive` | 草莓红底 + 白字 | 危险操作：删除 |
| **Icon** | `size="icon"` | 圆形 + 图标 + soft 阴影 | 图标按钮：关闭、刷新 |

所有按钮必须：
- 外层包裹 Framer Motion `motion.div` 实现 `whileHover` + `whileTap` 弹性反馈
- `cursor-pointer`
- `border-radius: 14px`（普通）或 `9999px`（药丸型，使用 `@shadcn/button` 的 `rounded-full`）
- 禁用态：降低 opacity 至 0.5，移除阴影
- loading 态：使用 `@shadcn/spinner` 替换图标位置

### 8.2 卡片（Card） — 基于 `@shadcn/card`

使用 `<Card>` / `<CardHeader>` / `<CardTitle>` / `<CardDescription>` / `<CardContent>` / `<CardFooter>` 组合。

| 变体 | 样式覆盖 | 用途 |
|------|---------|------|
| **Default** | 白底 + card 阴影 + `rounded-2xl` | 通用信息卡片 |
| **Clay** | 白底 + clay 阴影（含 inset） | 重要内容、可交互卡片 |
| **Colored** | 淡色底（peach-50/lavender-50）+ soft 阴影 | 状态卡片、统计卡片 |
| **Interactive** | hover 浮起 + 阴影加深 + 微缩放（Framer Motion） | 可点击卡片（项目卡片、Skill 卡片） |

所有卡片必须：
- 覆盖 shadcn `<Card>` 的 `border-radius` 为 `rounded-2xl`（20px）
- `padding: 16px ~ 24px`（通过 `<CardContent className="p-4 ~ p-6">`）
- Interactive 变体外层包裹 `motion.div`，hover `shadow-card-hover` + `scale: 1.02`
- 过渡时长 200ms

### 8.3 标签（Badge / Tag） — 基于 `@shadcn/badge`

| 状态 | 背景色 | 文字色 | 图标 |
|------|--------|--------|------|
| synced | `mint/20` | `#3D8B64` | check-circle |
| diverged | `sunset/20` | `#B87A30` | alert-triangle |
| missing | `strawberry/20` | `#C44040` | file-x |
| untracked | `sky/20` | `#4A8FB0` | file-question |
| 来源: local | `cream-200` | `cream-700` | folder |
| 来源: skills-sh | `lavender-100` | `lavender-700` | globe |
| 来源: github | `cream-200` | `cream-800` | github |
| 来源: gitee | `strawberry/10` | `strawberry` | git-branch |

标签样式：`rounded-xs (6px)`, `px-2 py-0.5`, `text-xs`, `font-medium`

使用 shadcn `<Badge variant="..." />` 扩展自定义 variant：`synced` / `diverged` / `missing` / `untracked` / `source-local` / `source-skills-sh` / `source-github` / `source-gitee`

### 8.4 输入框（Input） — 基于 `@shadcn/input` + `@shadcn/field` + `@shadcn/label`

- 使用 `<Field>` 包裹 `<Label>` + `<Input>` + 错误提示
- 默认：`bg-white border-cream-300 rounded-sm (10px)` + `shadow-soft`
- Focus：`border-peach-300 ring-2 ring-peach-100` + 柔和发光
- Error：`border-strawberry ring-2 ring-strawberry/20`
- 过渡：`transition-all duration-200`
- placeholder 色：`cream-500`
- 搜索框使用 `@shadcn/input-group` + Lucide `Search` 图标前缀

### 8.5 弹窗（Modal / Dialog） — 基于 `@shadcn/dialog` + `@shadcn/alert-dialog`

- 普通弹窗使用 `<Dialog>` / `<DialogContent>` / `<DialogHeader>` / `<DialogTitle>` / `<DialogDescription>` / `<DialogFooter>`
- 危险确认弹窗使用 `<AlertDialog>` / `<AlertDialogAction>` + destructive variant
- 背景蒙层：覆盖 `DialogOverlay` 为 `bg-cream-900/30 backdrop-blur-sm`
- 弹窗体：覆盖 `DialogContent` 为 `rounded-xl (28px) shadow-float p-6`
- 进入动画：`scaleIn`（从 0.9 缩放到 1 + 渐显），可通过 Framer Motion 包裹
- 退出动画：缩小到 0.95 + 渐隐
- 关闭按钮：右上角圆形 Icon 按钮（shadcn 默认带关闭 X）

### 8.6 Toast 通知 — 基于 `@shadcn/sonner`

- 使用 `sonner` 库的 `<Toaster>` 全局组件
- 调用方式：`toast.success('操作成功')` / `toast.error('操作失败')` / `toast.warning(...)` / `toast.info(...)`
- 从顶部滑入，3s 后自动滑出
- 自定义主题覆盖：`rounded-lg shadow-card` + 左侧色条指示类型
- 类型色：成功（薄荷绿）/ 警告（蜂蜜橙）/ 错误（草莓红）/ 信息（天空蓝）
- 支持手动关闭 + action 按钮点击跳转

### 8.7 工具图标（Tool Icons）

五大工具使用固定的图标和品牌色：

| 工具 | 图标来源 | 品牌色 | 标识 |
|------|---------|--------|------|
| Windsurf | Simple Icons / 自定义 SVG | `#00B4D8` | 风帆图标 |
| Cursor | Simple Icons / 自定义 SVG | `#000000` | 光标图标 |
| Claude Code | Simple Icons / 自定义 SVG | `#D4A27F` | 星形图标 |
| Codex | Simple Icons / 自定义 SVG | `#10A37F` | OpenAI 图标 |
| Trae | Simple Icons / 自定义 SVG | `#4A90D9` | 闪电图标 |

### 8.8 空状态（Empty State）

每个列表页都需要空状态设计：
- 卡通插画（居中、柔和色调）
- 一句温暖的文案（如"还没有项目呢，添加一个试试？"）
- 一个 CTA 按钮（主色 Clay 按钮）
- 使用 `jellyPop` 动画入场

---

## 九、布局框架

### 9.1 应用整体结构

```
+----------------------------------------------+
|  顶部导航栏 (64px)                             |
|  Logo + 页面标题 + 搜索 + 通知 + 设置          |
+--------+-------------------------------------+
| 侧边栏  |  主内容区                             |
| (220px) |  (flex-1)                           |
|         |                                     |
| 导航菜单 |  页面内容                             |
| 项目     |  (padding: 24px ~ 32px)             |
| Skills  |                                     |
| 仓库     |                                     |
| 同步     |                                     |
| 设置     |                                     |
+--------+-------------------------------------+
```

### 9.2 侧边栏 — 基于 `@shadcn/sidebar`

使用 shadcn 的 `<SidebarProvider>` + `<Sidebar>` + `<SidebarContent>` + `<SidebarGroup>` + `<SidebarMenu>` + `<SidebarMenuItem>` + `<SidebarMenuButton>` 完整方案，参考 `sidebar-07`（可折叠为图标模式）。

- 背景：覆盖 `cream-50`（杏仁奶色）
- 宽度：220px（展开）/ 64px（折叠，仅图标）
- 菜单项：`rounded-md`，hover 背景 `peach-50`，选中背景 `peach-100` + 左侧 3px 蜜桃粉色条
- 折叠动画：shadcn sidebar 自带折叠动画 + Framer Motion `layout` 增强
- 底部显示：`<SidebarFooter>` 中放置数据库状态指示灯（绿色 = 正常，黄色 = 同步中）
- 折叠触发：`<SidebarTrigger>` 按钮

### 9.3 顶部导航栏

- 背景：`white/80 backdrop-blur-md`
- 高度：64px
- 阴影：`shadow-soft`
- Logo：左侧，带品牌色渐变
- 面包屑：使用 `@shadcn/breadcrumb`（`<Breadcrumb>` / `<BreadcrumbList>` / `<BreadcrumbItem>` / `<BreadcrumbLink>` / `<BreadcrumbSeparator>`），分隔符自定义为 `/`，颜色 `cream-500`
- 右侧：搜索框（`@shadcn/input-group`）+ 通知铃铛（`@shadcn/button` icon variant + 红点）+ 一致性状态指示
- 全局搜索可用 `@shadcn/command`（Cmd+K 触发）

### 9.4 图标库

统一使用 **Lucide React** 图标库：
- 大小：`w-5 h-5`（20px，默认）、`w-4 h-4`（16px，紧凑）
- 颜色：跟随文字色
- stroke-width：2px（默认）、1.5px（大图标时）

---

## 十、异步操作加载动画清单

**每个异步操作都必须有对应的加载反馈**，以下是全部异步操作及其加载方式：

### 10.1 数据库操作

| 操作 | 预估时长 | 加载方式 | 动画细节 |
|------|---------|---------|---------|
| 查询项目列表 | < 100ms | 无 / 骨架屏 | 首次加载用骨架屏 |
| 查询 Skill 列表 | < 200ms | 骨架屏 | 卡片形骨架块交错出现 |
| 查询 Skill 详情 | < 100ms | 骨架屏 | 信息区 + 部署列表骨架 |
| 查询部署关系 | < 100ms | 无 | 瞬时 |
| 写入新 Skill 记录 | < 200ms | 按钮 loading 态 | 按钮内 BounceDots |
| 写入部署记录 | < 200ms | 按钮 loading 态 | 按钮内 BounceDots |
| 一致性检查查询 | 200ms ~ 2s | 骨架屏 → Spinner | 逐条检查动画 |
| 批量更新状态 | 200ms ~ 1s | 进度指示 | 逐项更新，项前显示 ✓ |

### 10.2 文件系统操作

| 操作 | 预估时长 | 加载方式 | 动画细节 |
|------|---------|---------|---------|
| 扫描项目目录 | 1s ~ 5s | 进度条 + 状态文案 | "正在扫描 .windsurf/skills/..." |
| 计算 checksum (单文件) | < 500ms | Spinner | SpinningStar |
| 计算 checksum (批量) | 1s ~ 10s | 进度条 | 显示 "已检查 12/45 个文件" |
| 拷贝 Skill 文件 (部署) | 500ms ~ 2s | Spinner → 完成动画 | 拷贝完成后 jellyPop ✓ |
| 批量部署 | 2s ~ 10s | 进度条 + 列表 | 逐项部署，每完成一项弹出 ✓ |
| 读取 SKILL.md 内容 | < 300ms | 骨架屏 | Markdown 渲染区骨架 |
| 备份文件 | 500ms ~ 2s | Spinner | PulsingHeart |

### 10.3 网络操作

| 操作 | 预估时长 | 加载方式 | 动画细节 |
|------|---------|---------|---------|
| skills.sh API 搜索 | 1s ~ 3s | 骨架屏 | 搜索结果卡片骨架 |
| skills.sh 获取详情 | 500ms ~ 2s | 骨架屏 | 详情区骨架 |
| 下载 Skill 包 | 1s ~ 5s | 进度条 | 下载进度百分比 |
| 检查远程更新 | 1s ~ 5s | Spinner + 文案 | "正在检查 skills.sh 更新..." |

### 10.4 Git 操作

| 操作 | 预估时长 | 加载方式 | 动画细节 |
|------|---------|---------|---------|
| Git clone 仓库 | 5s ~ 60s | 全屏进度页 | 卡通插图 + 分步进度 + 实时日志 |
| Git pull | 3s ~ 30s | 进度条 + 状态 | "正在拉取远程更新..." |
| Git push (导出) | 3s ~ 30s | 进度条 + 状态 | "正在推送到 GitHub..." |
| 扫描仓库 Skill | 1s ~ 5s | Spinner + 列表渐入 | 逐个发现的 Skill 弹入列表 |
| 连接测试 | 1s ~ 5s | 按钮 loading | 成功: 绿色 ✓ / 失败: 红色 ✗ |

---

## 十一、图标与插画规范

### 11.1 UI 图标

- **图标库**：Lucide React（统一使用，禁止混用其他库）
- **禁止使用 emoji 作为 UI 图标**
- 尺寸：16px / 20px / 24px
- 颜色：继承当前文字颜色

### 11.2 品牌 Logo

- Simple Icons 获取工具品牌 logo（Windsurf / Cursor / Claude / OpenAI / Trae）
- 均使用 SVG 格式
- 统一 24x24 viewBox

### 11.3 卡通插画（Empty State / 引导页 / 加载页）

- 风格：线条简洁、色调柔和（使用主色板中的颜色）
- 主角：一只软糯的小猫咪（品牌吉祥物），表情丰富
- 场景示例：
  - 空项目列表：小猫咪抱着一个空箱子，"还没有项目呢～"
  - 安装成功：小猫咪举着小旗子庆祝
  - 同步中：小猫咪搬运小箱子
  - 冲突：小猫咪左右为难的表情
  - 错误：小猫咪趴在桌上，头上冒问号

---

## 十二、交付检查清单

### 视觉质量
- [ ] 无 emoji 用作图标（统一使用 Lucide SVG）
- [ ] 所有图标来自同一图标库（Lucide React）
- [ ] 品牌 Logo 正确（从 Simple Icons 验证）
- [ ] Hover 状态不导致布局偏移
- [ ] 使用主题色直接引用（`bg-peach-300`）而非 `var()` 包装

### 交互
- [ ] 所有可点击元素有 `cursor-pointer`
- [ ] Hover 状态有清晰的视觉反馈（颜色/阴影/缩放）
- [ ] 过渡时长 150-300ms
- [ ] Focus 状态对键盘导航可见

### 动画
- [ ] 所有异步操作有对应的加载动画
- [ ] 列表使用 stagger 交错渐入
- [ ] 按钮有 whileHover + whileTap 弹性反馈
- [ ] `prefers-reduced-motion` 已适配

### 一致性
- [ ] 圆角统一使用设计系统定义的 token
- [ ] 阴影统一使用设计系统定义的 token
- [ ] 色彩统一使用 tailwind 自定义色板
- [ ] 字体仅使用 Varela Round / Nunito Sans / JetBrains Mono

### 无障碍
- [ ] 所有图片有 alt 文本
- [ ] 表单输入有 label
- [ ] 颜色不是唯一信息传达方式（配合图标/文字）
- [ ] 文字对比度 ≥ 4.5:1