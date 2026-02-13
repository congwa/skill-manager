# Skill 详情页 (Skill Detail)

> **路由**: `/skills/:skillId`
> **侧边栏高亮**: Skills
> **继承**: MASTER.md 全部规范

---

## 页面概述

展示单个 Skill 的完整信息，包括元数据、内容预览、文件列表、所有部署位置和备份历史。是 Skill 管理的核心操作页面。

---

## 区域划分

### 顶部信息头

- 返回按钮（`@shadcn/button` ghost）+ `@shadcn/breadcrumb`：Skills > Skill 名称
- Skill 名称（H1，Varela Round）
- 描述（Body，`cream-700`，最多 3 行）
- 元信息行（Caption，横排 flex gap-4）：
  - 版本标签（`lavender-100` 底）
  - 来源标签（按 MASTER.md 来源色映射）
  - 本地路径（可点击复制）
  - 最后修改时间
- 操作按钮组（右侧，flex gap-2）：
  - 「部署到新位置」Primary Clay（Lucide: `upload`）
  - 「同步所有部署」Outline（Lucide: `refresh-cw`）
  - 「编辑」Ghost（Lucide: `edit-3`）
  - 「外部编辑器打开」Ghost（Lucide: `external-link`）
  - `@shadcn/dropdown-menu` 更多 `...`：检查更新 / 版本回滚 / 删除

---

### 内容区（双栏或 Tab 切换）

使用 `@shadcn/tabs` 切换 3 个面板：

#### Tab 1: 内容预览

- SKILL.md 的 Markdown 渲染展示
- 使用代码字体 JetBrains Mono 展示 frontmatter 区域
- 正文部分使用 Nunito Sans 渲染
- 底部浅色背景区（`cream-100`）展示文件列表树：
  - 文件夹图标 + 文件图标
  - 文件大小（Caption）
  - 可展开查看文件内容

#### Tab 2: 部署位置

列表展示所有已部署位置：

| 列 | 内容 | 样式 |
|----|------|------|
| 位置 | 项目名 / "全局" | H3，可点击跳转项目详情 |
| 工具 | 工具 SVG 图标 + 名称 | 品牌色图标 |
| 路径 | 完整部署路径 | Caption，截断 + `@shadcn/tooltip` |
| 状态 | Badge | 语义色映射 |
| 最后同步 | 相对时间 | Caption |
| 同步状态 | "一致" / "不一致" | 薄荷绿 / 蜂蜜橙文字 |
| 操作 | 同步 / 查看 Diff / 删除部署 | Icon 按钮组 |

- 列表交错渐入（staggerItem）
- 不一致行：左侧显示蜂蜜橙色条（3px）

#### Tab 3: 备份历史

时间线样式展示备份记录：

- 左侧竖线（`cream-300`，2px）
- 每条记录：
  - 时间点圆点（薄荷绿实心 8px）
  - 版本标签 + 备份原因标签
  - 备份时间（Caption）
  - 操作：「查看内容」Ghost + 「恢复此版本」Outline
- 最新记录在上方
- 使用 stagger 渐入

---

## 部署到新位置

点击「部署到新位置」→ 打开 install-wizard Modal（参见 install-wizard.md），预选当前 Skill。

---

## 同步所有部署

点击「同步所有部署」：

1. 弹出确认 Modal，展示所有部署位置列表 + 当前状态
2. 用户可勾选/取消要同步的位置
3. 对已偏离的位置标注 ⚠ 提醒
4. 确认后执行批量同步

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 加载部署位置 + 状态 | 骨架屏（< 300ms） |
| 批量同步（文件拷贝 + DB 更新） | 逐项进度，每完成一项显示 ✓（1s ~ 10s） |

---

## 删除 Skill

点击 `...` → 「删除」→ 弹出确认 Modal：

- 3 个选项（单选）：
  - 仅删除所有部署记录（保留本地 Skill 库）
  - 删除部署 + 本地 Skill 库文件
  - 完全删除（部署 + 本地文件 + 数据库记录）
- 危险操作：确认按钮为 Danger 样式
- 删除前自动备份

**异步操作**：
| 操作 | 加载方式 |
|------|---------|
| 备份 + 删除文件 + 更新数据库 | Danger 按钮 loading（500ms ~ 2s） |

---

## 异步操作汇总

| 操作 | 加载方式 |
|------|---------|
| 加载 Skill 详情 | 骨架屏（信息头 + Tab 内容区） |
| 加载部署位置列表 | Tab 内骨架屏 |
| 加载备份历史 | Tab 内骨架屏（时间线骨架） |
| 渲染 SKILL.md | 骨架屏（Markdown 区域） |
| 检查更新（skills.sh / Git） | 按钮 Spinner + 结果 Toast |