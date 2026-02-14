# Skills Manager - 产品需求文档（PRD）

> **版本**: v1.0.0
> **更新日期**: 2026-02-12
> **产品定位**: 跨平台 AI 编码工具 Skill 统一管理器

---

## 一、产品概述

### 1.1 背景

随着 AI 编码工具（Windsurf、Cursor、Claude Code、Codex、Trae）的广泛使用，开发者普遍面临以下痛点：

- **Skill 分散管理**：不同工具的 Skill 存放在不同目录，格式和规范各异，难以统一查看和管理
- **跨项目同步困难**：同一个 Skill 需要在多个项目、多个工具中重复配置
- **缺乏版本控制**：Skill 的修改历史无法追踪，误修改后难以回滚
- **无统一备份机制**：Skill 散落在各处，换机或协作时需要逐一迁移

### 1.2 产品定义

**Skills Manager** 是一款跨平台 AI 编码工具 Skill 统一管理器，支持导入项目、发现并管理项目中各工具的 Skill，连接 [skills.sh](https://skills.sh/) 在线仓库进行安装/更新，并提供一键备份同步至 GitHub / Gitee 远程仓库的能力。

### 1.3 目标用户

- 同时使用多款 AI 编码工具的开发者
- 在多个项目间切换并需要统一 Skill 配置的开发者
- 需要团队共享和版本控制 Skill 的技术团队

---

## 二、支持的 AI 编码工具与 Skill 目录结构

### 2.1 工具与目录映射总览

| 工具 | 项目级 Skill 目录 | 全局 Skill 目录 | Skill 入口文件 |
|------|-------------------|-----------------|---------------|
| **Windsurf** | `.windsurf/skills/<name>/` | `~/.codeium/windsurf/skills/<name>/` | `SKILL.md` |
| **Cursor** | `.cursor/skills/<name>/` | `~/.cursor/skills/<name>/` | `SKILL.md` |
| **Claude Code** | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` | `SKILL.md` |
| **Codex** | `.agents/skills/<name>/` | `~/.agents/skills/<name>/` | `SKILL.md` |
| **Trae** | `.trae/skills/<name>/` | `~/.trae/skills/<name>/` | `SKILL.md` |

### 2.2 各工具详细说明

#### Windsurf

- **项目级目录**: `.windsurf/skills/`
- **全局目录**: `~/.codeium/windsurf/skills/`
- **Skill 结构**: 每个 Skill 是一个文件夹，包含必需的 `SKILL.md`（带 YAML frontmatter）和可选的 `scripts/`、`references/`、`assets/` 子目录
- **格式规范**: YAML frontmatter 包含 `name`、`description` 字段，正文为 Markdown 指令

#### Cursor

- **项目级目录**: `.cursor/skills/`
- **全局目录**: `~/.cursor/skills/`
- **Skill 结构**: 与 Windsurf 一致，每个 Skill 是一个文件夹，包含 `SKILL.md` 和可选资源文件
- **兼容目录**: Cursor 同时扫描 `.claude/skills/` 和 `.codex/skills/`（跨工具兼容）
- **特别说明**: Cursor 2.4+ 内置 `/migrate-to-skills` 命令，可将旧规则自动迁移为 Skill

#### Claude Code

- **项目级目录**: `.claude/skills/<skill-name>/`
- **全局目录**: `~/.claude/skills/<skill-name>/`
- **Skill 结构**: 与 Windsurf 类似，每个 Skill 包含 `SKILL.md` 和可选资源文件
- **附加目录**: `.claude/commands/`（自定义斜杠命令）、`.claude/rules/`（规则文件）
- **支持嵌套发现**: 子目录中的 `.claude/skills/` 也会被自动发现

#### Codex (OpenAI)

- **项目级目录**: `.agents/skills/`（从当前目录向上扫描至仓库根目录）
- **用户级目录**: `~/.agents/skills/`
- **管理员级目录**: `/etc/codex/skills/`
- **Skill 结构**: 标准的 `SKILL.md` + 可选 `agents/openai.yaml` 元数据文件
- **配置文件**: `~/.codex/config.toml`（可启用/禁用 Skill）

#### Trae

- **项目级目录**: `.trae/skills/`
- **全局目录**: `~/.trae/skills/`
- **Skill 结构**: 与其他工具一致，每个 Skill 是一个文件夹，包含 `SKILL.md` 和可选资源文件
- **遗留规则**: 仍支持 `.trae/rules/` 目录存放传统规则文件
- **特别说明**: Trae 同样支持 Agent Skills 开放标准

### 2.3 通用 Skill 标准（Agent Skills 规范）

所有工具正在逐步统一采用 [Agent Skills 开放标准](https://agentskills.io/)，核心规范如下：

```
skill-name/
+-- SKILL.md              # 必需，包含 YAML frontmatter + Markdown 指令
+-- scripts/              # 可选，可执行脚本
+-- references/           # 可选，参考文档
+-- assets/               # 可选，模板/图片等资源
+-- agents/
    +-- openai.yaml       # 可选，Codex 专用元数据
```

**SKILL.md frontmatter 示例**:

```yaml
---
name: my-skill
description: 描述 Skill 的功能和触发条件
version: 1.0.0
---
```

---

## 三、核心功能模块

### 3.1 项目管理

#### 3.1.1 导入项目

- 用户通过「添加项目」选择本地项目目录
- 系统自动扫描项目根目录，识别以下 Skill 目录：
  - `.windsurf/skills/`
  - `.cursor/skills/`
  - `.claude/skills/`
  - `.agents/skills/`
  - `.trae/skills/`
- 扫描结果展示为 **项目 -> 工具 -> Skill 列表** 的三级结构
- 支持批量导入多个项目
- 支持拖拽项目目录到应用窗口快速导入

#### 3.1.2 项目仪表盘

- 展示所有已导入项目的概览信息
- 每个项目显示：
  - 项目路径
  - 检测到的工具类型及数量
  - Skill 总数
  - 最近修改时间
  - 同步状态标识（已同步 / 有变更 / 未同步）

### 3.2 Skill 浏览与管理

#### 3.2.1 多维度视图

提供以下视图模式供用户切换：

| 视图 | 说明 |
|------|------|
| **按软件分组** | 以工具（Windsurf / Cursor / Claude Code / Codex / Trae）为一级分类，展示该工具下所有项目的 Skill |
| **按项目分组** | 以项目为一级分类，展示项目下各工具的 Skill |
| **全局汇总** | 去重展示所有 Skill，标注其分布位置（哪些项目、哪些工具） |
| **全局 Skill** | 仅展示各工具全局目录中的 Skill |

#### 3.2.2 Skill 详情

每个 Skill 条目展示以下信息：

- **名称**: Skill 名称（来自 frontmatter `name` 字段）
- **描述**: Skill 描述（来自 frontmatter `description` 字段）
- **来源**: 本地创建 / skills.sh 安装 / Git 仓库导入
- **版本**: 版本号（如有）
- **安装位置**: 当前 Skill 存在于哪些项目的哪些工具目录中
- **文件列表**: Skill 包含的所有文件
- **内容预览**: SKILL.md 内容渲染预览
- **变更状态**: 是否有本地修改（与统一仓库对比）

#### 3.2.3 Skill 编辑

- 支持在应用内直接编辑 Skill 的 SKILL.md 内容
- 编辑后自动标记为「已修改」，提示用户同步
- 支持打开外部编辑器（如 VS Code）编辑完整 Skill 目录

### 3.3 Skill 仓库（skills.sh 集成）

#### 3.3.1 在线浏览

- 集成 [skills.sh](https://skills.sh/) 作为 Skill 在线仓库
- 展示排行榜（Leaderboard）、分类浏览、搜索功能
- 每个 Skill 展示：名称、描述、安装量、评分、兼容工具列表

#### 3.3.2 安装流程

安装 Skill 时需指定以下参数：

1. **目标工具**: 选择安装到哪个工具（Windsurf / Cursor / Claude Code / Codex / Trae），支持多选
2. **安装范围**:
   - **项目级**: 选择具体项目，安装到该项目的工具 Skill 目录
   - **全局级**: 安装到工具的全局 Skill 目录
3. **格式适配**: 所有工具均采用统一的 Agent Skills 标准（`SKILL.md` 格式），无需额外转换，直接写入对应工具的 skills 目录即可

**关键行为**: 安装 Skill 时，系统执行两步操作：
1. **写入本地 Skill 库**（`~/.skills-manager/skills/<name>/`）并在 SQLite 数据库中创建记录
2. **部署到目标位置**：将 Skill 文件拷贝到用户选择的项目工具目录（或全局目录），同时在数据库中记录部署关系

数据库是唯一真相源，本地 Skill 库存储标准文件，项目中的文件是部署副本。

**安装时同名冲突处理**：

从 skills.sh 安装 Skill 时，如果本地已存在同名 Skill：

| 情况 | 系统行为 |
|------|----------|
| 数据库无此 Skill，目标目录也无 | 正常安装，写入本地 Skill 库 + 数据库 + 部署到目标目录 |
| 数据库已有，版本相同 | 提示「已安装相同版本」，用户可选择重新安装（覆盖）或跳过 |
| 数据库已有，版本更旧 | 正常更新，新版本覆盖本地 Skill 库，提示是否同步部署到所有已部署位置 |
| 数据库已有，且本地有手动修改 | 警告「本地已修改，安装新版本将覆盖修改」，展示 Diff，用户选择：覆盖 / 保留本地 / 合并 |
| 目标目录已有但数据库无记录 | 先将目标目录版本导入到本地 Skill 库和数据库，再安装新版本，旧版自动备份可回滚 |

#### 3.3.3 格式兼容说明

当前五大工具均已采用 Agent Skills 开放标准，统一使用 `SKILL.md` 格式，核心差异仅在于存放目录不同：

| 工具 | Skills 目录名 | 备注 |
|------|-------------|------|
| Windsurf | `.windsurf/skills/` | 原生支持 |
| Cursor | `.cursor/skills/` | 兼容扫描 `.claude/skills/`、`.codex/skills/` |
| Claude Code | `.claude/skills/` | 原生支持 |
| Codex | `.agents/skills/` | 原生支持 |
| Trae | `.trae/skills/` | 原生支持 |

系统安装 Skill 时，只需将标准格式的 Skill 文件夹复制到对应工具目录即可，无需格式转换。

### 3.4 Git 仓库集成

#### 3.4.1 从 Git 仓库导入 Skill

- 支持输入 GitHub 或 Gitee 仓库 URL
- 系统克隆仓库并扫描其中的 Skill 文件
- 用户选择要导入的 Skill，指定目标工具和项目
- 支持导入整个仓库的全部 Skill，也支持选择性导入

**导入时同名 Skill 冲突处理**：

导入 Git 仓库时，仓库中的 Skill 可能与本地已有的 Skill（数据库中已存在、项目工具目录、全局目录）同名。系统按以下流程处理：

```
用户输入 Git 仓库 URL，系统克隆并扫描
        |
        v
展示仓库中的 Skill 列表，逐个与本地比对：
        |
        v
对每个 Skill 判断：
        |
        +--【本地不存在同名 Skill】
        |   --> 状态标记为「新增」，直接可导入
        |
        +--【本地已有同名 Skill，内容完全相同】
        |   --> 状态标记为「已存在（一致）」，默认跳过，用户可选择覆盖
        |
        +--【本地已有同名 Skill，内容不同】
            --> 状态标记为「冲突」，需要用户决策
```

**冲突决策界面示例**：

```
导入仓库: github.com/wang/my-skills-backup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

发现 5 个 Skill，其中 2 个与本地冲突：

  Skill              状态        操作
  ──────────────────────────────────────────
  tailwindcss        冲突        [选择...]
  frontend-design    新增        [导入]
  run-tests          冲突        [选择...]
  release            已存在(一致) [跳过]
  web-design         新增        [导入]

冲突详情 - tailwindcss:
┌─────────────────────────┬─────────────────────────┐
│ 仓库版本                 │ 本地版本                 │
│ (来自 GitHub)            │ (本地 Skill 库版本)      │
├─────────────────────────┼─────────────────────────┤
│ version: 1.0.0          │ version: 1.1.0          │
│ 最后修改: 2026-01-15    │ 最后修改: 2026-02-10    │
│                         │                         │
│   [查看完整 Diff]        │   [查看完整 Diff]        │
└─────────────────────────┴─────────────────────────┘

操作选项：
  [A] 用仓库版本覆盖本地 --> 仓库版本写入本地 Skill 库和数据库，
      提示是否同步部署到所有已部署位置
  [B] 保留本地版本       --> 跳过此 Skill 的导入
  [C] 合并               --> 打开合并编辑器，手动合并后写入本地 Skill 库
  [D] 两者都保留         --> 仓库版本重命名为
      "tailwindcss@imported" 存入本地 Skill 库
```

**导入到工具目录时的冲突**：

用户选择将导入的 Skill 安装到具体项目/工具时，如果该工具目录下已有同名 Skill：

| 情况 | 系统行为 |
|------|----------|
| 工具目录中不存在该 Skill | 直接写入 |
| 工具目录中已有，内容与导入版本相同 | 提示「已存在且一致」，跳过 |
| 工具目录中已有，内容与导入版本不同 | 展示 Diff，用户选择：覆盖 / 保留本地 / 合并 |
| 工具目录中已有，且本地版本有未同步的修改 | 额外警告「本地有未备份的修改」，建议先更新本地 Skill 库再导入 |

#### 3.4.2 备份导出至 Git 仓库

- 用户配置远程 Git 仓库地址（GitHub / Gitee）
- 支持 SSH Key 和 HTTPS Token 两种认证方式
- **导出逻辑**：从本地 Skill 库（`~/.skills-manager/skills/`）将所有 Skill 扁平化导出到一个临时目录，结构为 `skills/<skill-name>/`，不包含任何工具或项目维度的分类，然后推送到远程仓库
- 导出时自动生成 `README.md`（Skill 清单表格），方便在 GitHub/Gitee 上直观浏览
- 支持配置自动导出频率（手动 / 每日 / 每次变更时）

**导出目录结构**：

```
export-dir/                        # 导出到 Git 的目录结构
+-- README.md                      # 自动生成的 Skill 清单
+-- skills/
    +-- tailwindcss/
    |   +-- SKILL.md
    |   +-- resources/
    +-- frontend-design/
    |   +-- SKILL.md
    +-- run-tests/
    |   +-- SKILL.md
    +-- ...
```

**远程推送冲突处理**（多设备 / 团队协作场景）：

当用户在设备 A 和设备 B 同时使用 Skills Manager，或团队成员共享同一远程仓库时，推送可能遇到冲突：

```
用户点击「备份导出」，准备推送到 GitHub
        |
        v
[1] 从数据库查询所有 Skill，将本地 Skill 库扁平化导出到临时目录
        |
        v
[2] 先执行 git pull 拉取远程最新内容
        |
        +--【无冲突】--> 正常 merge 后推送
        |
        +--【远程有新 Skill（本地无）】--> 自动合入，提示用户「发现远程新增 N 个 Skill」
        |
        +--【同名 Skill 远程和本地均有修改】
            --> 进入 Git 合并冲突处理：
            [A] 以本地版本为主 --> 本地覆盖远程
            [B] 以远程版本为主 --> 远程覆盖本地，同时更新本地 Skill 库和数据库
            [C] 手动合并       --> 打开合并编辑器
        |
        v
[3] 冲突解决后推送
        |
        v
[4] （可选）如远程有新 Skill，导入到本地 Skill 库和数据库
```

#### 3.4.3 从 Git 仓库恢复 Skill

从远程仓库拉取 Skill 时，系统将扁平化的 `skills/<name>/` 目录扫描后逐个导入到本地 Skill 库和数据库。用户可选择将恢复的 Skill 部署到具体项目和工具。

### 3.5 Skill 统一管理（数据库驱动）

#### 3.5.1 核心架构：数据库即真相源

系统以 **SQLite 数据库** 作为唯一真相源（Single Source of Truth），所有 Skill 信息、部署关系、版本追踪均存储在数据库中。

**核心概念**：

- **Skill**：数据库中的一条记录，包含名称、描述、版本、来源等元数据
- **本地 Skill 库**：`~/.skills-manager/skills/<name>/` 目录，存储每个 Skill 的标准文件（SKILL.md + 可选资源文件）
- **部署**（Deployment）：将本地 Skill 库中的文件拷贝到某个项目的某个工具目录下，数据库记录这个部署关系
- **Skill 名称**（`name`）：来自 SKILL.md frontmatter 的 `name` 字段，是全局唯一标识

#### 3.5.2 本地目录结构

```
~/.skills-manager/
+-- config.json                    # 全局配置
+-- db/
|   +-- skills.db                  # SQLite 数据库（唯一真相源）
+-- skills/                        # 本地 Skill 库（扁平化存储所有 Skill）
|   +-- tailwindcss/
|   |   +-- SKILL.md
|   |   +-- resources/
|   +-- frontend-design/
|   |   +-- SKILL.md
|   +-- run-tests/
|   |   +-- SKILL.md
|   +-- ...
+-- backups/                       # 版本备份目录
+-- cache/                         # skills.sh 缓存
+-- logs/                          # 操作日志
```

**关键设计**：
- `skills/` 目录是扁平化的，每个 Skill 一个文件夹，**不按工具或项目分类**
- 数据库记录每个 Skill 部署到了哪些 项目+工具 位置
- Git 导出时直接将 `skills/` 目录结构原样推送，加上自动生成的 `README.md`

#### 3.5.3 部署模型

将 Skill 部署到某个位置 = **数据库写入部署记录 + 文件拷贝到目标目录**。

```
用户选择将 tailwindcss 部署到 项目A / Windsurf
        |
        v
[1] 数据库写入部署记录：
    skill_deployments 表新增一行：
    {skill: tailwindcss, project: 项目A, tool: windsurf, path: /Users/.../项目A/.windsurf/skills/tailwindcss}
        |
        v
[2] 文件拷贝：
    ~/.skills-manager/skills/tailwindcss/  -->  /Users/.../项目A/.windsurf/skills/tailwindcss/
        |
        v
[3] 计算校验和：
    对目标路径的文件计算 SHA-256，存入数据库
        |
        v
[4] 完成，部署记录生效
```

**部署时冲突处理**：

| 情况 | 系统行为 |
|------|----------|
| 目标目录不存在该 Skill | 直接拷贝文件 |
| 目标目录已存在且内容一致 | 提示「已存在且一致」，跳过或更新数据库记录 |
| 目标目录已存在但内容不同 | 展示 Diff，用户选择：覆盖 / 保留本地 / 合并 |

#### 3.5.4 安装位置追踪（SQLite 数据库）

数据库完整记录了每个 Skill 部署在哪些项目、哪些工具中。核心表结构包括：

- **skills 表**：存储每个 Skill 的基本信息（名称、描述、版本、校验和等）
- **projects 表**：存储已导入项目的信息（路径、名称、状态等）
- **skill_deployments 表**：存储 Skill 的部署关系（Skill + 项目 + 工具 + 路径 + 校验和 + 同步状态）
- **skill_sources 表**：存储 Skill 的来源信息（skills.sh / GitHub / Gitee / 本地）

**核心查询示例**：

```sql
-- 某个 Skill 部署在哪些位置？
SELECT p.name AS project, sd.tool, sd.path
FROM skill_deployments sd
LEFT JOIN projects p ON sd.project_id = p.id
WHERE sd.skill_id = (SELECT id FROM skills WHERE name = 'tailwindcss');

-- 某个项目安装了哪些 Skill？
SELECT s.name, sd.tool FROM skill_deployments sd
JOIN skills s ON sd.skill_id = s.id
WHERE sd.project_id = (SELECT id FROM projects WHERE path = '/Users/wang/code/my-project');

-- 哪些部署的文件与本地 Skill 库不一致？（一致性检查）
SELECT s.name, sd.tool, sd.path, sd.checksum, s.checksum AS lib_checksum
FROM skill_deployments sd
JOIN skills s ON sd.skill_id = s.id
WHERE sd.checksum != s.checksum;
```

> 详细的数据库表结构设计请参阅 [数据库设计文档](./database-design.md)。

#### 3.5.5 一致性检查与自动修正

系统定期检查数据库部署记录与磁盘文件的一致性，自动发现和修正偏差。

**检查维度**：

| 检查项 | 说明 | 自动修正策略 |
|--------|------|------------|
| **数据库有记录，磁盘有文件，内容一致** | 正常状态 | 无需操作 |
| **数据库有记录，磁盘有文件，内容不一致** | 文件被外部修改（用户直接编辑或工具自动修改） | 提示用户选择：用磁盘版本更新数据库 / 用数据库版本覆盖磁盘 / 保持现状标记为「已偏离」 |
| **数据库有记录，磁盘无文件** | 文件被外部删除 | 提示用户选择：从本地 Skill 库重新部署 / 删除数据库记录 |
| **数据库无记录，磁盘有文件** | 用户在项目中手动添加了 Skill | 提示用户选择：导入到数据库和本地 Skill 库 / 忽略 |

**检查触发时机**：

- 应用启动时自动执行全量检查
- 文件监听检测到变更时即时检查
- 用户手动触发「一致性检查」
- 导入项目时对项目下所有 Skill 目录执行检查

**一致性检查流程**：

```
[1] 遍历数据库中所有部署记录
        |
        v
[2] 对每条记录，检查磁盘上对应路径是否存在
        |
        +--【文件存在】--> 计算磁盘文件 checksum，与数据库记录对比
        |   |
        |   +--【一致】--> 跳过
        |   +--【不一致】--> 标记为「已偏离」，等待用户决策
        |
        +--【文件不存在】--> 标记为「丢失」，等待用户决策
        |
        v
[3] 遍历所有已导入项目的 Skill 目录
        |
        v
[4] 对每个发现的 Skill 文件夹，检查数据库中是否有对应记录
        |
        +--【有记录】--> 已在步骤 2 中处理
        +--【无记录】--> 标记为「未追踪」，提示用户导入
        |
        v
[5] 生成一致性报告，展示所有异常项供用户处理
```

#### 3.5.6 同步部署

当本地 Skill 库中的 Skill 被更新时（如从 skills.sh 更新了新版本），系统支持将更新同步到所有已部署位置：

```
本地 Skill 库中 tailwindcss 更新为 v1.2.0
        |
        v
[1] 查询数据库，找到所有部署了 tailwindcss 的位置：
    - 项目 A / Windsurf   (checksum 一致)
    - 项目 A / Cursor     (checksum 一致)
    - 项目 B / Windsurf   (checksum 不一致，已偏离)
    - 全局 / Claude Code  (checksum 一致)
        |
        v
[2] 用户选择同步范围：
    +--【全部同步】--> 将新版本拷贝到所有部署位置
    +--【按项目选择】--> 仅同步到选定项目
    +--【按工具选择】--> 仅同步到选定工具
    +--【精确选择】--> 用户勾选具体的 项目+工具 组合
    +--【跳过已偏离】--> 不同步已被本地修改的部署（项目 B）
        |
        v
[3] 对已偏离的部署（项目 B / Windsurf），展示三方 Diff：
    原始版本 / 项目 B 本地修改版 / 新版本 v1.2.0
    用户选择：覆盖 / 保留本地 / 合并
        |
        v
[4] 执行文件拷贝，更新数据库中的 checksum
```

#### 3.5.7 冲突处理

**场景一：首次导入项目时发现同名 Skill**

导入新项目时，扫描到的 Skill 与数据库中已有的 Skill 同名但内容不同：

```
发现同名不同内容 Skill: "tailwindcss"
        |
        v
展示 Diff 对比界面：
  左侧: 本地 Skill 库版本
  右侧: 新项目中的版本
        |
        v
用户选择：
  [A] 保留本地 Skill 库版本 --> 新项目的副本标记为"已偏离"
  [B] 用新项目版本覆盖 --> 更新本地 Skill 库，提示是否同步部署到其他位置
  [C] 合并两个版本 --> 打开合并编辑器，手动合并后写入本地 Skill 库
  [D] 保留两份独立管理 --> 将新项目版本视为独立 Skill，
      自动重命名为 "tailwindcss@项目A" 存入本地 Skill 库
```

**场景二：同一项目不同工具目录下的同名 Skill**

| 检测结果 | 系统行为 |
|----------|----------|
| 内容完全相同 | 正常状态，无需处理 |
| 内容不同，仅一个工具有修改 | 提示用户："发现 tailwindcss 在 Windsurf 中已修改，但 Cursor 中仍是旧版本，是否同步？" |
| 内容不同，多个工具均有修改 | 弹出冲突解决界面，展示所有版本的 Diff，用户选择主版本后同步 |

**场景三：不同项目同时修改同名 Skill**

```
项目 A / .windsurf/skills/tailwindcss  (修改了 A 内容)
项目 B / .windsurf/skills/tailwindcss  (修改了 B 内容)
本地 Skill 库 / tailwindcss             (仍为旧内容)

        |
        v
[1] 系统检测到两处变更，且互相冲突
        |
        v
[2] 弹出冲突解决向导：
    "tailwindcss 在以下位置存在不同版本："

    版本 1: 项目 A / Windsurf  (修改时间: 14:30)
    版本 2: 项目 B / Windsurf  (修改时间: 15:00)
    版本 3: 本地 Skill 库      (修改时间: 昨天)

    操作选项：
    [A] 选择版本 1 为主 --> 版本 1 写入本地 Skill 库，提示同步到版本 2 的位置
    [B] 选择版本 2 为主 --> 版本 2 写入本地 Skill 库，提示同步到版本 1 的位置
    [C] 合并编辑     --> 打开三向合并编辑器
    [D] 分别保留     --> 各项目保持各自版本，标记为「已偏离」
```

**场景四：用户在某个工具中删除了 Skill**

```
用户删除了 项目 A / .windsurf/skills/tailwindcss
        |
        v
系统检测到删除操作，弹出确认：
  "tailwindcss 已从 项目 A / Windsurf 中删除，如何处理？"

  [A] 仅删除该部署记录 --> 本地 Skill 库不受影响，其他部署不受影响
  [B] 从所有位置删除   --> 删除所有部署，但本地 Skill 库保留
  [C] 完全删除         --> 删除所有部署 + 本地 Skill 库中的副本
```

**场景五：Cursor 跨工具兼容扫描导致的重复识别**

Cursor 会同时扫描 `.cursor/skills/`、`.claude/skills/`、`.codex/skills/`，当同一项目中这些目录存在同名 Skill 时：

| 情况 | Skills Manager 处理 |
|------|--------------------|
| `.cursor/skills/A` 和 `.claude/skills/A` 内容相同 | 视为同一 Skill 的两个部署，状态标记为「一致」 |
| `.cursor/skills/A` 和 `.claude/skills/A` 内容不同 | 提示用户「Cursor 和 Claude Code 目录中存在同名但不同内容的 Skill，Cursor 会同时加载两者，建议统一」 |
| 仅 `.claude/skills/A` 存在（Cursor 兼容扫描到） | 正常识别为 Claude Code 的 Skill，同时标注「Cursor 也可使用」 |

**场景六：SKILL.md 相同但支撑文件不同**

```
项目 A / .windsurf/skills/deploy-app/
  +-- SKILL.md          (checksum: aaa)  ← 相同
  +-- scripts/deploy.sh (checksum: bbb)

项目 B / .windsurf/skills/deploy-app/
  +-- SKILL.md          (checksum: aaa)  ← 相同
  +-- scripts/deploy.sh (checksum: ccc)  ← 不同！
```

系统行为：
- checksum 计算覆盖整个 Skill 文件夹（所有文件），非仅 SKILL.md
- 上述情况会被检测为「内容不同」，进入标准冲突处理流程
- Diff 界面中逐文件展示差异，方便用户精确定位

#### 3.5.8 管理规则汇总

| 规则 | 说明 |
|------|------|
| **数据库即真相** | SQLite 数据库是所有 Skill 信息和部署关系的唯一真相源 |
| **安装即入库** | 任何方式安装的 Skill 均自动写入本地 Skill 库和数据库 |
| **部署即拷贝** | 部署 Skill 到项目 = 数据库记录 + 文件拷贝到目标目录 |
| **变更即通知** | 任何部署位置发生变更时立即通知用户，不自动覆盖 |
| **不自动覆盖** | 内容冲突时必须用户确认，绝不自动覆盖任何版本 |
| **删除安全** | 删除部署不会自动删除本地 Skill 库中的副本，需用户显式确认 |
| **备份先行** | 任何覆盖操作前自动备份旧版本，支持一键回滚 |
| **一致性保障** | 定期检查数据库记录与磁盘文件的一致性，自动发现偏差 |

#### 3.5.9 一键备份导出流程

```
用户点击「备份导出」
        |
        v
[1] 执行一致性检查，确保本地 Skill 库完整
        |
        v
[2] 检测是否存在未处理的偏离（部署文件与本地 Skill 库不一致）
        |
        +--【无偏离】--> 继续
        +--【有偏离】--> 提示用户先处理偏离，或忽略继续导出
        |
        v
[3] 将 ~/.skills-manager/skills/ 目录扁平化导出
        |
        v
[4] 自动生成 README.md（Skill 清单 + 部署情况表格）
        |
        v
[5] 自动生成 commit message（含变更摘要）
        |
        v
[6] 推送至配置的 GitHub / Gitee 远程仓库
        |
        v
完成，显示导出报告
```

### 3.6 变更检测与同步

#### 3.6.1 自动变更检测

- 系统后台监控所有已导入项目的 Skill 目录
- 使用文件系统 Watch 机制（如 `fs.watch` / `chokidar`）实时监听变更
- 检测内容包括：
  - 文件内容修改
  - 新增 Skill
  - 删除 Skill
  - 文件重命名
- 检测机制：对每个已部署的 Skill 计算文件内容 checksum（SHA-256），与 SQLite 数据库中存储的部署校验和记录对比

#### 3.6.2 变更通知与操作

检测到变更后，系统弹出通知，包含以下信息：

- 变更所在的项目路径
- 变更所属的工具
- 变更的 Skill 名称
- 变更类型（修改/新增/删除）
- 与本地 Skill 库版本的对比状态（一致 / 有差异 / 数据库无此 Skill）
- 操作选项：
  - **更新本地 Skill 库**: 将变更写回本地 Skill 库并更新数据库
  - **更新 + 同步所有部署**: 先更新本地 Skill 库，然后同步到所有其他已部署位置
  - **稍后处理**: 标记为待处理，在同步中心展示
  - **忽略**: 忽略本次变更，不同步

#### 3.6.3 一键全量同步

- 一键将某个 Skill 的本地 Skill 库版本同步到所有已部署位置：

```
用户在同步中心选择 tailwindcss，点击「同步到所有位置」
        |
        v
查询 SQLite 数据库，找到所有部署位置：
  - 项目 A / Windsurf   (checksum: abc123)
  - 项目 A / Cursor     (checksum: abc123)  ← 一致
  - 项目 B / Windsurf   (checksum: def456)  ← 不一致
  - 全局 / Claude Code  (checksum: abc123)  ← 一致
  本地 Skill 库版本     (checksum: abc123)
        |
        v
仅更新 checksum 不一致的部署（项目 B / Windsurf）
        |
        v
写入完成，更新 SQLite 数据库中的部署校验和记录
```

- 支持选择性同步：仅同步到特定项目或特定工具

### 3.7 Skill 更新管理

#### 3.7.1 更新检测

- 定期检查 skills.sh 上已安装 Skill 是否有新版本
- 定期检查 Git 仓库来源的 Skill 是否有更新（`git fetch` + 比对）
- 更新检测频率可配置（启动时 / 每小时 / 每日 / 手动）

#### 3.7.2 更新提示

发现可更新的 Skill 时，系统展示更新列表，包含：

- Skill 名称
- 当前版本与最新版本
- 来源（skills.sh / Git 仓库）
- 更新范围选择（全项目全工具 / 仅当前项目 / 选择性更新 / 跳过）

#### 3.7.3 更新策略

| 更新范围 | 说明 |
|----------|------|
| **全项目全工具** | 将所有已安装该 Skill 的位置全部更新到最新版本 |
| **特定项目** | 仅更新选定项目中的该 Skill |
| **特定工具** | 仅更新选定工具目录中的该 Skill |
| **仅本地 Skill 库** | 仅更新本地 Skill 库，不影响项目中已部署的版本 |

更新前自动备份旧版本，支持一键回滚。

#### 3.7.4 更新与本地修改冲突

当 skills.sh 或 Git 仓库有新版本，但用户本地已对该 Skill 做了手动修改时：

```
skills.sh 发现 tailwindcss 有新版本 v1.2.0
本地 Skill 库版本为 v1.1.0，但用户已手动修改了内容
        |
        v
系统检测到本地版本与安装时的 v1.1.0 原始内容不一致
        |
        v
更新提示中标注「本地已修改」警告：

  tailwindcss  v1.1.0 → v1.2.0  (skills.sh)
  ⚠️ 本地已修改，更新将覆盖您的修改

  操作选项：
  [A] 查看三方 Diff  --> 展示: 原始 v1.1.0 / 本地修改版 / 新版 v1.2.0
  [B] 直接更新       --> 用 v1.2.0 覆盖，旧版自动备份，可回滚
  [C] 合并更新       --> 打开三向合并编辑器，将本地修改合入新版本
  [D] 跳过本次更新   --> 保留本地修改版本不变
```

从 Git 仓库来源的 Skill 同理：远程仓库有新 commit 但本地有修改时，采用相同的三方 Diff + 合并策略。

---

## 四、用户界面设计

### 4.1 整体布局

应用采用经典的**侧边栏 + 主内容区**双栏布局：

- **侧边栏**：项目列表、按工具分组导航、仓库入口（skills.sh / GitHub / Gitee）、同步中心、设置
- **主内容区**：根据侧边栏选择展示 Skill 列表、Skill 详情、仓库浏览、安装向导、同步中心等页面
- **底部状态栏**：变更通知、同步进度、更新提示

### 4.2 关键页面

#### 4.2.1 按工具视图

以工具为一级分类，展示全局 Skill 和各项目下该工具的 Skill 列表。每个 Skill 条目显示名称、版本、同步状态。

#### 4.2.2 Skill 安装页面

安装向导包含以下步骤：

1. 选择 Skill（从 skills.sh 浏览或搜索）
2. 选择目标工具（多选：Windsurf / Cursor / Claude Code / Codex / Trae）
3. 选择安装范围（项目级 - 选择具体项目 / 全局级）
4. 确认安装（预览安装结果，确认同时写入本地 Skill 库和数据库）

#### 4.2.3 同步中心页面

展示以下信息：

- 远程仓库连接状态
- 最近同步时间
- 本地变更数量
- 变更详情列表（Skill 名称、项目、工具、变更类型）
- 操作按钮：同步到所有位置 / 仅推送到远程仓库 / 查看 Diff

#### 4.2.4 设置页面

- **通用设置**: 语言、主题、启动行为
- **Git 仓库配置**: GitHub / Gitee 仓库地址、认证方式
- **同步设置**: 自动同步频率、变更通知开关
- **更新设置**: 更新检测频率、自动更新开关
- **本地 Skill 库**: 自定义本地 Skill 库路径（默认 `~/.skills-manager/skills/`）
- **工具检测**: 手动配置工具目录路径（用于非标准安装路径）

---

## 五、技术架构

### 5.1 技术选型建议

| 层级 | 技术方案 | 说明 |
|------|---------|------|
| **桌面框架** | Electron / Tauri | 跨平台桌面应用 |
| **前端框架** | React + TypeScript | UI 开发 |
| **UI 组件** | shadcn/ui + Tailwind CSS | 现代化界面 |
| **状态管理** | Zustand / Jotai | 轻量状态管理 |
| **文件监听** | chokidar | 文件变更检测 |
| **Git 操作** | simple-git / isomorphic-git | Git 仓库操作 |
| **Markdown 解析** | remark / gray-matter | SKILL.md 解析 |
| **本地存储** | SQLite（better-sqlite3） | 唯一真相源：Skill 信息、部署关系、版本追踪、来源、校验和、一致性状态等 |
| **HTTP 客户端** | axios / fetch | skills.sh API 调用 |

### 5.2 核心模块架构

```
+--------------------------------------------------+
|                  UI Layer (React)                 |
|  +--------+ +--------+ +--------+ +-----------+  |
|  |项目管理 | |Skill浏览| |仓库浏览 | |同步中心    |  |
|  +--------+ +--------+ +--------+ +-----------+  |
+--------------------------------------------------+
|              Business Logic Layer                 |
|  +----------+ +---------+ +--------+ +--------+  |
|  |项目扫描器 | |部署引擎 | |同步引擎 | |更新检测 |  |
|  +----------+ +---------+ +--------+ +--------+  |
+--------------------------------------------------+
|               Data Access Layer                   |
|  +----------+ +---------+ +--------+ +--------+  |
|  |文件系统   | |Git 操作  | |HTTP API| |本地DB  |  |
|  +----------+ +---------+ +--------+ +--------+  |
+--------------------------------------------------+
```

### 5.3 关键数据模型

```typescript
// 项目
interface Project {
  id: string;
  name: string;
  path: string;
  tools: ToolType[];          // 检测到的工具类型
  lastScanned: Date;
  status: 'synced' | 'changed' | 'unsynced';
}

// 工具类型
type ToolType = 'windsurf' | 'cursor' | 'claude-code' | 'codex' | 'trae';

// Skill（数据库中的记录）
interface Skill {
  id: string;
  name: string;               // 全局唯一标识
  description: string;
  version?: string;
  source: SkillSource;
  deployments: SkillDeployment[];  // 所有部署位置
  localPath: string;          // 本地 Skill 库中的路径
  checksum: string;           // 本地 Skill 库中文件的 SHA-256 校验和
  lastModified: Date;
}

// Skill 来源
interface SkillSource {
  type: 'local' | 'skills-sh' | 'github' | 'gitee';
  url?: string;               // skills.sh URL 或 Git 仓库 URL
  installedVersion?: string;  // 安装时的版本
  originalChecksum?: string;  // 安装时原始内容的校验和（用于检测本地修改）
}

// Skill 部署位置
interface SkillDeployment {
  id: string;
  projectId?: string;         // null 表示全局部署
  tool: ToolType;
  path: string;               // 部署目标的实际文件路径
  checksum: string;           // 部署位置文件的当前校验和
  status: 'synced' | 'diverged' | 'missing' | 'untracked';
  lastSynced: Date;
}

// Git 导出配置
interface GitExportConfig {
  remote: {
    provider: 'github' | 'gitee';
    url: string;
    authType: 'ssh' | 'token';
  };
  autoExport: 'manual' | 'daily' | 'on-change';
  updateCheckInterval: 'startup' | 'hourly' | 'daily' | 'manual';
}
```

---

## 六、核心用户流程

### 6.1 首次使用流程

```
启动应用
  |
  v
引导页：确认本地 Skill 库路径（默认 ~/.skills-manager/skills/）
  |
  v
导入项目（选择项目目录）
  |
  v
自动扫描并展示发现的工具和 Skill
  |
  v
（可选）配置 GitHub / Gitee 远程仓库
  |
  v
（可选）将扫描到的 Skill 导入本地 Skill 库和数据库
  |
  v
进入主界面
```

### 6.2 安装 Skill 流程

```
用户浏览 skills.sh 仓库，选择 Skill
  |
  v
选择目标工具（可多选）
  |
  v
选择安装范围（项目级/全局级）
  |
  v
系统下载 Skill（统一 SKILL.md 格式，无需转换）
  |
  v
写入本地 Skill 库 + 数据库记录
  |
  v
部署到目标工具目录（拷贝文件 + 写入部署记录）
  |
  v
完成，展示安装结果
```

### 6.3 变更检测与同步流程

```
后台监听检测到项目中 Skill 文件变更
  |
  v
计算文件 checksum，对比数据库中的部署记录
  |
  v
确认存在差异，弹出变更通知
  |
  v
用户选择同步策略:
  |-- 更新本地 Skill 库 + 同步所有部署 --> 更新本地 Skill 库并同步到所有已部署位置
  |-- 仅更新本地 Skill 库 --> 仅更新本地 Skill 库和数据库
  |-- 稍后处理 --> 标记为待处理，在同步中心展示
  |-- 忽略 --> 忽略本次变更
  |
  v
执行同步操作
  |
  v
（如配置自动推送）推送到远程 Git 仓库
```

### 6.4 从 Git 仓库恢复 Skill 流程

```
用户输入 GitHub / Gitee 仓库 URL
  |
  v
系统克隆仓库，扫描 Skill 列表
  |
  v
展示可导入的 Skill 清单
  |
  v
用户选择要导入的 Skill
  |
  v
选择目标工具和项目
  |
  v
系统将 Skill 写入目标工具的 skills 目录（统一 SKILL.md 格式，无需转换）
  |
  v
写入本地 Skill 库和数据库，记录部署关系
  |
  v
完成
```

---

## 七、非功能性需求

### 7.1 性能要求

- 项目扫描：1000 个 Skill 的项目扫描应在 3 秒内完成
- 文件监听：变更检测延迟不超过 2 秒
- UI 响应：所有界面操作响应时间不超过 200ms
- 同步操作：单个 Skill 的同步操作不超过 1 秒

### 7.2 安全要求

- Git 仓库凭证使用系统密钥链加密存储（macOS Keychain / Windows Credential Manager）
- 不在日志或配置文件中明文存储密码或 Token
- 支持 SSH Key 认证，优先推荐使用

### 7.3 可靠性要求

- 所有写操作前自动创建备份
- 同步失败时自动回滚，不破坏现有文件
- 冲突时不自动覆盖，必须由用户确认
- SQLite 数据库使用 WAL 模式保障并发安全，备份目录支持历史回溯

### 7.4 兼容性要求

- 支持 macOS、Windows、Linux 三平台
- 支持各工具的最新稳定版本目录结构
- 对未知工具目录结构具备可扩展性（插件式工具适配器）

---

## 八、路线图

### Phase 1: MVP（最小可行产品）

- 项目导入与自动扫描
- 五大工具 Skill 目录识别与展示
- 按项目/按工具双视图
- SQLite 数据库 + 本地 Skill 库维护
- 基础的 Skill 安装（从本地/skills.sh）

### Phase 2: 同步与备份

- GitHub / Gitee 远程仓库配置
- 一键备份导出到 Git 仓库
- 文件变更自动检测与通知
- 一键全量同步到所有位置
- Diff 对比与冲突解决

### Phase 3: 智能更新

- skills.sh 更新检测
- Git 仓库更新检测
- 更新策略配置（全量/选择性）
- 版本回滚功能

### Phase 4: 高级功能

- Skill 编辑器（内置 Markdown 编辑 + 预览）
- Skill 创建向导
- 团队协作功能
- CLI 命令行工具
- VS Code / JetBrains 插件集成

---

## 九、术语表

| 术语 | 定义 |
|------|------|
| **Skill** | AI 编码工具的扩展能力包，包含指令、脚本、参考文档等，用于增强 AI 代理在特定领域的表现 |
| **Agent Skills 标准** | 由 [agentskills.io](https://agentskills.io/) 定义的开放标准，规范了 Skill 的目录结构和文件格式 |
| **skills.sh** | Agent Skills 的在线仓库和目录，开发者可以浏览、搜索和安装社区贡献的 Skill |
| **本地 Skill 库** | `~/.skills-manager/skills/` 目录，扮平化存储所有 Skill 的标准文件，配合 SQLite 数据库作为唯一真相源 |
| **部署** | 将本地 Skill 库中的 Skill 文件拷贝到某个项目的某个工具目录下，同时在数据库中记录部署关系 |
| **一致性检查** | 定期校验数据库部署记录与磁盘实际文件是否一致，自动发现偏差并提示用户修正 |
| **全局 Skill** | 安装在工具全局目录中的 Skill，对所有项目生效 |
| **项目级 Skill** | 安装在特定项目目录中的 Skill，仅对该项目生效 |

---

## 十、附录

### A. 参考链接

- **Agent Skills 规范**: https://agentskills.io/
- **skills.sh 仓库**: https://skills.sh/
- **Windsurf Skills 文档**: https://docs.windsurf.com/windsurf/cascade/skills
- **Cursor Skills 文档**: https://cursor.com/docs/context/skills
- **Claude Code Skills 文档**: https://code.claude.com/docs/en/skills
- **Codex Skills 文档**: https://developers.openai.com/codex/skills/
- **Trae Skills 文档**: https://docs.trae.ai/ide/skills

### B. 竞品分析

目前市场上尚无专门的跨平台 AI 编码工具 Skill 管理器。各工具的 Skill 管理现状：

| 工具 | 内置管理 | 社区仓库 | 跨工具同步 | 备份能力 |
|------|---------|---------|-----------|---------|
| Windsurf | 基础文件管理 | skills.sh | 无 | 无 |
| Cursor | 设置面板管理 | cursor.directory | 无 | 无 |
| Claude Code | CLI 管理 | skills.sh | 无 | 无 |
| Codex | CLI + skill-installer | skills.sh | 无 | 无 |
| Trae | 设置面板管理 | 社区贡献 | 无 | 无 |

**Skills Manager 的差异化价值**: 统一管理 + 跨工具同步 + 自动备份 + 变更追踪
