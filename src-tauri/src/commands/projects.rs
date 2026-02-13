use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{Project, DashboardStats, ProjectDetailDeployment};

#[tauri::command]
pub async fn get_projects(pool: State<'_, DbPool>) -> Result<Vec<Project>, AppError> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.path, p.status, p.last_scanned,
                COUNT(DISTINCT sd.skill_id) AS skill_count,
                COUNT(DISTINCT sd.tool) AS tool_count,
                p.created_at, p.updated_at
         FROM projects p
         LEFT JOIN skill_deployments sd ON sd.project_id = p.id
         GROUP BY p.id ORDER BY p.name"
    )?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            status: row.get(3)?,
            last_scanned: row.get(4)?,
            skill_count: row.get(5)?,
            tool_count: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(projects)
}

#[tauri::command]
pub async fn add_project(path: String, pool: State<'_, DbPool>) -> Result<Project, AppError> {
    let project_path = std::path::Path::new(&path);
    if !project_path.exists() || !project_path.is_dir() {
        return Err(AppError::Validation(format!("路径不存在或不是目录: {}", path)));
    }

    let name = project_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let id = Uuid::new_v4().to_string();
    let conn = pool.get()?;

    conn.execute(
        "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
        params![id, name, path],
    ).map_err(|e| {
        if let rusqlite::Error::SqliteFailure(_, Some(ref msg)) = e {
            if msg.contains("UNIQUE") {
                return AppError::AlreadyExists(format!("项目已存在: {}", path));
            }
        }
        AppError::Database(e)
    })?;

    let project = conn.query_row(
        "SELECT id, name, path, status, last_scanned, 0, 0, created_at, updated_at
         FROM projects WHERE id = ?1",
        params![id],
        |row| Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            status: row.get(3)?,
            last_scanned: row.get(4)?,
            skill_count: row.get(5)?,
            tool_count: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        }),
    )?;

    Ok(project)
}

#[tauri::command]
pub async fn remove_project(project_id: String, pool: State<'_, DbPool>) -> Result<(), AppError> {
    let conn = pool.get()?;
    let affected = conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("项目不存在: {}", project_id)));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_project_deployments(
    project_id: String,
    pool: State<'_, DbPool>,
) -> Result<Vec<ProjectDetailDeployment>, AppError> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT sd.id, sd.skill_id, s.name, s.description, s.version,
                sd.tool, sd.path, sd.status, sd.checksum, sd.last_synced
         FROM skill_deployments sd
         JOIN skills s ON sd.skill_id = s.id
         WHERE sd.project_id = ?1
         ORDER BY sd.tool, s.name"
    )?;

    let deployments = stmt.query_map(params![project_id], |row| {
        Ok(ProjectDetailDeployment {
            deployment_id: row.get(0)?,
            skill_id: row.get(1)?,
            skill_name: row.get(2)?,
            skill_description: row.get(3)?,
            skill_version: row.get(4)?,
            tool: row.get(5)?,
            path: row.get(6)?,
            status: row.get(7)?,
            checksum: row.get(8)?,
            last_synced: row.get(9)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(deployments)
}

#[tauri::command]
pub async fn get_dashboard_stats(pool: State<'_, DbPool>) -> Result<DashboardStats, AppError> {
    let conn = pool.get()?;

    let total_projects: i64 = conn.query_row(
        "SELECT COUNT(*) FROM projects", [], |row| row.get(0),
    )?;

    let total_skills: i64 = conn.query_row(
        "SELECT COUNT(*) FROM skills", [], |row| row.get(0),
    )?;

    let pending_changes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM change_events WHERE resolution = 'pending'", [], |row| row.get(0),
    )?;

    let diverged_deployments: i64 = conn.query_row(
        "SELECT COUNT(*) FROM skill_deployments WHERE status IN ('diverged', 'missing')",
        [], |row| row.get(0),
    )?;

    Ok(DashboardStats {
        total_projects,
        total_skills,
        pending_changes,
        diverged_deployments,
    })
}
