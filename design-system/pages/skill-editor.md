# Skill 编辑页 (Skill Editor)

> **路由**: `/skills/:skillId/edit`
> **侧边栏高亮**: Skills
> **继承**: MASTER.md 全部规范

---

## 页面概述

SKILL.md 的内联编辑器，左侧编辑区 + 右侧实时预览，支持 frontmatter 字段编辑和 Markdown 正文编辑。保存后自动标记为已修改并提示同步。

---

## 区域划分

### 顶部操作栏

- 返回按钮（`@shadcn/button` ghost）+ `@shadcn/breadcrumb`：Skills > Skill 名称 > 编辑
- Skill 名称（H2，只读展示）
- 修改状态指示：未修改（灰色圆点）/ 已修改（蜂蜜橙脉动圆点 + "未保存"文字）
- 操作按钮：
  - 「保存」Primary Clay（Lucide: `save`），有修改时启用
  - 「放弃修改」Ghost（Lucide: `undo-2`）
  - 「在外部编辑器打开」Ghost（Lucide: `external-link`）

### 左侧：编辑区（flex-1）

**Frontmatter 编辑区**（`@shadcn/collapsible` 折叠面板，默认展开）：
- 背景：`cream-100`，`rounded-lg`
- 字段表单（`@shadcn/field` + `@shadcn/label`）：
  - name：`@shadcn/input`（只读，灰显，不可修改名称）
  - description：`@shadcn/textarea`（2 行）
  - version：`@shadcn/input`
- 字段间距：`space-3`

**Markdown 正文编辑区**：
- 代码编辑器风格，使用 JetBrains Mono 字体
- 背景：`white`
- 行号显示（`cream-400` 色）
- 语法高亮（Markdown 格式）
- 光标行高亮（`peach-50` 底色）
- 最小高度：400px，可拖拽调整

### 右侧：实时预览（flex-1）

- 标题：「预览」（Caption，`cream-600`）
- Markdown 渲染结果
- 使用 Nunito Sans 正文 + Varela Round 标题
- 背景：`white`，`rounded-lg`，`shadow-soft`
- 与编辑区同步滚动

### 分隔条

- 使用 `@shadcn/resizable`（`<ResizablePanelGroup>` + `<ResizablePanel>` + `<ResizableHandle>`）实现左右可拖拽分割
- 分隔条颜色：`cream-300`，hover 变 `peach-300`

---

## 保存流程

点击「保存」后：

1. 自动备份旧版本（写入 skill_backups）
2. 更新本地 Skill 库文件 + 数据库记录
3. 弹出确认弹窗："是否同步到所有已部署位置？"
   - 展示部署位置列表（可勾选）
   - 「同步选中」Primary + 「稍后同步」Ghost
4. 保存完成：Toast 成功通知（薄荷绿）

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 备份旧版本 | 内联于保存流程（< 500ms） |
| 写入文件 + 更新数据库 | 保存按钮 loading（< 1s） |
| 同步到部署位置 | 逐项进度（500ms ~ 5s） |

---

## 放弃修改

点击「放弃修改」：
- 弹出 `@shadcn/alert-dialog`：“确定放弃所有修改吗？修改内容将丢失”
- `AlertDialogCancel` + `AlertDialogAction` destructive
- 确认后重新加载原始内容

---

## 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| `Cmd/Ctrl + S` | 保存 |
| `Cmd/Ctrl + Z` | 撤销 |
| `Cmd/Ctrl + Shift + Z` | 重做 |
| `Escape` | 退出编辑（有修改时弹确认） |

---

## 异步操作汇总

| 操作 | 加载方式 |
|------|---------|
| 加载 SKILL.md 内容 | 编辑区骨架屏（< 300ms） |
| 实时预览渲染 | 无延迟（本地渲染） |
| 保存 | 按钮 loading + 成功 Toast |