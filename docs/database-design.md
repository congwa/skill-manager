# Skills Manager - 数据库设计文档

> **版本**: v2.0.0
> **更新日期**: 2026-02-13
> **数据库引擎**: SQLite（通过 better-sqlite3 驱动）
> **数据库文件路径**: `~/.skills-manager/db/skills.db`

---

## 一、设计概述

### 1.1 核心原则

**数据库即唯一真相源（Single Source of Truth）**。所有 Skill 信息、部署关系、版本追踪均存储在 SQLite 数据库中。本地 Skill 库（`~/.skills-manager/skills/`）存储 Skill 文件，项目中的文件是部署副本，Git 仓库是扁平化导出。

### 1.2 设计目标

- **统一管理所有元数据**：Skill 信息、部署关系、来源追踪、版本备份、一致性状态全部存储在 SQLite 中
- **高效查询**：支持复杂的多表关联查询（如"某个 Skill 部署在哪些项目的哪些工具中"）
- **事务安全**：所有写操作使用事务保证数据一致性，避免部分写入导致的数据损坏
- **一致性保障**：支持数据库记录与磁盘文件的双向校验，自动发现偏差
- **并发控制**：SQLite WAL 模式支持读写并发，适合文件监听后台线程与 UI 前台线程同时访问
- **轻量嵌入**：无需独立数据库服务，随应用启动自动初始化

---

## 二、ER 关系图

```
┌─────────────┐       ┌───────────────────┐       ┌─────────────┐
│  projects   │       │ skill_deployments  │       │   skills    │
│─────────────│       │───────────────────│       │─────────────│
│ id (PK)     │◄──┐   │ id (PK)           │   ┌──►│ id (PK)     │
│ name        │   └───│ project_id (FK)   │   │   │ name (UQ)   │
│ path (UQ)   │       │ skill_id (FK)─────│───┘   │ description │
│ status      │       │ tool              │       │ version     │
│ last_scanned│       │ path (UQ)         │       │ checksum    │
│ created_at  │       │ checksum          │       │ local_path  │
│ updated_at  │       │ status            │       │ last_modified│
└─────────────┘       │ last_synced       │       │ created_at  │
                      │ created_at        │       │ updated_at  │
                      │ updated_at        │       └──────┬──────┘
                      └───────────────────┘              │
                                                         │
                      ┌──────────────────┐               │
                      │  skill_sources   │               │
                      │──────────────────│               │
                      │ id (PK)          │               │
                      │ skill_id (FK)────│───────────────┤
                      │ source_type      │               │
                      │ url              │               │
                      │ installed_version│               │
                      │ original_checksum│               │
                      │ created_at       │               │
                      │ updated_at       │               │
                      └──────────────────┘               │
                                                         │
                      ┌──────────────────┐               │
                      │  skill_backups   │               │
                      │──────────────────│               │
                      │ id (PK)          │               │
                      │ skill_id (FK)────│───────────────┤
                      │ version_label    │               │
                      │ backup_path      │               │
                      │ checksum         │               │
                      │ reason           │               │
                      │ created_at       │               │
                      └──────────────────┘               │
                                                         │
                      ┌──────────────────┐               │
                      │  sync_history    │               │
                      │──────────────────│               │
                      │ id (PK)          │               │
                      │ skill_id (FK)────│───────────────┘
                      │ deployment_id(FK)│
                      │ action           │
                      │ from_checksum    │
                      │ to_checksum      │
                      │ status           │
                      │ error_message    │
                      │ created_at       │
                      └──────────────────┘

┌──────────────────┐              ┌──────────────────┐
│ git_export_config│              │ change_events    │
│──────────────────│              │──────────────────│
│ id (PK)          │              │ id (PK)          │
│ provider         │              │ deployment_id(FK)│
│ remote_url       │              │ event_type       │
│ auth_type        │              │ old_checksum     │
│ branch           │              │ new_checksum     │
│ auto_export      │              │ resolution       │
│ last_push_at     │              │ resolved_at      │
│ last_pull_at     │              │ created_at       │
│ created_at       │              └──────────────────┘
│ updated_at       │
└──────────────────┘

┌──────────────────┐
│  app_settings    │
│──────────────────│
│ key (PK)         │
│ value            │
│ updated_at       │
└──────────────────┘
```

