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

#[tauri::command]
pub async fn get_skill_source(
    skill_id: String,
    pool: State<'_, DbPool>,
) -> Result<Option<SkillSource>, AppError> {
    info!("[get_skill_source] 查询 Skill 来源: {}", skill_id);
    let conn = pool.get()?;
    let source = conn.query_row(
        "SELECT id, skill_id, source_type, url, installed_version,
                original_checksum, created_at, updated_at
         FROM skill_sources WHERE skill_id = ?1",
        params![skill_id],
        |row| Ok(SkillSource {
            id: row.get(0)?,
            skill_id: row.get(1)?,
            source_type: row.get(2)?,
            url: row.get(3)?,
            installed_version: row.get(4)?,
            original_checksum: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
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
    pool: State<'_, DbPool>,
) -> Result<UpdateResult, AppError> {
    info!("[update_skill_from_library] skill={}, sync={}", skill_id, sync_deployments);

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

    // 4. 可选：同步到所有部署
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
        info!("[update_skill_from_library] 已同步 {} 个部署", deployments_synced);
    }

    Ok(UpdateResult {
        skill_id,
        backup_id,
        deployments_synced,
        new_checksum,
    })
}
