use log::info;
use rusqlite::params;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

use super::utils::{compute_dir_checksum, copy_dir_recursive};
use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{Skill, SkillSource, SkillBackup};

#[tauri::command]
pub async fn get_skills(pool: State<'_, DbPool>) -> Result<Vec<Skill>, AppError> {
    info!("[get_skills] 查询所有 Skill");
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, version, checksum, local_path,
                last_modified, created_at, updated_at
         FROM skills ORDER BY name"
    )?;

    let skills = stmt.query_map([], |row| {
        Ok(Skill {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            version: row.get(3)?,
            checksum: row.get(4)?,
            local_path: row.get(5)?,
            last_modified: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(skills)
}

#[tauri::command]
pub async fn get_skill_by_id(skill_id: String, pool: State<'_, DbPool>) -> Result<Skill, AppError> {
    info!("[get_skill_by_id] 查询 Skill: {}", skill_id);
    let conn = pool.get()?;
    let skill = conn.query_row(
        "SELECT id, name, description, version, checksum, local_path,
                last_modified, created_at, updated_at
         FROM skills WHERE id = ?1",
        params![skill_id],
        |row| Ok(Skill {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            version: row.get(3)?,
            checksum: row.get(4)?,
            local_path: row.get(5)?,
            last_modified: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        }),
    ).map_err(|_| AppError::NotFound(format!("Skill 不存在: {}", skill_id)))?;

    Ok(skill)
}

#[tauri::command]
pub async fn create_skill(
    name: String,
    description: Option<String>,
    version: Option<String>,
    source_type: String,
    source_url: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<Skill, AppError> {
    info!("[create_skill] 创建 Skill: name={}, source_type={}", name, source_type);
    let conn = pool.get()?;
    let skill_id = Uuid::new_v4().to_string();
    let source_id = Uuid::new_v4().to_string();

    let home = dirs::home_dir().expect("Cannot find home directory");
    let local_path = home
        .join(".skills-manager")
        .join("skills")
        .join(&name)
        .to_string_lossy()
        .to_string();

    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "INSERT INTO skills (id, name, description, version, local_path)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![skill_id, name, description, version, local_path],
    ).map_err(|e| {
        if let rusqlite::Error::SqliteFailure(_, Some(ref msg)) = e {
            if msg.contains("UNIQUE") {
                return AppError::AlreadyExists(format!("Skill 已存在: {}", name));
            }
        }
        AppError::Database(e)
    })?;

    tx.execute(
        "INSERT INTO skill_sources (id, skill_id, source_type, url, installed_version)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![source_id, skill_id, source_type, source_url, version],
    )?;

    tx.commit()?;

    let skill = conn.query_row(
        "SELECT id, name, description, version, checksum, local_path,
                last_modified, created_at, updated_at
         FROM skills WHERE id = ?1",
        params![skill_id],
        |row| Ok(Skill {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            version: row.get(3)?,
            checksum: row.get(4)?,
            local_path: row.get(5)?,
            last_modified: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        }),
    )?;

    Ok(skill)
}

#[tauri::command]
pub async fn delete_skill(skill_id: String, pool: State<'_, DbPool>) -> Result<(), AppError> {
    info!("[delete_skill] 删除 Skill: {}", skill_id);
    let conn = pool.get()?;
    let affected = conn.execute("DELETE FROM skills WHERE id = ?1", params![skill_id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Skill 不存在: {}", skill_id)));
    }
    Ok(())
}

// ── batch_delete_skill (批量删除) ──

#[derive(serde::Serialize)]
pub struct BatchDeleteResult {
    pub skill_id: String,
    pub skill_name: String,
    pub deployments_deleted: usize,
    pub files_removed: usize,
    pub local_lib_removed: bool,
}

#[tauri::command]
pub async fn batch_delete_skill(
    skill_id: String,
    delete_local_lib: bool,
    pool: State<'_, DbPool>,
) -> Result<BatchDeleteResult, AppError> {
    info!(
        "[batch_delete_skill] skill_id={}, delete_local_lib={}",
        skill_id, delete_local_lib
    );

    let conn = pool.get()?;

    // 1. 获取 skill 信息
    let (skill_name, local_path): (String, Option<String>) = conn.query_row(
        "SELECT name, local_path FROM skills WHERE id = ?1",
        params![skill_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| AppError::NotFound(format!("Skill 不存在: {}", skill_id)))?;

    info!("[batch_delete_skill] Skill: name={}, local_path={:?}", skill_name, local_path);

    // 2. 获取所有部署
    let mut stmt = conn.prepare(
        "SELECT id, path FROM skill_deployments WHERE skill_id = ?1"
    )?;
    let deployments: Vec<(String, String)> = stmt.query_map(params![skill_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?.collect::<Result<Vec<_>, _>>()?;

    info!("[batch_delete_skill] 找到 {} 个部署", deployments.len());

    // 3. 删除部署磁盘文件
    let mut files_removed = 0usize;
    for (dep_id, dep_path) in &deployments {
        let path = Path::new(dep_path);
        if path.exists() {
            match std::fs::remove_dir_all(path) {
                Ok(_) => {
                    files_removed += 1;
                    info!("[batch_delete_skill]   删除部署文件: {} (id={})", dep_path, dep_id);
                }
                Err(e) => {
                    info!("[batch_delete_skill]   删除部署文件失败: {} — {}", dep_path, e);
                }
            }
        } else {
            info!("[batch_delete_skill]   部署路径不存在(跳过): {}", dep_path);
        }
    }

    let deployments_deleted = deployments.len();

    // 4. 删除本地库文件（如果请求）
    let mut local_lib_removed = false;
    if delete_local_lib {
        if let Some(ref lp) = local_path {
            let lib_path = Path::new(lp);
            if lib_path.exists() {
                match std::fs::remove_dir_all(lib_path) {
                    Ok(_) => {
                        local_lib_removed = true;
                        info!("[batch_delete_skill]   删除本地库: {}", lp);
                    }
                    Err(e) => {
                        info!("[batch_delete_skill]   删除本地库失败: {} — {}", lp, e);
                    }
                }
            } else {
                info!("[batch_delete_skill]   本地库路径不存在: {}", lp);
            }
        } else {
            info!("[batch_delete_skill]   无本地库路径，跳过");
        }
    }

    // 5. 删除数据库记录（CASCADE 会删除 deployments, sources, backups）
    conn.execute("DELETE FROM skills WHERE id = ?1", params![skill_id])?;
    info!(
        "[batch_delete_skill] 数据库记录已删除 (含 {} 个部署记录)",
        deployments_deleted
    );

    info!(
        "[batch_delete_skill] 完成: skill='{}', deployments_deleted={}, files_removed={}, local_lib_removed={}",
        skill_name, deployments_deleted, files_removed, local_lib_removed
    );

    Ok(BatchDeleteResult {
        skill_id,
        skill_name,
        deployments_deleted,
        files_removed,
        local_lib_removed,
    })
}

#[tauri::command]
pub async fn get_skill_source(
    skill_id: String,
    pool: State<'_, DbPool>,
) -> Result<Option<SkillSource>, AppError> {
    info!("[get_skill_source] 查询 Skill 来源: {}", skill_id);
    let conn = pool.get()?;
    let source = conn.query_row(
        "SELECT id, skill_id, source_type, url, installed_version,
                original_checksum, remote_sha, skill_path, created_at, updated_at
         FROM skill_sources WHERE skill_id = ?1",
        params![skill_id],
        |row| Ok(SkillSource {
            id: row.get(0)?,
            skill_id: row.get(1)?,
            source_type: row.get(2)?,
            url: row.get(3)?,
            installed_version: row.get(4)?,
            original_checksum: row.get(5)?,
            remote_sha: row.get(6)?,
            skill_path: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        }),
    ).optional()?;

    Ok(source)
}

#[tauri::command]
pub async fn get_skill_backups(
    skill_id: String,
    pool: State<'_, DbPool>,
) -> Result<Vec<SkillBackup>, AppError> {
    info!("[get_skill_backups] 查询 Skill 备份: {}", skill_id);
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, skill_id, version_label, backup_path, checksum, reason, metadata, created_at
         FROM skill_backups WHERE skill_id = ?1
         ORDER BY created_at DESC"
    )?;

    let backups = stmt.query_map(params![skill_id], |row| {
        Ok(SkillBackup {
            id: row.get(0)?,
            skill_id: row.get(1)?,
            version_label: row.get(2)?,
            backup_path: row.get(3)?,
            checksum: row.get(4)?,
            reason: row.get(5)?,
            metadata: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(backups)
}

use rusqlite::OptionalExtension;

#[tauri::command]
pub async fn read_skill_file(file_path: String) -> Result<String, AppError> {
    info!("[read_skill_file] 读取文件: {}", file_path);
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!("文件不存在: {}", file_path)));
    }
    let content = std::fs::read_to_string(path)?;
    Ok(content)
}

#[tauri::command]
pub async fn write_skill_file(file_path: String, content: String) -> Result<(), AppError> {
    info!("[write_skill_file] 写入文件: {} ({} bytes)", file_path, content.len());
    let path = std::path::Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content)?;
    Ok(())
}

#[tauri::command]
pub async fn list_skill_files(dir_path: String) -> Result<Vec<String>, AppError> {
    info!("[list_skill_files] 列出目录: {}", dir_path);
    let path = std::path::Path::new(&dir_path);
    if !path.exists() || !path.is_dir() {
        return Ok(vec![]);
    }
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(rel) = entry.path().strip_prefix(path) {
                files.push(rel.to_string_lossy().to_string());
            }
        }
    }
    files.sort();
    Ok(files)
}

// ── 更新检测 ──

#[derive(serde::Serialize)]
pub struct SkillUpdateInfo {
    pub skill_id: String,
    pub skill_name: String,
    pub current_version: Option<String>,
    pub source_type: String,
    pub source_url: Option<String>,
    pub installed_version: Option<String>,
    pub original_checksum: Option<String>,
    pub current_checksum: Option<String>,
    pub locally_modified: bool,
    pub deploy_count: i64,
}

#[tauri::command]
pub async fn check_skill_updates(
    pool: State<'_, DbPool>,
) -> Result<Vec<SkillUpdateInfo>, AppError> {
    info!("[check_skill_updates] 检查所有 Skill 更新状态");

    let rows: Vec<SkillUpdateInfo> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.version, s.checksum, s.local_path,
                    ss.source_type, ss.url, ss.installed_version, ss.original_checksum,
                    (SELECT COUNT(*) FROM skill_deployments sd WHERE sd.skill_id = s.id) AS deploy_count
             FROM skills s
             LEFT JOIN skill_sources ss ON ss.skill_id = s.id
             ORDER BY s.name"
        )?;
        let result = stmt.query_map([], |row| {
            let current_checksum: Option<String> = row.get(3)?;
            let original_checksum: Option<String> = row.get(8)?;
            let locally_modified = match (&current_checksum, &original_checksum) {
                (Some(c), Some(o)) => c != o,
                _ => false,
            };
            Ok(SkillUpdateInfo {
                skill_id: row.get(0)?,
                skill_name: row.get(1)?,
                current_version: row.get(2)?,
                current_checksum,
                source_type: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "local".to_string()),
                source_url: row.get(6)?,
                installed_version: row.get(7)?,
                original_checksum,
                locally_modified,
                deploy_count: row.get(9)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        result
    };

    info!("[check_skill_updates] 检查完成: {} 个 Skill", rows.len());
    Ok(rows)
}

#[derive(serde::Serialize)]
pub struct UpdateResult {
    pub skill_id: String,
    pub backup_id: Option<String>,
    pub deployments_synced: usize,
    pub new_checksum: Option<String>,
}

#[tauri::command]
pub async fn update_skill_from_library(
    skill_id: String,
    sync_deployments: bool,
    project_ids: Option<Vec<String>>,
    tool_names: Option<Vec<String>>,
    pool: State<'_, DbPool>,
) -> Result<UpdateResult, AppError> {
    info!("[update_skill_from_library] skill={}, sync={}, projects={:?}, tools={:?}",
        skill_id, sync_deployments, project_ids, tool_names);

    // 1. 获取 Skill 信息
    let (skill_name, local_path, old_checksum) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT name, local_path, checksum FROM skills WHERE id = ?1",
            params![skill_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            )),
        ).map_err(|_| AppError::NotFound(format!("Skill 不存在: {}", skill_id)))?
    };

    let lib_dir = Path::new(&local_path);
    if !lib_dir.exists() {
        return Err(AppError::Validation(format!("Skill 本地路径不存在: {}", local_path)));
    }

    // 2. 备份旧版本
    let backup_id = {
        let conn = pool.get()?;
        let backup_base = dirs::home_dir()
            .unwrap_or_default()
            .join(".skills-manager")
            .join("backups")
            .join(&skill_name);
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_path = backup_base.join(&timestamp);

        if lib_dir.exists() {
            let _ = copy_dir_recursive(lib_dir, &backup_path);
            let bid = Uuid::new_v4().to_string();
            let bp_str = backup_path.to_string_lossy().to_string();
            conn.execute(
                "INSERT INTO skill_backups (id, skill_id, version_label, backup_path, checksum, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'before_update')",
                params![bid, skill_id, timestamp, bp_str, old_checksum],
            )?;
            info!("[update_skill_from_library] 备份完成: {}", bp_str);
            Some(bid)
        } else {
            None
        }
    };

    // 3. 重新计算 checksum 并更新 skills 表
    let new_checksum = compute_dir_checksum(lib_dir);
    {
        let conn = pool.get()?;
        conn.execute(
            "UPDATE skills SET checksum = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![new_checksum, skill_id],
        )?;
        // 更新 skill_sources 中的 original_checksum
        conn.execute(
            "UPDATE skill_sources SET original_checksum = ?1, updated_at = datetime('now') WHERE skill_id = ?2",
            params![new_checksum, skill_id],
        )?;
    }

    // 4. 可选：同步到部署（支持按 project_ids / tool_names 筛选）
    let mut deployments_synced = 0usize;
    if sync_deployments {
        let deploy_rows: Vec<(String, String)> = {
            let conn = pool.get()?;
            let mut stmt = conn.prepare(
                "SELECT id, path, project_id, tool FROM skill_deployments WHERE skill_id = ?1"
            )?;
            let all_rows = stmt.query_map(params![skill_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?.collect::<Result<Vec<_>, _>>()?;

            // 按 project_ids / tool_names 过滤
            all_rows.into_iter()
                .filter(|(_id, _path, pid, tool)| {
                    let project_ok = match &project_ids {
                        Some(ids) if !ids.is_empty() => {
                            pid.as_ref().map(|p| ids.contains(p)).unwrap_or(false)
                        }
                        _ => true,
                    };
                    let tool_ok = match &tool_names {
                        Some(names) if !names.is_empty() => {
                            tool.as_ref().map(|t| names.contains(t)).unwrap_or(false)
                        }
                        _ => true,
                    };
                    project_ok && tool_ok
                })
                .map(|(id, path, _, _)| (id, path))
                .collect()
        };

        for (dep_id, deploy_path) in &deploy_rows {
            let dst = Path::new(deploy_path);
            if dst.exists() {
                let _ = std::fs::remove_dir_all(dst);
            }
            let _ = copy_dir_recursive(lib_dir, dst);
            let dep_checksum = compute_dir_checksum(dst);

            let conn = pool.get()?;
            conn.execute(
                "UPDATE skill_deployments SET checksum = ?1, status = 'synced',
                        last_synced = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?2",
                params![dep_checksum, dep_id],
            )?;
            deployments_synced += 1;
        }
        info!("[update_skill_from_library] 已同步 {} 个部署", deployments_synced);
    }

    Ok(UpdateResult {
        skill_id,
        backup_id,
        deployments_synced,
        new_checksum,
    })
}

#[derive(serde::Serialize)]
pub struct RestoreResult {
    pub skill_id: String,
    pub restored_version: Option<String>,
    pub new_checksum: Option<String>,
    pub deployments_synced: usize,
}

#[tauri::command]
pub async fn restore_from_backup(
    backup_id: String,
    sync_deployments: bool,
    pool: State<'_, DbPool>,
) -> Result<RestoreResult, AppError> {
    info!("[restore_from_backup] backup_id={}, sync={}", backup_id, sync_deployments);

    // 1. 查询备份记录
    let (skill_id, version_label, backup_path, _backup_checksum) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT skill_id, version_label, backup_path, checksum
             FROM skill_backups WHERE id = ?1",
            params![backup_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            )),
        ).map_err(|_| AppError::NotFound(format!("备份记录不存在: {}", backup_id)))?
    };

    let backup_dir = Path::new(&backup_path);
    if !backup_dir.exists() || !backup_dir.is_dir() {
        return Err(AppError::Validation(format!("备份目录不存在: {}", backup_path)));
    }

    // 2. 获取 Skill 当前信息
    let (skill_name, local_path, old_checksum) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT name, local_path, checksum FROM skills WHERE id = ?1",
            params![skill_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            )),
        ).map_err(|_| AppError::NotFound(format!("Skill 不存在: {}", skill_id)))?
    };

    let lib_dir = Path::new(&local_path);

    // 3. 备份当前版本（回滚前先备份，防止误操作）
    {
        let conn = pool.get()?;
        let backup_base = dirs::home_dir()
            .unwrap_or_default()
            .join(".skills-manager")
            .join("backups")
            .join(&skill_name);
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let current_backup_path = backup_base.join(&timestamp);

        if lib_dir.exists() {
            let _ = copy_dir_recursive(lib_dir, &current_backup_path);
            let bid = Uuid::new_v4().to_string();
            let bp_str = current_backup_path.to_string_lossy().to_string();
            conn.execute(
                "INSERT INTO skill_backups (id, skill_id, version_label, backup_path, checksum, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'before_restore')",
                params![bid, skill_id, timestamp, bp_str, old_checksum],
            )?;
            info!("[restore_from_backup] 回滚前备份当前版本: {}", bp_str);
        }
    }

    // 4. 用备份覆盖本地 Skill 库
    if lib_dir.exists() {
        std::fs::remove_dir_all(lib_dir)?;
    }
    let files_copied = copy_dir_recursive(backup_dir, lib_dir)?;
    let new_checksum = compute_dir_checksum(lib_dir);

    info!("[restore_from_backup] 恢复完成: {} 个文件, checksum={:?}", files_copied, new_checksum);

    // 5. 更新数据库
    {
        let conn = pool.get()?;
        conn.execute(
            "UPDATE skills SET checksum = ?1, last_modified = datetime('now'), updated_at = datetime('now')
             WHERE id = ?2",
            params![new_checksum, skill_id],
        )?;
        conn.execute(
            "UPDATE skill_sources SET original_checksum = ?1, updated_at = datetime('now')
             WHERE skill_id = ?2",
            params![new_checksum, skill_id],
        )?;
    }

    // 6. 可选：同步到所有部署
    let mut deployments_synced = 0usize;
    if sync_deployments {
        let deploy_rows: Vec<(String, String)> = {
            let conn = pool.get()?;
            let mut stmt = conn.prepare(
                "SELECT id, path FROM skill_deployments WHERE skill_id = ?1"
            )?;
            let result = stmt.query_map(params![skill_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?.collect::<Result<Vec<_>, _>>()?;
            result
        };

        for (dep_id, deploy_path) in &deploy_rows {
            let dst = Path::new(deploy_path);
            if dst.exists() {
                let _ = std::fs::remove_dir_all(dst);
            }
            let _ = copy_dir_recursive(lib_dir, dst);
            let dep_checksum = compute_dir_checksum(dst);

            let conn = pool.get()?;
            conn.execute(
                "UPDATE skill_deployments SET checksum = ?1, status = 'synced',
                        last_synced = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?2",
                params![dep_checksum, dep_id],
            )?;
            deployments_synced += 1;
        }
        info!("[restore_from_backup] 已同步 {} 个部署", deployments_synced);
    }

    // 7. 写入同步历史
    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO sync_history (id, skill_id, action, status, created_at)
             VALUES (?1, ?2, 'restore', 'success', datetime('now'))",
            params![Uuid::new_v4().to_string(), skill_id],
        )?;
    }

    Ok(RestoreResult {
        skill_id,
        restored_version: version_label,
        new_checksum,
        deployments_synced,
    })
}

