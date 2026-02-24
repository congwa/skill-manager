use rusqlite::{Connection, Result};

struct Migration {
    version: i32,
    name: &'static str,
    up: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial_schema",
        up: "
            CREATE TABLE IF NOT EXISTS projects (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                path        TEXT NOT NULL UNIQUE,
                status      TEXT NOT NULL DEFAULT 'unsynced'
                            CHECK (status IN ('synced', 'changed', 'unsynced')),
                last_scanned DATETIME,
                created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
            CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

            CREATE TABLE IF NOT EXISTS skills (
                id            TEXT PRIMARY KEY,
                name          TEXT NOT NULL UNIQUE,
                description   TEXT,
                version       TEXT,
                checksum      TEXT,
                local_path    TEXT,
                last_modified DATETIME,
                created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

            CREATE TABLE IF NOT EXISTS skill_sources (
                id                TEXT PRIMARY KEY,
                skill_id          TEXT NOT NULL UNIQUE,
                source_type       TEXT NOT NULL
                                  CHECK (source_type IN ('local', 'skills-sh', 'github', 'gitee')),
                url               TEXT,
                installed_version TEXT,
                original_checksum TEXT,
                created_at        DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at        DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_skill_sources_type ON skill_sources(source_type);

            CREATE TABLE IF NOT EXISTS skill_deployments (
                id          TEXT PRIMARY KEY,
                skill_id    TEXT NOT NULL,
                project_id  TEXT,
                tool        TEXT NOT NULL
                            CHECK (tool IN ('windsurf', 'cursor', 'claude-code', 'codex', 'trae')),
                path        TEXT NOT NULL UNIQUE,
                checksum    TEXT,
                status      TEXT NOT NULL DEFAULT 'synced'
                            CHECK (status IN ('synced', 'diverged', 'missing', 'untracked')),
                last_synced DATETIME,
                created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at  DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_deployments_unique
                ON skill_deployments(skill_id, COALESCE(project_id, '__global__'), tool);
            CREATE INDEX IF NOT EXISTS idx_skill_deployments_skill ON skill_deployments(skill_id);
            CREATE INDEX IF NOT EXISTS idx_skill_deployments_project ON skill_deployments(project_id);
            CREATE INDEX IF NOT EXISTS idx_skill_deployments_tool ON skill_deployments(tool);
            CREATE INDEX IF NOT EXISTS idx_skill_deployments_status ON skill_deployments(status);

            CREATE TABLE IF NOT EXISTS skill_backups (
                id            TEXT PRIMARY KEY,
                skill_id      TEXT NOT NULL,
                version_label TEXT,
                backup_path   TEXT NOT NULL,
                checksum      TEXT NOT NULL,
                reason        TEXT NOT NULL
                              CHECK (reason IN ('before_update', 'before_overwrite', 'before_merge',
                                                 'before_delete', 'manual', 'before_import')),
                metadata      TEXT,
                created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_skill_backups_skill ON skill_backups(skill_id);
            CREATE INDEX IF NOT EXISTS idx_skill_backups_created ON skill_backups(created_at DESC);

            CREATE TABLE IF NOT EXISTS sync_history (
                id            TEXT PRIMARY KEY,
                skill_id      TEXT NOT NULL,
                deployment_id TEXT,
                action        TEXT NOT NULL
                              CHECK (action IN ('deploy', 'update', 'delete', 'overwrite',
                                                 'merge', 'skip', 'export', 'import')),
                from_checksum TEXT,
                to_checksum   TEXT,
                status        TEXT NOT NULL DEFAULT 'success'
                              CHECK (status IN ('success', 'failed', 'skipped', 'conflict')),
                error_message TEXT,
                created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
                FOREIGN KEY (deployment_id) REFERENCES skill_deployments(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sync_history_skill ON sync_history(skill_id);
            CREATE INDEX IF NOT EXISTS idx_sync_history_deployment ON sync_history(deployment_id);
            CREATE INDEX IF NOT EXISTS idx_sync_history_created ON sync_history(created_at DESC);

            CREATE TABLE IF NOT EXISTS change_events (
                id            TEXT PRIMARY KEY,
                deployment_id TEXT NOT NULL,
                event_type    TEXT NOT NULL
                              CHECK (event_type IN ('modified', 'created', 'deleted', 'renamed')),
                old_checksum  TEXT,
                new_checksum  TEXT,
                resolution    TEXT DEFAULT 'pending'
                              CHECK (resolution IN ('pending', 'lib_updated', 'redeployed',
                                                     'ignored', 'conflict_resolved')),
                resolved_at   DATETIME,
                created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (deployment_id) REFERENCES skill_deployments(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_change_events_deployment ON change_events(deployment_id);
            CREATE INDEX IF NOT EXISTS idx_change_events_resolution ON change_events(resolution);
            CREATE INDEX IF NOT EXISTS idx_change_events_created ON change_events(created_at DESC);

            CREATE TABLE IF NOT EXISTS git_export_config (
                id          TEXT PRIMARY KEY,
                provider    TEXT NOT NULL
                            CHECK (provider IN ('github', 'gitee')),
                remote_url  TEXT NOT NULL,
                auth_type   TEXT NOT NULL
                            CHECK (auth_type IN ('ssh', 'token')),
                branch      TEXT NOT NULL DEFAULT 'main',
                auto_export TEXT NOT NULL DEFAULT 'manual'
                            CHECK (auto_export IN ('manual', 'daily', 'on-change')),
                last_push_at  DATETIME,
                last_pull_at  DATETIME,
                created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key         TEXT PRIMARY KEY,
                value       TEXT,
                updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
            );

            INSERT OR IGNORE INTO app_settings (key, value) VALUES
                ('skills_lib_path', '\"~/.skills-manager/skills\"'),
                ('update_check_interval', '\"startup\"'),
                ('theme', '\"system\"'),
                ('language', '\"zh-CN\"'),
                ('notification_enabled', 'true'),
                ('onboarding_completed', 'false');
        ",
    },
    Migration {
        version: 2,
        name: "add_remote_sha_to_skill_sources",
        up: "
            ALTER TABLE skill_sources ADD COLUMN IF NOT EXISTS remote_sha TEXT;
            ALTER TABLE skill_sources ADD COLUMN IF NOT EXISTS skill_path TEXT;
        ",
    },
    Migration {
        version: 3,
        name: "add_skill_files_table",
        up: "
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
        ",
    },
    Migration {
        version: 4,
        name: "remove_tool_check_constraint",
        up: "
            -- SQLite 不支持 ALTER TABLE DROP CONSTRAINT，需重建表以移除 tool 的 CHECK 约束，
            -- 使 skill_deployments 支持任意 agent ID（不再限定为固定五个工具）
            PRAGMA foreign_keys = OFF;

            CREATE TABLE IF NOT EXISTS skill_deployments_new (
                id          TEXT PRIMARY KEY,
                skill_id    TEXT NOT NULL,
                project_id  TEXT,
                tool        TEXT NOT NULL,
                path        TEXT NOT NULL UNIQUE,
                checksum    TEXT,
                status      TEXT NOT NULL DEFAULT 'synced'
                            CHECK (status IN ('synced', 'diverged', 'missing', 'untracked')),
                last_synced DATETIME,
                created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at  DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
            );

            INSERT INTO skill_deployments_new
                SELECT id, skill_id, project_id, tool, path, checksum,
                       status, last_synced, created_at, updated_at
                FROM skill_deployments;

            DROP TABLE skill_deployments;
            ALTER TABLE skill_deployments_new RENAME TO skill_deployments;

            CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_deployments_unique
                ON skill_deployments(skill_id, COALESCE(project_id, '__global__'), tool);
            CREATE INDEX IF NOT EXISTS idx_skill_deployments_skill   ON skill_deployments(skill_id);
            CREATE INDEX IF NOT EXISTS idx_skill_deployments_project ON skill_deployments(project_id);
            CREATE INDEX IF NOT EXISTS idx_skill_deployments_tool    ON skill_deployments(tool);
            CREATE INDEX IF NOT EXISTS idx_skill_deployments_status  ON skill_deployments(status);

            PRAGMA foreign_keys = ON;
        ",
    },
    Migration {
        version: 5,
        name: "git_export_config_unique_remote_url",
        up: "
            -- 先删除重复记录（每个 remote_url 只保留 id 字典序最小的那条）
            DELETE FROM git_export_config
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM git_export_config
                GROUP BY remote_url
            );

            -- 重建表，添加 remote_url UNIQUE 约束
            CREATE TABLE IF NOT EXISTS git_export_config_new (
                id          TEXT PRIMARY KEY,
                provider    TEXT NOT NULL
                            CHECK (provider IN ('github', 'gitee')),
                remote_url  TEXT NOT NULL UNIQUE,
                auth_type   TEXT NOT NULL
                            CHECK (auth_type IN ('ssh', 'token')),
                branch      TEXT NOT NULL DEFAULT 'main',
                auto_export TEXT NOT NULL DEFAULT 'manual'
                            CHECK (auto_export IN ('manual', 'daily', 'on-change')),
                last_push_at  DATETIME,
                last_pull_at  DATETIME,
                created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
            );

            INSERT INTO git_export_config_new
                SELECT id, provider, remote_url, auth_type, branch, auto_export,
                       last_push_at, last_pull_at, created_at, updated_at
                FROM git_export_config;

            DROP TABLE git_export_config;
            ALTER TABLE git_export_config_new RENAME TO git_export_config;
        ",
    },
];

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version     INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            applied_at  DATETIME NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    for migration in MIGRATIONS {
        if migration.version > current_version {
            log::info!(
                "Running migration {}: {}",
                migration.version,
                migration.name
            );

            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(migration.up)?;
            tx.execute(
                "INSERT INTO schema_version (version, name) VALUES (?1, ?2)",
                rusqlite::params![migration.version, migration.name],
            )?;
            tx.commit()?;
        }
    }

    Ok(())
}
