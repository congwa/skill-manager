use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{Skill, SkillSource, SkillBackup};

#[tauri::command]
pub async fn get_skills(pool: State<'_, DbPool>) -> Result<Vec<Skill>, AppError> {
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