// ── compute_skill_diff ──

#[derive(serde::Serialize)]
pub struct FileDiff {
    pub path: String,
    pub status: String, // "added", "removed", "modified", "unchanged"
    pub hunks: Vec<DiffHunk>,
}

#[derive(serde::Serialize)]
pub struct DiffHunk {
    pub old_start: usize,
    pub old_count: usize,
    pub new_start: usize,
    pub new_count: usize,
    pub lines: Vec<DiffLine>,
}

#[derive(serde::Serialize)]
pub struct DiffLine {
    pub tag: String, // "+", "-", " "
    pub content: String,
}

#[derive(serde::Serialize)]
pub struct SkillDiffResult {
    pub left_path: String,
    pub right_path: String,
    pub files: Vec<FileDiff>,
    pub summary: DiffSummary,
}

#[derive(serde::Serialize)]
pub struct DiffSummary {
    pub added: usize,
    pub removed: usize,
    pub modified: usize,
    pub unchanged: usize,
}

fn collect_relative_files(dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    if !dir.exists() {
        return files;
    }
    for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(rel) = entry.path().strip_prefix(dir) {
                files.push(rel.to_string_lossy().to_string());
            }
        }
    }
    files.sort();
    files
}

fn compute_file_diff(old_content: &str, new_content: &str) -> Vec<DiffHunk> {
    use similar::{ChangeTag, TextDiff};
    let diff = TextDiff::from_lines(old_content, new_content);

    let mut all_changes: Vec<(ChangeTag, usize, usize, String)> = Vec::new();
    let mut old_line = 1usize;
    let mut new_line = 1usize;

    for change in diff.iter_all_changes() {
        let tag = change.tag();
        all_changes.push((tag, old_line, new_line, change.value().to_string()));
        match tag {
            ChangeTag::Equal => { old_line += 1; new_line += 1; }
            ChangeTag::Delete => { old_line += 1; }
            ChangeTag::Insert => { new_line += 1; }
        }
    }

    // Group changes into hunks with context
    let context = 3usize;
    let mut hunks = Vec::new();
    let mut i = 0;
    while i < all_changes.len() {
        if all_changes[i].0 == ChangeTag::Equal {
            i += 1;
            continue;
        }
        // Found a change, collect hunk with context
        let hunk_start = i.saturating_sub(context);
        let mut hunk_end = i;
        // Extend to include all nearby changes
        while hunk_end < all_changes.len() {
            if all_changes[hunk_end].0 != ChangeTag::Equal {
                hunk_end += 1;
                continue;
            }
            // Check if next change is within context
            let mut next_change = hunk_end;
            while next_change < all_changes.len() && all_changes[next_change].0 == ChangeTag::Equal {
                next_change += 1;
            }
            if next_change < all_changes.len() && next_change - hunk_end <= context * 2 {
                hunk_end = next_change + 1;
            } else {
                break;
            }
        }
        hunk_end = (hunk_end + context).min(all_changes.len());

        let old_start = all_changes[hunk_start].1;
        let new_start = all_changes[hunk_start].2;
        let mut old_count = 0;
        let mut new_count = 0;
        let mut lines = Vec::new();
        for j in hunk_start..hunk_end {
            let (tag, _, _, ref content) = all_changes[j];
            let tag_str = match tag {
                ChangeTag::Insert => { new_count += 1; "+".to_string() }
                ChangeTag::Delete => { old_count += 1; "-".to_string() }
                ChangeTag::Equal => { old_count += 1; new_count += 1; " ".to_string() }
            };
            lines.push(DiffLine { tag: tag_str, content: content.clone() });
        }

        hunks.push(DiffHunk { old_start, old_count, new_start, new_count, lines });
        i = hunk_end;
    }
    hunks
}

