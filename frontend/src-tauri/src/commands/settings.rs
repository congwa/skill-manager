use log::info;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{AppSetting, GitExportConfig, ChangeEvent, SyncHistoryEntry};

// ── App Settings ──

#[tauri::command]
pub async fn get_all_settings(pool: State<'_, DbPool>) -> Result<Vec<AppSetting>, AppError> {
    info!("[get_all_settings] 查询所有设置");
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT key, value, updated_at FROM app_settings ORDER BY key"
    )?;

    let settings = stmt.query_map([], |row| {
        Ok(AppSetting {
            key: row.get(0)?,
            value: row.get(1)?,
            updated_at: row.get(2)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(settings)
}

#[tauri::command]
pub async fn get_setting(key: String, pool: State<'_, DbPool>) -> Result<Option<String>, AppError> {
    info!("[get_setting] 查询设置: {}", key);
    let conn = pool.get()?;
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok();

    Ok(value)
}

#[tauri::command]
pub async fn set_setting(
    key: String,
    value: String,
    pool: State<'_, DbPool>,
) -> Result<(), AppError> {
    info!("[set_setting] 设置: {} = {}", key, value);
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')",
        params![key, value],
    )?;
    Ok(())
}

// ── Git Export Config ──

#[tauri::command]
pub async fn get_git_export_configs(
    pool: State<'_, DbPool>,
) -> Result<Vec<GitExportConfig>, AppError> {
    info!("[get_git_export_configs] 查询 Git 导出配置");
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, provider, remote_url, auth_type, branch, auto_export,
                last_push_at, last_pull_at, created_at, updated_at
         FROM git_export_config ORDER BY provider"
    )?;

    let configs = stmt.query_map([], |row| {
        Ok(GitExportConfig {
            id: row.get(0)?,
            provider: row.get(1)?,
            remote_url: row.get(2)?,
            auth_type: row.get(3)?,
            branch: row.get(4)?,
            auto_export: row.get(5)?,
            last_push_at: row.get(6)?,
            last_pull_at: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(configs)
}

#[tauri::command]
pub async fn save_git_export_config(
    provider: String,
    remote_url: String,
    auth_type: String,
    branch: String,
    auto_export: String,
    pool: State<'_, DbPool>,
) -> Result<GitExportConfig, AppError> {
    info!("[save_git_export_config] 保存 Git 配置: provider={}, url={}", provider, remote_url);
    let conn = pool.get()?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO git_export_config (id, provider, remote_url, auth_type, branch, auto_export)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, provider, remote_url, auth_type, branch, auto_export],
    )?;

    let config = conn.query_row(
        "SELECT id, provider, remote_url, auth_type, branch, auto_export,
                last_push_at, last_pull_at, created_at, updated_at
         FROM git_export_config WHERE id = ?1",
        params![id],
        |row| Ok(GitExportConfig {
            id: row.get(0)?,
            provider: row.get(1)?,
            remote_url: row.get(2)?,
            auth_type: row.get(3)?,
            branch: row.get(4)?,
            auto_export: row.get(5)?,
            last_push_at: row.get(6)?,
            last_pull_at: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        }),
    )?;

    Ok(config)
}

#[tauri::command]
pub async fn delete_git_export_config(
    config_id: String,
    pool: State<'_, DbPool>,
) -> Result<(), AppError> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM git_export_config WHERE id = ?1", params![config_id])?;
    Ok(())
}

// ── Change Events ──

#[tauri::command]
pub async fn get_change_events(
    status_filter: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<ChangeEvent>, AppError> {
    info!("[get_change_events] status_filter={:?}", status_filter);
    let conn = pool.get()?;

    let base_query = "SELECT ce.id, ce.deployment_id, ce.event_type, ce.old_checksum, ce.new_checksum,
                ce.resolution, ce.resolved_at, ce.created_at,
                s.name as skill_name, p.name as project_name, d.tool, d.path
         FROM change_events ce
         LEFT JOIN skill_deployments d ON d.id = ce.deployment_id
         LEFT JOIN skills s ON s.id = d.skill_id
         LEFT JOIN projects p ON p.id = d.project_id";

    let query = if let Some(ref status) = status_filter {
        let safe_status = match status.as_str() {
            "pending" | "lib_updated" | "redeployed" | "ignored" | "conflict_resolved" => status.as_str(),
            _ => "pending",
        };
        format!("{} WHERE ce.resolution = '{}' ORDER BY ce.created_at DESC", base_query, safe_status)
    } else {
        format!("{} ORDER BY ce.created_at DESC", base_query)
    };

    let mut stmt = conn.prepare(&query)?;

    let events = stmt.query_map([], |row| {
        Ok(ChangeEvent {
            id: row.get(0)?,
            deployment_id: row.get(1)?,
            event_type: row.get(2)?,
            old_checksum: row.get(3)?,
            new_checksum: row.get(4)?,
            resolution: row.get(5)?,
            resolved_at: row.get(6)?,
            created_at: row.get(7)?,
            skill_name: row.get(8)?,
            project_name: row.get(9)?,
            tool: row.get(10)?,
            deploy_path: row.get(11)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    info!("[get_change_events] 返回 {} 条变更事件", events.len());
    Ok(events)
}

#[tauri::command]
pub async fn resolve_change_event(
    event_id: String,
    resolution: String,
    pool: State<'_, DbPool>,
) -> Result<(), AppError> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE change_events SET resolution = ?1, resolved_at = datetime('now')
         WHERE id = ?2",
        params![resolution, event_id],
    )?;
    Ok(())
}

// ── Sync History ──

#[tauri::command]
pub async fn get_sync_history(
    limit: Option<i64>,
    pool: State<'_, DbPool>,
) -> Result<Vec<SyncHistoryEntry>, AppError> {
    let limit = limit.unwrap_or(50);
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, skill_id, deployment_id, action, from_checksum, to_checksum,
                status, error_message, created_at
         FROM sync_history ORDER BY created_at DESC LIMIT ?1"
    )?;

    let history = stmt.query_map(params![limit], |row| {
        Ok(SyncHistoryEntry {
            id: row.get(0)?,
            skill_id: row.get(1)?,
            deployment_id: row.get(2)?,
            action: row.get(3)?,
            from_checksum: row.get(4)?,
            to_checksum: row.get(5)?,
            status: row.get(6)?,
            error_message: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(history)
}

// ── App Initialization ──

#[derive(serde::Serialize)]
pub struct AppInitStatus {
    pub initialized: bool,
    pub db_path: String,
    pub skills_lib_path: String,
    pub backups_path: String,
    pub db_exists: bool,
    pub skills_dir_exists: bool,
    pub project_count: i64,
    pub skill_count: i64,
}

#[tauri::command]
pub async fn get_app_init_status(pool: State<'_, DbPool>) -> Result<AppInitStatus, AppError> {
    info!("[get_app_init_status] 检查应用初始化状态");
    let home = dirs::home_dir().expect("Cannot find home directory");
    let base = home.join(".skills-manager");
    let db_path = base.join("db").join("skills.db");
    let skills_lib = base.join("skills");
    let backups = base.join("backups");

    let conn = pool.get()?;

    let project_count: i64 = conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?;
    let skill_count: i64 = conn.query_row("SELECT COUNT(*) FROM skills", [], |r| r.get(0))?;

    let initialized_val: Option<String> = conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'initialized'",
        [],
        |r| r.get(0),
    ).unwrap_or(None);

    Ok(AppInitStatus {
        initialized: initialized_val.as_deref() == Some("true"),
        db_path: db_path.to_string_lossy().to_string(),
        skills_lib_path: skills_lib.to_string_lossy().to_string(),
        backups_path: backups.to_string_lossy().to_string(),
        db_exists: db_path.exists(),
        skills_dir_exists: skills_lib.exists(),
        project_count,
        skill_count,
    })
}

#[tauri::command]
pub async fn initialize_app(
    skills_lib_path: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<AppInitStatus, AppError> {
    info!("[initialize_app] 开始初始化应用, skills_lib_path: {:?}", skills_lib_path);
    let home = dirs::home_dir().expect("Cannot find home directory");
    let base = home.join(".skills-manager");

    let skills_lib = if let Some(ref p) = skills_lib_path {
        std::path::PathBuf::from(p)
    } else {
        base.join("skills")
    };
    let backups = base.join("backups");

    // 创建必要目录
    std::fs::create_dir_all(&skills_lib)?;
    std::fs::create_dir_all(&backups)?;
    std::fs::create_dir_all(base.join("db"))?;

    {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;

        let skills_lib_str = skills_lib.to_string_lossy().to_string();
        let backups_str = backups.to_string_lossy().to_string();
        let defaults: Vec<(&str, &str)> = vec![
            ("initialized", "true"),
            ("theme", "system"),
            ("language", "zh-CN"),
            ("startup_page", "projects"),
            ("notifications_enabled", "true"),
            ("file_watch_enabled", "true"),
            ("auto_export_frequency", "manual"),
            ("update_check_frequency", "daily"),
            ("auto_update", "false"),
            ("skills_lib_path", &skills_lib_str),
            ("backups_path", &backups_str),
            ("onboarding_completed", "false"),
        ];

        for (key, value) in &defaults {
            tx.execute(
                "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            )?;
        }

        tx.commit()?;
    }

    info!("[initialize_app] 初始化完成，获取状态...");
    get_app_init_status(pool).await
}

#[tauri::command]
pub async fn reset_app(pool: State<'_, DbPool>) -> Result<(), AppError> {
    info!("[reset_app] 重置应用数据");
    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;

    tx.execute_batch(
        "DELETE FROM sync_history;
         DELETE FROM change_events;
         DELETE FROM skill_backups;
         DELETE FROM skill_deployments;
         DELETE FROM skill_sources;
         DELETE FROM skills;
         DELETE FROM projects;
         DELETE FROM git_export_config;
         DELETE FROM app_settings;
         DELETE FROM schema_version;"
    )?;

    tx.commit()?;
    Ok(())
}
