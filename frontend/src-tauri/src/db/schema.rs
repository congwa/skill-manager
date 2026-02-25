use rusqlite::{Connection, Result};
use log::info;

/// 初始化所有表结构。
/// 全部使用 CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS，
/// 每次启动幂等执行，无需版本追踪，无迁移状态可破坏。
pub fn init_schema(conn: &Connection) -> Result<()> {
    info!("[schema] 初始化数据库表结构...");

    conn.execute_batch("
        -- ── 项目表 ──
        CREATE TABLE IF NOT EXISTS projects (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            path         TEXT NOT NULL UNIQUE,
            status       TEXT NOT NULL DEFAULT 'unsynced',
            last_scanned DATETIME,
            created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
            updated_at   DATETIME NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
        CREATE INDEX IF NOT EXISTS idx_projects_name   ON projects(name);

        -- ── Skill 表 ──
        CREATE TABLE IF NOT EXISTS skills (
            id                     TEXT PRIMARY KEY,
            name                   TEXT NOT NULL UNIQUE,
            description            TEXT,
            version                TEXT,
            checksum               TEXT,
            last_modified          DATETIME,
            created_at             DATETIME NOT NULL DEFAULT (datetime('now')),
            updated_at             DATETIME NOT NULL DEFAULT (datetime('now')),
            watcher_modified_at    DATETIME,
            watcher_backup_id      TEXT,
            watcher_trigger_dep_id TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

        -- ── Skill 来源表 ──
        CREATE TABLE IF NOT EXISTS skill_sources (
            id                TEXT PRIMARY KEY,
            skill_id          TEXT NOT NULL UNIQUE,
            source_type       TEXT NOT NULL,
            url               TEXT,
            remote_sha        TEXT,
            skill_path        TEXT,
            installed_version TEXT,
            original_checksum TEXT,
            created_at        DATETIME NOT NULL DEFAULT (datetime('now')),
            updated_at        DATETIME NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_skill_sources_type ON skill_sources(source_type);

        -- ── Skill 部署表（无 CHECK 约束，支持任意工具 ID）──
        CREATE TABLE IF NOT EXISTS skill_deployments (
            id          TEXT PRIMARY KEY,
            skill_id    TEXT NOT NULL,
            project_id  TEXT,
            tool        TEXT NOT NULL,
            path        TEXT NOT NULL UNIQUE,
            checksum    TEXT,
            status      TEXT NOT NULL DEFAULT 'synced',
            last_synced DATETIME,
            created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
            updated_at  DATETIME NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (skill_id)   REFERENCES skills(id)   ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_deployments_unique
            ON skill_deployments(skill_id, COALESCE(project_id, '__global__'), tool);
        CREATE INDEX IF NOT EXISTS idx_skill_deployments_skill   ON skill_deployments(skill_id);
        CREATE INDEX IF NOT EXISTS idx_skill_deployments_project ON skill_deployments(project_id);
        CREATE INDEX IF NOT EXISTS idx_skill_deployments_tool    ON skill_deployments(tool);
        CREATE INDEX IF NOT EXISTS idx_skill_deployments_status  ON skill_deployments(status);

        -- ── Skill 文件表（DB 内容存储）──
        CREATE TABLE IF NOT EXISTS skill_files (
            id            TEXT PRIMARY KEY,
            skill_id      TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL,
            content       BLOB NOT NULL,
            size_bytes    INTEGER,
            updated_at    DATETIME NOT NULL DEFAULT (datetime('now')),
            UNIQUE(skill_id, relative_path)
        );
        CREATE INDEX IF NOT EXISTS idx_skill_files_skill_id ON skill_files(skill_id);

        -- ── Skill 备份表 ──
        CREATE TABLE IF NOT EXISTS skill_backups (
            id            TEXT PRIMARY KEY,
            skill_id      TEXT NOT NULL,
            version_label TEXT,
            backup_path   TEXT NOT NULL,
            checksum      TEXT NOT NULL,
            reason        TEXT NOT NULL,
            metadata      TEXT,
            created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_skill_backups_skill   ON skill_backups(skill_id);
        CREATE INDEX IF NOT EXISTS idx_skill_backups_created ON skill_backups(created_at DESC);

        -- ── 同步历史表 ──
        CREATE TABLE IF NOT EXISTS sync_history (
            id            TEXT PRIMARY KEY,
            skill_id      TEXT NOT NULL,
            deployment_id TEXT,
            action        TEXT NOT NULL,
            from_checksum TEXT,
            to_checksum   TEXT,
            status        TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (skill_id)      REFERENCES skills(id)           ON DELETE CASCADE,
            FOREIGN KEY (deployment_id) REFERENCES skill_deployments(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sync_history_skill      ON sync_history(skill_id);
        CREATE INDEX IF NOT EXISTS idx_sync_history_deployment ON sync_history(deployment_id);
        CREATE INDEX IF NOT EXISTS idx_sync_history_created    ON sync_history(created_at DESC);

        -- ── 变更事件表 ──
        CREATE TABLE IF NOT EXISTS change_events (
            id            TEXT PRIMARY KEY,
            deployment_id TEXT NOT NULL,
            event_type    TEXT NOT NULL,
            old_checksum  TEXT,
            new_checksum  TEXT,
            resolution    TEXT DEFAULT 'pending',
            resolved_at   DATETIME,
            created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (deployment_id) REFERENCES skill_deployments(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_change_events_deployment ON change_events(deployment_id);
        CREATE INDEX IF NOT EXISTS idx_change_events_resolution ON change_events(resolution);
        CREATE INDEX IF NOT EXISTS idx_change_events_created    ON change_events(created_at DESC);

        -- ── Git 导出配置表 ──
        CREATE TABLE IF NOT EXISTS git_export_config (
            id           TEXT PRIMARY KEY,
            provider     TEXT NOT NULL,
            remote_url   TEXT NOT NULL UNIQUE,
            auth_type    TEXT NOT NULL,
            branch       TEXT NOT NULL DEFAULT 'main',
            auto_export  TEXT NOT NULL DEFAULT 'manual',
            last_push_at DATETIME,
            last_pull_at DATETIME,
            created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
            updated_at   DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        -- ── Catalog 安装量缓存表（TTL 7天）──
        CREATE TABLE IF NOT EXISTS catalog_installs_cache (
            skill_name TEXT PRIMARY KEY,
            installs   INTEGER NOT NULL,
            fetched_at INTEGER NOT NULL
        );

        -- ── 应用设置表 ──
        CREATE TABLE IF NOT EXISTS app_settings (
            key        TEXT PRIMARY KEY,
            value      TEXT,
            updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        -- 写入默认设置（已存在则忽略）
        INSERT OR IGNORE INTO app_settings (key, value) VALUES
            ('onboarding_completed', 'false'),
            ('theme',                'system'),
            ('language',             'zh-CN'),
            ('startup_page',         'projects'),
            ('notifications_enabled','true'),
            ('file_watch_enabled',   'true'),
            ('auto_export_frequency','manual');
    ")?;

    // 对已有数据库幂等补列（失败则忽略，列已存在时 SQLite 会报错）
    let _ = conn.execute("ALTER TABLE skills ADD COLUMN watcher_modified_at DATETIME", []);
    let _ = conn.execute("ALTER TABLE skills ADD COLUMN watcher_backup_id TEXT", []);
    let _ = conn.execute("ALTER TABLE skills ADD COLUMN watcher_trigger_dep_id TEXT", []);

    info!("[schema] 数据库表结构初始化完成");
    Ok(())
}