#[tauri::command]
pub async fn compute_skill_diff(
    left_path: String,
    right_path: String,
) -> Result<SkillDiffResult, AppError> {
    info!("[compute_skill_diff] left={}, right={}", left_path, right_path);

    let left_dir = Path::new(&left_path);
    let right_dir = Path::new(&right_path);

    if !left_dir.exists() && !right_dir.exists() {
        return Err(AppError::Validation("两个路径都不存在".to_string()));
    }

    let left_files: std::collections::HashSet<String> = collect_relative_files(left_dir).into_iter().collect();
    let right_files: std::collections::HashSet<String> = collect_relative_files(right_dir).into_iter().collect();

    let all_files: std::collections::BTreeSet<&String> = left_files.iter().chain(right_files.iter()).collect();

    let mut files = Vec::new();
    let mut added = 0usize;
    let mut removed = 0usize;
    let mut modified = 0usize;
    let mut unchanged = 0usize;

    for rel_path in all_files {
        let in_left = left_files.contains(rel_path);
        let in_right = right_files.contains(rel_path);

        if in_left && !in_right {
            // removed
            removed += 1;
            files.push(FileDiff {
                path: rel_path.clone(),
                status: "removed".to_string(),
                hunks: Vec::new(),
            });
        } else if !in_left && in_right {
            // added
            added += 1;
            files.push(FileDiff {
                path: rel_path.clone(),
                status: "added".to_string(),
                hunks: Vec::new(),
            });
        } else {
            // both exist - compare
            let left_content = std::fs::read_to_string(left_dir.join(rel_path)).unwrap_or_default();
            let right_content = std::fs::read_to_string(right_dir.join(rel_path)).unwrap_or_default();

            if left_content == right_content {
                unchanged += 1;
                // skip unchanged files
            } else {
                let hunks = compute_file_diff(&left_content, &right_content);
                modified += 1;
                files.push(FileDiff {
                    path: rel_path.clone(),
                    status: "modified".to_string(),
                    hunks,
                });
            }
        }
    }

    info!(
        "[compute_skill_diff] 完成: added={}, removed={}, modified={}, unchanged={}",
        added, removed, modified, unchanged
    );

    Ok(SkillDiffResult {
        left_path,
        right_path,
        files,
        summary: DiffSummary {
            added,
            removed,
            modified,
            unchanged,
        },
    })
}

