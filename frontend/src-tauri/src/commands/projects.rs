use log::info;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{Project, DashboardStats, ProjectDetailDeployment};

#[tauri::command]
pub async fn get_projects(pool: State<'_, DbPool>) -> Result<Vec<Project>, AppError> {
    info!("[get_projects] 查询所有项目");
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.path, p.last_scanned,
                COUNT(DISTINCT sd.skill_id) AS skill_count,
                COUNT(DISTINCT sd.tool) AS tool_count,
                p.created_at, p.updated_at,
                -- 实时推导：有 diverged/missing → changed；全 synced → synced；无部署 → unsynced
                CASE
                    WHEN COUNT(sd.id) = 0 THEN 'unsynced'
                    WHEN SUM(CASE WHEN sd.status IN ('diverged','missing') THEN 1 ELSE 0 END) > 0 THEN 'changed'
                    ELSE 'synced'
                END AS computed_status
         FROM projects p
         LEFT JOIN skill_deployments sd ON sd.project_id = p.id
         GROUP BY p.id ORDER BY p.name"
    )?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            status: row.get(8)?,   // computed_status
            last_scanned: row.get(3)?,
            skill_count: row.get(4)?,
            tool_count: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(projects)
}

#[tauri::command]
pub async fn add_project(path: String, pool: State<'_, DbPool>) -> Result<Project, AppError> {
    info!("[add_project] 添加项目: {}", path);
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
        "SELECT id, name, path, last_scanned, created_at, updated_at
         FROM projects WHERE id = ?1",
        params![id],
        |row| Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            status: "unsynced".to_string(), // 新建项目无部署
            last_scanned: row.get(3)?,
            skill_count: 0,
            tool_count: 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        }),
    )?;

    Ok(project)
}

// ── batch_add_projects (批量导入) ──

#[derive(serde::Serialize)]
pub struct BatchAddResult {
    pub added: Vec<Project>,
    pub skipped: Vec<BatchSkippedItem>,
    pub total: usize,
}

#[derive(serde::Serialize)]
pub struct BatchSkippedItem {
    pub path: String,
    pub reason: String,
}

#[tauri::command]
pub async fn batch_add_projects(
    paths: Vec<String>,
    pool: State<'_, DbPool>,
) -> Result<BatchAddResult, AppError> {
    info!("[batch_add_projects] 批量添加 {} 个路径", paths.len());

    let conn = pool.get()?;
    let mut added = Vec::new();
    let mut skipped = Vec::new();

    for path in &paths {
        let project_path = std::path::Path::new(path);

        if !project_path.exists() || !project_path.is_dir() {
            info!("[batch_add_projects]   跳过（路径无效）: {}", path);
            skipped.push(BatchSkippedItem {
                path: path.clone(),
                reason: "路径不存在或不是目录".into(),
            });
            continue;
        }

        let name = project_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        let id = Uuid::new_v4().to_string();

        match conn.execute(
            "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
            params![id, name, path],
        ) {
            Ok(_) => {
                let project = conn.query_row(
                    "SELECT id, name, path, last_scanned, created_at, updated_at
                     FROM projects WHERE id = ?1",
                    params![id],
                    |row| Ok(Project {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        path: row.get(2)?,
                        status: "unsynced".to_string(), // 新建项目无部署
                        last_scanned: row.get(3)?,
                        skill_count: 0,
                        tool_count: 0,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    }),
                )?;
                info!("[batch_add_projects]   添加成功: {} ({})", name, path);
                added.push(project);
            }
            Err(e) => {
                let reason = if let rusqlite::Error::SqliteFailure(_, Some(ref msg)) = e {
                    if msg.contains("UNIQUE") {
                        "项目已存在".into()
                    } else {
                        format!("数据库错误: {}", msg)
                    }
                } else {
                    format!("数据库错误: {}", e)
                };
                info!("[batch_add_projects]   跳过（{}）: {}", reason, path);
                skipped.push(BatchSkippedItem {
                    path: path.clone(),
                    reason,
                });
            }
        }
    }

    let total = paths.len();
    info!(
        "[batch_add_projects] 完成: {} 个添加, {} 个跳过, 共 {} 个",
        added.len(), skipped.len(), total
    );

    Ok(BatchAddResult { added, skipped, total })
}

#[tauri::command]
pub async fn remove_project(project_id: String, pool: State<'_, DbPool>) -> Result<(), AppError> {
    info!("[remove_project] 删除项目: {}", project_id);
    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;

    // 先删除关联的 change_events（通过 deployment_id）
    let deleted_events: usize = tx.execute(
        "DELETE FROM change_events WHERE deployment_id IN (
            SELECT id FROM skill_deployments WHERE project_id = ?1
        )",
        params![project_id],
    )?;
    info!("[remove_project] 删除关联 change_events: {} 条", deleted_events);

    // 再删除关联的 skill_deployments
    let deleted_deployments: usize = tx.execute(
        "DELETE FROM skill_deployments WHERE project_id = ?1",
        params![project_id],
    )?;
    info!("[remove_project] 删除关联 skill_deployments: {} 条", deleted_deployments);

    // 最后删除项目本身
    let affected = tx.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("项目不存在: {}", project_id)));
    }

    tx.commit()?;
    info!("[remove_project] 项目已删除: {}", project_id);
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
    info!("[get_dashboard_stats] 查询仪表盘统计");
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
