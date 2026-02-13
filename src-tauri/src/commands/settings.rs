use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{AppSetting, GitExportConfig, ChangeEvent, SyncHistoryEntry};

// ── App Settings ──

#[tauri::command]
pub async fn get_all_settings(pool: State<'_, DbPool>) -> Result<Vec<AppSetting>, AppError> {
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
    let conn = pool.get()?;

    let query = if let Some(ref status) = status_filter {
        format!(
            "SELECT id, deployment_id, event_type, old_checksum, new_checksum,
                    resolution, resolved_at, created_at
             FROM change_events WHERE resolution = '{}'
             ORDER BY created_at DESC",
            match status.as_str() {
                "pending" | "lib_updated" | "redeployed" | "ignored" | "conflict_resolved" => status.as_str(),
                _ => "pending",
            }
        )
    } else {
        "SELECT id, deployment_id, event_type, old_checksum, new_checksum,
                resolution, resolved_at, created_at
         FROM change_events ORDER BY created_at DESC".to_string()
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
        })
    })?.collect::<Result<Vec<_>, _>>()?;

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