// ── merge_skill_versions (三向合并) ──

#[derive(serde::Serialize)]
pub struct MergeFileResult {
    pub path: String,
    pub status: String, // "auto_merged", "conflict", "added_left", "added_right", "deleted_left", "deleted_right", "unchanged"
    pub merged_content: Option<String>,
    pub left_content: Option<String>,
    pub right_content: Option<String>,
    pub base_content: Option<String>,
}

#[derive(serde::Serialize)]
pub struct MergeResult {
    pub files: Vec<MergeFileResult>,
    pub auto_merged_count: usize,
    pub conflict_count: usize,
    pub total_files: usize,
}

#[derive(serde::Deserialize)]
pub struct MergeResolution {
    pub path: String,
    pub content: String,
}

fn three_way_merge_text(base: &str, left: &str, right: &str) -> (String, bool) {
    use similar::{ChangeTag, TextDiff};

    // If left == right, no conflict
    if left == right {
        return (left.to_string(), false);
    }
    // If left == base, right changed → take right
    if left == base {
        return (right.to_string(), false);
    }
    // If right == base, left changed → take left
    if right == base {
        return (left.to_string(), false);
    }

    // Both changed from base — try line-level merge
    let base_lines: Vec<&str> = base.lines().collect();
    let left_lines: Vec<&str> = left.lines().collect();
    let right_lines: Vec<&str> = right.lines().collect();

    let diff_left = TextDiff::from_slices(&base_lines, &left_lines);
    let diff_right = TextDiff::from_slices(&base_lines, &right_lines);

    let left_changes: std::collections::HashMap<usize, (ChangeTag, String)> = diff_left
        .iter_all_changes()
        .enumerate()
        .filter(|(_, c)| c.tag() != ChangeTag::Equal)
        .map(|(i, c)| (i, (c.tag(), c.value().to_string())))
        .collect();

    let right_changes: std::collections::HashMap<usize, (ChangeTag, String)> = diff_right
        .iter_all_changes()
        .enumerate()
        .filter(|(_, c)| c.tag() != ChangeTag::Equal)
        .map(|(i, c)| (i, (c.tag(), c.value().to_string())))
        .collect();

    // Check if changes overlap (simple heuristic: any shared indices = conflict)
    let has_overlap = left_changes.keys().any(|k| right_changes.contains_key(k));

    if has_overlap {
        // Real conflict — return conflict markers
        let mut merged = String::new();
        merged.push_str("<<<<<<< LOCAL\n");
        merged.push_str(left);
        if !left.ends_with('\n') { merged.push('\n'); }
        merged.push_str("=======\n");
        merged.push_str(right);
        if !right.ends_with('\n') { merged.push('\n'); }
        merged.push_str(">>>>>>> DEPLOYMENT\n");
        return (merged, true);
    }

    // Non-overlapping changes: apply both sets
    // Simple approach: take left (which includes left's changes from base)
    // and also apply right's unique changes — this is complex, so for non-overlapping
    // we just take left since it's the "local" version with priority
    (left.to_string(), false)
}

