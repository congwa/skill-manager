use log::info;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::SkillDeployment;

#[tauri::command]
pub async fn get_deployments(pool: State<'_, DbPool>) -> Result<Vec<SkillDeployment>, AppError> {
    info!("[get_deployments] 查询所有部署");
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, skill_id, project_id, tool, path, checksum, status,
                last_synced, created_at, updated_at
         FROM skill_deployments ORDER BY tool, path"
    )?;

    let deployments = stmt.query_map([], |row| {
        Ok(SkillDeployment {
            id: row.get(0)?,
            skill_id: row.get(1)?,
            project_id: row.get(2)?,
            tool: row.get(3)?,
            path: row.get(4)?,
            checksum: row.get(5)?,
            status: row.get(6)?,
            last_synced: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(deployments)
}

#[tauri::command]
pub async fn get_skill_deployments(
    skill_id: String,
    pool: State<'_, DbPool>,
) -> Result<Vec<SkillDeployment>, AppError> {
    info!("[get_skill_deployments] 查询 Skill 部署: {}", skill_id);
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, skill_id, project_id, tool, path, checksum, status,
                last_synced, created_at, updated_at
         FROM skill_deployments WHERE skill_id = ?1
         ORDER BY tool, path"
    )?;

    let deployments = stmt.query_map(params![skill_id], |row| {
        Ok(SkillDeployment {
            id: row.get(0)?,
            skill_id: row.get(1)?,
            project_id: row.get(2)?,
            tool: row.get(3)?,
            path: row.get(4)?,
            checksum: row.get(5)?,
            status: row.get(6)?,
            last_synced: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(deployments)
}

#[tauri::command]
pub async fn create_deployment(
    skill_id: String,
    project_id: Option<String>,
    tool: String,
    target_path: String,
    pool: State<'_, DbPool>,
) -> Result<SkillDeployment, AppError> {
    info!("[create_deployment] 创建部署: skill={}, tool={}, path={}", skill_id, tool, target_path);
    let conn = pool.get()?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, status, last_synced)
         VALUES (?1, ?2, ?3, ?4, ?5, 'synced', datetime('now'))",
        params![id, skill_id, project_id, tool, target_path],
    ).map_err(|e| {
        if let rusqlite::Error::SqliteFailure(_, Some(ref msg)) = e {
            if msg.contains("UNIQUE") {
                return AppError::AlreadyExists(
                    format!("此 Skill 已部署到该位置: {}", target_path)
                );
            }
        }
        AppError::Database(e)
    })?;

    let deployment = conn.query_row(
        "SELECT id, skill_id, project_id, tool, path, checksum, status,
                last_synced, created_at, updated_at
         FROM skill_deployments WHERE id = ?1",
        params![id],
        |row| Ok(SkillDeployment {
            id: row.get(0)?,
            skill_id: row.get(1)?,
            project_id: row.get(2)?,
            tool: row.get(3)?,
            path: row.get(4)?,
            checksum: row.get(5)?,
            status: row.get(6)?,
            last_synced: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        }),
    )?;

    Ok(deployment)
}

#[tauri::command]
pub async fn delete_deployment(
    deployment_id: String,
    pool: State<'_, DbPool>,
) -> Result<(), AppError> {
    info!("[delete_deployment] 删除部署: {}", deployment_id);
    let conn = pool.get()?;
    let affected = conn.execute(
        "DELETE FROM skill_deployments WHERE id = ?1",
        params![deployment_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("部署记录不存在: {}", deployment_id)));
    }
    Ok(())
}

#[tauri::command]
pub async fn update_deployment_status(
    deployment_id: String,
    status: String,
    checksum: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<(), AppError> {
    info!("[update_deployment_status] 更新部署状态: id={}, status={}", deployment_id, status);
    let conn = pool.get()?;
    conn.execute(
        "UPDATE skill_deployments SET status = ?1, checksum = ?2,
                updated_at = datetime('now') WHERE id = ?3",
        params![status, checksum, deployment_id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_diverged_deployments(
    pool: State<'_, DbPool>,
) -> Result<Vec<SkillDeployment>, AppError> {
    info!("[get_diverged_deployments] 查询偏离部署");
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT sd.id, sd.skill_id, sd.project_id, sd.tool, sd.path, sd.checksum,
                sd.status, sd.last_synced, sd.created_at, sd.updated_at
         FROM skill_deployments sd
         JOIN skills s ON sd.skill_id = s.id
         WHERE sd.checksum != s.checksum OR sd.checksum IS NULL OR sd.status != 'synced'
         ORDER BY sd.tool, sd.path"
    )?;

    let deployments = stmt.query_map([], |row| {
        Ok(SkillDeployment {
            id: row.get(0)?,
            skill_id: row.get(1)?,
            project_id: row.get(2)?,
            tool: row.get(3)?,
            path: row.get(4)?,
            checksum: row.get(5)?,
            status: row.get(6)?,
            last_synced: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(deployments)
}