**核心关系**：
- `projects` 1:N `skill_deployments`：一个项目可以部署多个 Skill
- `skills` 1:N `skill_deployments`：一个 Skill 可以部署到多个位置（不同项目、不同工具）
- `skills` 1:1 `skill_sources`：每个 Skill 有一个来源记录
- `skills` 1:N `skill_backups`：每个 Skill 可以有多个历史备份
- `skills` 1:N `sync_history`：每个 Skill 的同步操作历史
- `skill_deployments` 1:N `change_events`：每个部署的变更事件记录

---

## 三、表结构详细设计

### 3.1 projects（项目表）

存储所有已导入的本地项目信息。

```sql
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,              -- UUID
    name        TEXT NOT NULL,                 -- 项目名称（通常为目录名）
    path        TEXT NOT NULL UNIQUE,          -- 项目绝对路径
    status      TEXT NOT NULL DEFAULT 'unsynced'
                CHECK (status IN ('synced', 'changed', 'unsynced')),
    last_scanned DATETIME,                    -- 最近一次扫描时间
    created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_name ON projects(name);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID 主键 |
| `name` | TEXT | NOT NULL | 项目名称（通常取目录名） |
| `path` | TEXT | NOT NULL, UNIQUE | 项目绝对路径，唯一标识 |
| `status` | TEXT | CHECK | 同步状态：`synced`（已同步）/ `changed`（有变更）/ `unsynced`（未同步） |
| `last_scanned` | DATETIME | | 最近一次扫描时间 |
| `created_at` | DATETIME | DEFAULT now | 导入时间 |
| `updated_at` | DATETIME | DEFAULT now | 最近更新时间 |

---

### 3.2 skills（Skill 表）

存储所有 Skill 的核心信息。每个 Skill name 全局唯一，对应本地 Skill 库中的标准文件。

```sql
CREATE TABLE skills (
    id            TEXT PRIMARY KEY,            -- UUID
    name          TEXT NOT NULL UNIQUE,         -- Skill 名称（来自 SKILL.md frontmatter）
    description   TEXT,                        -- Skill 描述
    version       TEXT,                        -- 版本号（来自 frontmatter，可选）
    checksum      TEXT,                        -- 本地 Skill 库中文件的 SHA-256 校验和
    local_path    TEXT,                        -- 本地 Skill 库中的路径（如 ~/.skills-manager/skills/tailwindcss）
    last_modified DATETIME,                    -- 本地 Skill 库中文件的最近修改时间
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_skills_name ON skills(name);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID 主键 |
| `name` | TEXT | NOT NULL, UNIQUE | Skill 名称，全局唯一标识 |
| `description` | TEXT | | Skill 描述（来自 SKILL.md frontmatter） |
| `version` | TEXT | | 版本号（来自 frontmatter，可选） |
| `checksum` | TEXT | | 本地 Skill 库中文件的 SHA-256 校验和 |
| `local_path` | TEXT | | 本地 Skill 库中的路径（`~/.skills-manager/skills/<name>`） |
| `last_modified` | DATETIME | | 本地 Skill 库中文件的最近修改时间 |
| `created_at` | DATETIME | DEFAULT now | 首次入库时间 |
| `updated_at` | DATETIME | DEFAULT now | 最近更新时间 |

---

### 3.3 skill_sources（Skill 来源表）

记录每个 Skill 的安装来源，支持追踪是从 skills.sh、GitHub、Gitee 还是本地创建的。

```sql
CREATE TABLE skill_sources (
    id                TEXT PRIMARY KEY,        -- UUID
    skill_id          TEXT NOT NULL UNIQUE,     -- 关联 skills.id，一对一
    source_type       TEXT NOT NULL
                      CHECK (source_type IN ('local', 'skills-sh', 'github', 'gitee')),
    url               TEXT,                    -- 来源 URL（skills.sh 链接或 Git 仓库地址）
    installed_version TEXT,                    -- 安装时的版本号
    original_checksum TEXT,                    -- 安装时原始内容的校验和（用于检测本地修改）
    created_at        DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at        DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX idx_skill_sources_type ON skill_sources(source_type);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID 主键 |
| `skill_id` | TEXT | NOT NULL, UNIQUE, FK | 关联 skills 表，一对一关系 |
| `source_type` | TEXT | CHECK | 来源类型：`local`（本地创建）/ `skills-sh` / `github` / `gitee` |
| `url` | TEXT | | 来源 URL |
| `installed_version` | TEXT | | 从远程源安装时的版本号 |
| `original_checksum` | TEXT | | 安装时原始内容的 SHA-256（用于判断是否有本地修改） |
| `created_at` | DATETIME | DEFAULT now | 记录创建时间 |
| `updated_at` | DATETIME | DEFAULT now | 记录更新时间 |

---

### 3.4 skill_deployments（Skill 部署表）

记录每个 Skill 部署到哪些项目的哪些工具目录中。**部署 = 数据库记录 + 文件拷贝到目标目录**。

```sql
CREATE TABLE skill_deployments (
    id          TEXT PRIMARY KEY,              -- UUID
    skill_id    TEXT NOT NULL,                 -- 关联 skills.id
    project_id  TEXT,                          -- 关联 projects.id，NULL 表示全局部署
    tool        TEXT NOT NULL
                CHECK (tool IN ('windsurf', 'cursor', 'claude-code', 'codex', 'trae')),
    path        TEXT NOT NULL UNIQUE,          -- 部署目标的完整文件系统路径
    checksum    TEXT,                          -- 部署位置文件的当前 SHA-256 校验和
    status      TEXT NOT NULL DEFAULT 'synced'
                CHECK (status IN ('synced', 'diverged', 'missing', 'untracked')),
    last_synced DATETIME,                      -- 最近一次同步时间
    created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- 确保同一 Skill 在同一项目同一工具下只有一个部署
CREATE UNIQUE INDEX idx_skill_deployments_unique
    ON skill_deployments(skill_id, COALESCE(project_id, '__global__'), tool);
CREATE INDEX idx_skill_deployments_skill ON skill_deployments(skill_id);
CREATE INDEX idx_skill_deployments_project ON skill_deployments(project_id);
CREATE INDEX idx_skill_deployments_tool ON skill_deployments(tool);
CREATE INDEX idx_skill_deployments_status ON skill_deployments(status);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID 主键 |
| `skill_id` | TEXT | NOT NULL, FK | 关联 skills 表 |
| `project_id` | TEXT | FK, NULLABLE | 关联 projects 表，`NULL` 表示全局部署 |
| `tool` | TEXT | NOT NULL, CHECK | 工具类型：`windsurf` / `cursor` / `claude-code` / `codex` / `trae` |
| `path` | TEXT | NOT NULL, UNIQUE | 部署目标的完整文件系统路径 |
| `checksum` | TEXT | | 部署位置文件的当前 SHA-256 校验和 |
| `status` | TEXT | CHECK | 一致性状态：`synced`（与本地 Skill 库一致）/ `diverged`（已偏离）/ `missing`（文件丢失）/ `untracked`（磁盘有文件但无数据库记录） |
| `last_synced` | DATETIME | | 最近一次与本地 Skill 库同步的时间 |
| `created_at` | DATETIME | DEFAULT now | 部署时间 |
| `updated_at` | DATETIME | DEFAULT now | 最近更新时间 |

---

### 3.5 skill_backups（Skill 备份表）

每次覆盖操作前自动备份旧版本，支持一键回滚。

```sql
CREATE TABLE skill_backups (
    id            TEXT PRIMARY KEY,            -- UUID
    skill_id      TEXT NOT NULL,               -- 关联 skills.id
    version_label TEXT,                        -- 版本标签（如 v1.0.0、手动备份等）
    backup_path   TEXT NOT NULL,               -- 备份文件存放路径（在 ~/.skills-manager/backups/ 下）
    checksum      TEXT NOT NULL,               -- 备份内容的 SHA-256 校验和
    reason        TEXT NOT NULL
                  CHECK (reason IN ('before_update', 'before_overwrite', 'before_merge',
                                     'before_delete', 'manual', 'before_import')),
    metadata      TEXT,                        -- 额外元数据（JSON 格式）
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX idx_skill_backups_skill ON skill_backups(skill_id);
CREATE INDEX idx_skill_backups_created ON skill_backups(created_at DESC);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID 主键 |
| `skill_id` | TEXT | NOT NULL, FK | 关联 skills 表 |
| `version_label` | TEXT | | 版本标签 |
| `backup_path` | TEXT | NOT NULL | 备份文件路径 |
| `checksum` | TEXT | NOT NULL | 备份内容的 SHA-256 校验和 |
| `reason` | TEXT | CHECK | 备份原因：`before_update` / `before_overwrite` / `before_merge` / `before_delete` / `manual` / `before_import` |
| `metadata` | TEXT | | 额外元数据（JSON 格式） |
| `created_at` | DATETIME | DEFAULT now | 备份时间 |

---

### 3.6 sync_history（同步历史表）

记录每一次同步操作的详细信息，支持审计和排错。

```sql
CREATE TABLE sync_history (
    id            TEXT PRIMARY KEY,            -- UUID
    skill_id      TEXT NOT NULL,               -- 关联 skills.id
    deployment_id TEXT,                        -- 关联 skill_deployments.id（可为 NULL，如仅更新本地 Skill 库）
    action        TEXT NOT NULL
                  CHECK (action IN ('deploy', 'update', 'delete', 'overwrite',
                                     'merge', 'skip', 'export', 'import')),
    from_checksum TEXT,                        -- 操作前的校验和
    to_checksum   TEXT,                        -- 操作后的校验和
    status        TEXT NOT NULL DEFAULT 'success'
                  CHECK (status IN ('success', 'failed', 'skipped', 'conflict')),
    error_message TEXT,                        -- 失败时的错误信息
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    FOREIGN KEY (deployment_id) REFERENCES skill_deployments(id) ON DELETE SET NULL
);

CREATE INDEX idx_sync_history_skill ON sync_history(skill_id);
CREATE INDEX idx_sync_history_deployment ON sync_history(deployment_id);
CREATE INDEX idx_sync_history_created ON sync_history(created_at DESC);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID 主键 |
| `skill_id` | TEXT | NOT NULL, FK | 关联 skills 表 |
| `deployment_id` | TEXT | FK, NULLABLE | 关联 skill_deployments 表 |
| `action` | TEXT | CHECK | 操作类型：`deploy`（新部署）/ `update`（更新）/ `delete`（删除）/ `overwrite`（覆盖）/ `merge`（合并）/ `skip`（跳过）/ `export`（Git 导出）/ `import`（Git 导入） |
| `from_checksum` | TEXT | | 操作前的校验和 |
| `to_checksum` | TEXT | | 操作后的校验和 |
| `status` | TEXT | CHECK | 操作结果：`success` / `failed` / `skipped` / `conflict` |
| `error_message` | TEXT | | 失败时的错误信息 |
| `created_at` | DATETIME | DEFAULT now | 操作时间 |

---

### 3.7 change_events（变更事件表）

记录文件监听检测到的每一次变更事件及其处理结果。

```sql
CREATE TABLE change_events (
    id            TEXT PRIMARY KEY,            -- UUID
    deployment_id TEXT NOT NULL,               -- 关联 skill_deployments.id
    event_type    TEXT NOT NULL
                  CHECK (event_type IN ('modified', 'created', 'deleted', 'renamed')),
    old_checksum  TEXT,                        -- 变更前的校验和
    new_checksum  TEXT,                        -- 变更后的校验和
    resolution    TEXT
                  CHECK (resolution IN ('pending', 'lib_updated', 'redeployed',
                                         'ignored', 'conflict_resolved')),
    resolved_at   DATETIME,                    -- 处理完成时间
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (deployment_id) REFERENCES skill_deployments(id) ON DELETE CASCADE
);

CREATE INDEX idx_change_events_deployment ON change_events(deployment_id);
CREATE INDEX idx_change_events_resolution ON change_events(resolution);
CREATE INDEX idx_change_events_created ON change_events(created_at DESC);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID 主键 |
| `deployment_id` | TEXT | NOT NULL, FK | 关联 skill_deployments 表 |
| `event_type` | TEXT | CHECK | 变更类型：`modified` / `created` / `deleted` / `renamed` |
| `old_checksum` | TEXT | | 变更前的校验和 |
| `new_checksum` | TEXT | | 变更后的校验和 |
| `resolution` | TEXT | CHECK | 处理状态：`pending`（待处理）/ `lib_updated`（已更新本地 Skill 库）/ `redeployed`（已重新部署）/ `ignored`（已忽略）/ `conflict_resolved`（冲突已解决） |
| `resolved_at` | DATETIME | | 处理完成时间 |
| `created_at` | DATETIME | DEFAULT now | 事件发生时间 |

---

### 3.8 git_export_config（Git 导出配置表）

存储远程 Git 仓库的连接配置（用于扁平化导出备份）。

```sql
CREATE TABLE git_export_config (
    id          TEXT PRIMARY KEY,              -- UUID
    provider    TEXT NOT NULL
                CHECK (provider IN ('github', 'gitee')),
    remote_url  TEXT NOT NULL,                 -- 远程仓库地址
    auth_type   TEXT NOT NULL
                CHECK (auth_type IN ('ssh', 'token')),
    branch      TEXT NOT NULL DEFAULT 'main',  -- 导出分支
    auto_export TEXT NOT NULL DEFAULT 'manual'
                CHECK (auto_export IN ('manual', 'daily', 'on-change')),
    last_push_at  DATETIME,                    -- 最近一次推送时间
    last_pull_at  DATETIME,                    -- 最近一次拉取时间
    created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID 主键 |
| `provider` | TEXT | CHECK | Git 平台：`github` / `gitee` |
| `remote_url` | TEXT | NOT NULL | 远程仓库地址 |
| `auth_type` | TEXT | CHECK | 认证方式：`ssh` / `token` |
| `branch` | TEXT | DEFAULT 'main' | 导出分支 |
| `auto_export` | TEXT | CHECK | 自动导出策略：`manual`（手动）/ `daily`（每日）/ `on-change`（变更时） |
| `last_push_at` | DATETIME | | 最近一次推送时间 |
| `last_pull_at` | DATETIME | | 最近一次拉取时间 |
| `created_at` | DATETIME | DEFAULT now | 创建时间 |
| `updated_at` | DATETIME | DEFAULT now | 更新时间 |

> **注意**：Git 凭证（SSH Key、Token）不存储在数据库中，而是使用系统密钥链（macOS Keychain / Windows Credential Manager）加密存储。

---

### 3.9 app_settings（应用设置表）

```sql
CREATE TABLE app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO app_settings (key, value) VALUES
    ('skills_lib_path', '"~/.skills-manager/skills"'),
    ('update_check_interval', '"startup"'),
    ('theme', '"system"'),
    ('language', '"zh-CN"'),
    ('notification_enabled', 'true');
```

---

## 四、核心查询场景

### 4.1 项目管理查询

```sql
-- 获取所有项目列表及其 Skill 统计
SELECT p.id, p.name, p.path, p.status, p.last_scanned,
    COUNT(DISTINCT sd.skill_id) AS skill_count,
    COUNT(DISTINCT sd.tool) AS tool_count
FROM projects p
LEFT JOIN skill_deployments sd ON sd.project_id = p.id
GROUP BY p.id ORDER BY p.name;

-- 获取某个项目下的所有 Skill，按工具分组
SELECT s.name, s.description, s.version, sd.tool, sd.status, sd.checksum
FROM skill_deployments sd
JOIN skills s ON sd.skill_id = s.id
WHERE sd.project_id = ?
ORDER BY sd.tool, s.name;
```

### 4.2 多维度视图查询

```sql
-- 按工具分组视图
SELECT s.name, s.description, s.version, sd.path, sd.status,
    CASE WHEN sd.project_id IS NULL THEN '全局' ELSE p.name END AS location
FROM skill_deployments sd
JOIN skills s ON sd.skill_id = s.id
LEFT JOIN projects p ON sd.project_id = p.id
WHERE sd.tool = ?
ORDER BY s.name;

-- 全局汇总视图
SELECT s.id, s.name, s.description, s.version, ss.source_type,
    GROUP_CONCAT(DISTINCT sd.tool) AS tools,
    GROUP_CONCAT(DISTINCT COALESCE(p.name, '全局')) AS projects,
    COUNT(sd.id) AS deployment_count,
    SUM(CASE WHEN sd.status = 'diverged' THEN 1 ELSE 0 END) AS diverged_count
FROM skills s
LEFT JOIN skill_deployments sd ON sd.skill_id = s.id
LEFT JOIN projects p ON sd.project_id = p.id
LEFT JOIN skill_sources ss ON ss.skill_id = s.id
GROUP BY s.id ORDER BY s.name;

-- 仅全局部署视图
SELECT s.name, s.description, sd.tool, sd.status, sd.path
FROM skill_deployments sd
JOIN skills s ON sd.skill_id = s.id
WHERE sd.project_id IS NULL
ORDER BY sd.tool, s.name;
```

### 4.3 一致性检查查询

```sql
-- 检测所有与本地 Skill 库不一致的部署
SELECT s.name, sd.tool, sd.path,
    sd.checksum AS deploy_checksum,
    s.checksum AS lib_checksum,
    sd.status, p.name AS project_name
FROM skill_deployments sd
JOIN skills s ON sd.skill_id = s.id
LEFT JOIN projects p ON sd.project_id = p.id
WHERE sd.checksum != s.checksum OR sd.checksum IS NULL;

-- 检测同一 Skill 在不同位置是否存在不同版本
SELECT s.name,
    COUNT(DISTINCT sd.checksum) AS version_count,
    GROUP_CONCAT(DISTINCT sd.tool || '@' || COALESCE(p.name, '全局')) AS locations
FROM skill_deployments sd
JOIN skills s ON sd.skill_id = s.id
LEFT JOIN projects p ON sd.project_id = p.id
GROUP BY s.id
HAVING COUNT(DISTINCT sd.checksum) > 1;

-- 获取所有待处理的变更事件
SELECT s.name, sd.tool, p.name AS project_name,
    ce.event_type, ce.old_checksum, ce.new_checksum, ce.created_at
FROM change_events ce
JOIN skill_deployments sd ON ce.deployment_id = sd.id
JOIN skills s ON sd.skill_id = s.id
LEFT JOIN projects p ON sd.project_id = p.id
WHERE ce.resolution = 'pending'
ORDER BY ce.created_at DESC;
```

### 4.4 部署与同步查询

```sql
-- 获取某个 Skill 的所有部署位置（同步目标列表）
SELECT sd.id, sd.tool, sd.path, sd.checksum, sd.status,
    COALESCE(p.name, '全局') AS location,
    CASE WHEN sd.checksum = s.checksum THEN '一致' ELSE '不一致' END AS sync_status
FROM skill_deployments sd
JOIN skills s ON sd.skill_id = s.id
LEFT JOIN projects p ON sd.project_id = p.id
WHERE s.name = ?
ORDER BY p.name, sd.tool;

-- 获取最近操作历史
SELECT sh.action, sh.status, sh.from_checksum, sh.to_checksum,
    sh.error_message, sh.created_at, s.name AS skill_name,
    sd.tool, COALESCE(p.name, '全局') AS project_name
FROM sync_history sh
JOIN skills s ON sh.skill_id = s.id
LEFT JOIN skill_deployments sd ON sh.deployment_id = sd.id
LEFT JOIN projects p ON sd.project_id = p.id
ORDER BY sh.created_at DESC LIMIT 50;
```

### 4.5 更新检测查询

```sql
-- 获取所有从 skills.sh 安装的 Skill（用于检查远程更新）
SELECT s.id, s.name, s.version, ss.url, ss.installed_version, ss.original_checksum,
    CASE WHEN s.checksum != ss.original_checksum THEN 1 ELSE 0 END AS locally_modified
FROM skills s
JOIN skill_sources ss ON ss.skill_id = s.id
WHERE ss.source_type = 'skills-sh';

-- 获取所有从 Git 仓库导入的 Skill
SELECT s.id, s.name, ss.url AS repo_url, ss.installed_version, s.checksum
FROM skills s
JOIN skill_sources ss ON ss.skill_id = s.id
WHERE ss.source_type IN ('github', 'gitee');
```

### 4.6 Git 导出 README 生成查询

```sql
-- Skill 清单总表（用于自动生成 README.md）
SELECT s.name, ss.source_type AS source, s.version,
    GROUP_CONCAT(DISTINCT COALESCE(p.name, '全局')) AS projects,
    GROUP_CONCAT(DISTINCT sd.tool) AS tools
FROM skills s
LEFT JOIN skill_deployments sd ON sd.skill_id = s.id
LEFT JOIN projects p ON sd.project_id = p.id
LEFT JOIN skill_sources ss ON ss.skill_id = s.id
GROUP BY s.id ORDER BY s.name;
```

---

## 五、数据库初始化与迁移

### 5.1 初始化脚本

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    description TEXT
);

INSERT INTO schema_version (version, description)
VALUES (1, '初始数据库结构 - 数据库驱动架构');
```

### 5.2 版本迁移策略

```typescript
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: '初始数据库结构',
    up: `
      -- 创建所有基础表（projects, skills, skill_sources,
      --   skill_deployments, skill_backups, sync_history,
      --   change_events, git_export_config, app_settings）
    `,
  },
];
```

---

## 六、性能优化策略

### 6.1 索引设计

| 索引 | 覆盖表 | 用途 |
|------|--------|------|
| `idx_skills_name` | skills | 按名称快速查找 Skill |
| `idx_skill_deployments_unique` | skill_deployments | 确保唯一性（Skill+项目+工具） |
| `idx_skill_deployments_skill` | skill_deployments | 按 Skill 查找所有部署位置 |
| `idx_skill_deployments_project` | skill_deployments | 按项目查找所有 Skill |
| `idx_skill_deployments_tool` | skill_deployments | 按工具查找所有 Skill |
| `idx_skill_deployments_status` | skill_deployments | 快速筛选有偏差的部署 |
| `idx_sync_history_created` | sync_history | 按时间倒序查询操作历史 |
| `idx_change_events_resolution` | change_events | 快速筛选待处理的变更事件 |

### 6.2 查询优化建议

- **批量操作使用事务**：同步部署到多个位置时，使用 `BEGIN...COMMIT` 包裹
- **预编译语句**：一致性检查中的 checksum 对比使用 `db.prepare()` 预编译
- **定期清理**：`sync_history` 和 `change_events` 保留最近 90 天
- **WAL checkpoint**：定期执行 `PRAGMA wal_checkpoint(TRUNCATE)`

---

## 七、数据完整性保障

### 7.1 外键级联规则

| 父表 | 子表 | 删除行为 | 说明 |
|------|------|----------|------|
| `skills` | `skill_deployments` | CASCADE | 删除 Skill 时自动删除所有部署记录 |
| `skills` | `skill_sources` | CASCADE | 删除 Skill 时自动删除来源记录 |
| `skills` | `skill_backups` | CASCADE | 删除 Skill 时自动删除备份记录 |
| `skills` | `sync_history` | CASCADE | 删除 Skill 时自动删除操作历史 |
| `projects` | `skill_deployments` | SET NULL | 删除项目时部署的 project_id 置 NULL |
| `skill_deployments` | `change_events` | CASCADE | 删除部署时自动删除变更事件 |
| `skill_deployments` | `sync_history` | SET NULL | 删除部署时操作历史的 deployment_id 置 NULL |

### 7.2 事务使用规范

| 操作 | 涉及表 | 说明 |
|------|--------|------|
| 安装 Skill | skills, skill_sources, skill_deployments | 写入 Skill 信息 + 来源 + 部署记录 |
| 删除 Skill | skills（级联） | 级联删除所有关联数据 |
| 部署到新位置 | skill_deployments, sync_history | 创建部署记录 + 拷贝文件 + 写入历史 |
| 同步所有部署 | skill_deployments, sync_history | 批量更新部署 checksum + 写入历史 |
| 导入项目 | projects, skill_deployments | 创建项目 + 批量创建部署记录 |
| 一致性修正 | skill_deployments, change_events | 更新部署状态 + 记录变更事件 |

---

## 八、与 PRD 功能模块的对应关系

| PRD 功能模块 | 主要涉及的表 | 说明 |
|-------------|------------|------|
| 3.1 项目管理 | projects, skill_deployments | 项目导入、扫描、仪表盘 |
| 3.2 Skill 浏览与管理 | skills, skill_deployments, skill_sources | 多维度视图、详情查看 |
| 3.3 Skill 仓库（skills.sh） | skills, skill_sources, skill_deployments | 安装、冲突检测 |
| 3.4 Git 仓库集成 | git_export_config, sync_history | 扁平化导出、导入恢复 |
| 3.5 Skill 统一管理 | skills, skill_deployments, skill_backups | 部署管理、一致性检查、备份回滚 |
| 3.6 变更检测与同步 | change_events, skill_deployments, sync_history | 文件监听、同步操作 |
| 3.7 更新管理 | skills, skill_sources, skill_backups | 版本检测、更新策略 |