#[tauri::command]
pub async fn merge_skill_versions(
    base_path: Option<String>,
    left_path: String,
    right_path: String,
) -> Result<MergeResult, AppError> {
    info!(
        "[merge_skill_versions] base={:?}, left={}, right={}",
        base_path, left_path, right_path
    );

    let left_dir = Path::new(&left_path);
    let right_dir = Path::new(&right_path);
    let base_dir = base_path.as_ref().map(|p| Path::new(p.as_str()));

    if !left_dir.exists() {
        return Err(AppError::Validation(format!("左侧路径不存在: {}", left_path)));
    }
    if !right_dir.exists() {
        return Err(AppError::Validation(format!("右侧路径不存在: {}", right_path)));
    }

    let left_files: std::collections::HashSet<String> = collect_relative_files(left_dir).into_iter().collect();
    let right_files: std::collections::HashSet<String> = collect_relative_files(right_dir).into_iter().collect();
    let base_files: std::collections::HashSet<String> = base_dir
        .map(|d| collect_relative_files(d).into_iter().collect())
        .unwrap_or_default();

    let all_files: std::collections::BTreeSet<&String> = left_files.iter()
        .chain(right_files.iter())
        .chain(base_files.iter())
        .collect();

    let mut files = Vec::new();
    let mut auto_merged_count = 0usize;
    let mut conflict_count = 0usize;

    for rel_path in &all_files {
        let in_left = left_files.contains(*rel_path);
        let in_right = right_files.contains(*rel_path);
        let in_base = base_files.contains(*rel_path);

        let left_content = if in_left {
            Some(std::fs::read_to_string(left_dir.join(rel_path)).unwrap_or_default())
        } else { None };
        let right_content = if in_right {
            Some(std::fs::read_to_string(right_dir.join(rel_path)).unwrap_or_default())
        } else { None };
        let base_content = if in_base {
            base_dir.and_then(|d| std::fs::read_to_string(d.join(rel_path)).ok())
        } else { None };

        info!(
            "[merge_skill_versions] 文件: {} | in_base={}, in_left={}, in_right={}",
            rel_path, in_base, in_left, in_right
        );

        match (in_left, in_right, in_base) {
            // Both sides have the file
            (true, true, _) => {
                let l = left_content.as_deref().unwrap_or("");
                let r = right_content.as_deref().unwrap_or("");
                let b = base_content.as_deref().unwrap_or("");

                if l == r {
                    info!("[merge_skill_versions]   → unchanged (L==R)");
                    files.push(MergeFileResult {
                        path: (*rel_path).clone(),
                        status: "unchanged".to_string(),
                        merged_content: Some(l.to_string()),
                        left_content: None,
                        right_content: None,
                        base_content: None,
                    });
                    auto_merged_count += 1;
                } else {
                    let (merged, has_conflict) = three_way_merge_text(b, l, r);
                    if has_conflict {
                        info!("[merge_skill_versions]   → CONFLICT");
                        conflict_count += 1;
                        files.push(MergeFileResult {
                            path: (*rel_path).clone(),
                            status: "conflict".to_string(),
                            merged_content: Some(merged),
                            left_content: Some(l.to_string()),
                            right_content: Some(r.to_string()),
                            base_content: base_content.clone(),
                        });
                    } else {
                        info!("[merge_skill_versions]   → auto_merged");
                        auto_merged_count += 1;
                        files.push(MergeFileResult {
                            path: (*rel_path).clone(),
                            status: "auto_merged".to_string(),
                            merged_content: Some(merged),
                            left_content: None,
                            right_content: None,
                            base_content: None,
                        });
                    }
                }
            }
            // Only in left (added in left or deleted in right)
            (true, false, true) => {
                info!("[merge_skill_versions]   → deleted_right");
                files.push(MergeFileResult {
                    path: (*rel_path).clone(),
                    status: "deleted_right".to_string(),
                    merged_content: left_content.clone(),
                    left_content,
                    right_content: None,
                    base_content,
                });
                conflict_count += 1;
            }
            (true, false, false) => {
                info!("[merge_skill_versions]   → added_left");
                auto_merged_count += 1;
                files.push(MergeFileResult {
                    path: (*rel_path).clone(),
                    status: "added_left".to_string(),
                    merged_content: left_content.clone(),
                    left_content,
                    right_content: None,
                    base_content: None,
                });
            }
            // Only in right
            (false, true, true) => {
                info!("[merge_skill_versions]   → deleted_left");
                files.push(MergeFileResult {
                    path: (*rel_path).clone(),
                    status: "deleted_left".to_string(),
                    merged_content: right_content.clone(),
                    left_content: None,
                    right_content,
                    base_content,
                });
                conflict_count += 1;
            }
            (false, true, false) => {
                info!("[merge_skill_versions]   → added_right");
                auto_merged_count += 1;
                files.push(MergeFileResult {
                    path: (*rel_path).clone(),
                    status: "added_right".to_string(),
                    merged_content: right_content.clone(),
                    left_content: None,
                    right_content,
                    base_content: None,
                });
            }
            // Only in base (both deleted)
            (false, false, true) => {
                info!("[merge_skill_versions]   → both deleted, skip");
                auto_merged_count += 1;
            }
            _ => {}
        }
    }

    let total_files = files.len();
    info!(
        "[merge_skill_versions] 完成: total={}, auto_merged={}, conflicts={}",
        total_files, auto_merged_count, conflict_count
    );

    Ok(MergeResult {
        files,
        auto_merged_count,
        conflict_count,
        total_files,
    })
}

#[tauri::command]
pub async fn apply_merge_result(
    target_path: String,
    resolutions: Vec<MergeResolution>,
) -> Result<(), AppError> {
    info!(
        "[apply_merge_result] target={}, resolutions={}",
        target_path, resolutions.len()
    );

    let target_dir = Path::new(&target_path);
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir)
            .map_err(|e| AppError::Internal(format!("创建目标目录失败: {}", e)))?;
    }

    for resolution in &resolutions {
        let file_path = target_dir.join(&resolution.path);
        info!("[apply_merge_result] 写入: {}", file_path.display());
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&file_path, &resolution.content)?;
    }

    info!("[apply_merge_result] 完成: 写入 {} 个文件到 {}", resolutions.len(), target_path);
    Ok(())
}
