use log::info;
use rusqlite::params;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

use super::skill_files::{compute_db_checksum, db_export_to_dir, db_import_from_dir, has_db_files};
use super::utils::compute_dir_checksum;
use crate::db::DbPool;
use crate::error::AppError;
use crate::models::SkillDeployment;
use crate::tools::ALL_TOOLS;

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

    // 先查出部署路径
    let deploy_path: Option<String> = conn
        .query_row(
            "SELECT path FROM skill_deployments WHERE id = ?1",
            params![deployment_id],
            |row| row.get(0),
        )
        .ok();

    let Some(deploy_path) = deploy_path else {
        return Err(AppError::NotFound(format!("部署记录不存在: {}", deployment_id)));
    };

    // 删除磁盘上的部署目录
    let deploy_dir = Path::new(&deploy_path);
    if deploy_dir.exists() {
        std::fs::remove_dir_all(deploy_dir)?;
        info!("[delete_deployment] 已删除磁盘目录: {}", deploy_path);
    } else {
        info!("[delete_deployment] 磁盘目录不存在，跳过: {}", deploy_path);
    }

    // 删除数据库记录
    conn.execute(
        "DELETE FROM skill_deployments WHERE id = ?1",
        params![deployment_id],
    )?;
    info!("[delete_deployment] 已删除数据库记录: {}", deployment_id);

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

// ── 文件操作命令 ──

fn tool_skill_subdir(tool: &str) -> Option<&'static str> {
    ALL_TOOLS.iter().find(|t| t.id == tool).map(|t| t.project_dir)
}

#[derive(serde::Serialize)]
pub struct DeployResult {
    pub deployment_id: String,
    pub files_copied: u64,
    pub checksum: Option<String>,
    pub deploy_path: String,
    pub conflict: Option<DeployConflict>,
}

#[derive(serde::Serialize)]
pub struct DeployConflict {
    pub status: String,       // "exists_same" | "exists_different"
    pub existing_checksum: Option<String>,
    pub library_checksum: Option<String>,
}

#[tauri::command]
pub async fn deploy_skill_to_project(
    skill_id: String,
    project_id: String,
    tool: String,
    force: Option<bool>,
    pool: State<'_, DbPool>,
) -> Result<DeployResult, AppError> {
    let force = force.unwrap_or(false);
    info!("[deploy_skill_to_project] skill={}, project={}, tool={}, force={}", skill_id, project_id, tool, force);

    let tool_subdir = tool_skill_subdir(&tool)
        .ok_or_else(|| AppError::Validation(format!("不支持的工具: {}", tool)))?;

    let (skill_name, project_path) = {
        let conn = pool.get()?;

        let name: String = conn.query_row(
            "SELECT name FROM skills WHERE id = ?1",
            params![skill_id],
            |row| row.get(0),
        ).map_err(|_| AppError::NotFound(format!("Skill 不存在: {}", skill_id)))?;

        let proj_path: String = conn.query_row(
            "SELECT path FROM projects WHERE id = ?1",
            params![project_id],
            |row| row.get(0),
        ).map_err(|_| AppError::NotFound(format!("项目不存在: {}", project_id)))?;

        (name, proj_path)
    };

    // ── 计算目标路径：{project}/.cursor/skills/{skill_name} ──
    let dst = Path::new(&project_path).join(tool_subdir).join(&skill_name);
    let deploy_path = dst.to_string_lossy().to_string();

    // lib_checksum 从 DB 计算
    let lib_checksum = {
        let conn = pool.get()?;
        compute_db_checksum(&conn, &skill_id)
    };

    // 冲突检测：目标已存在且内容与源一致时跳过复制
    if dst.exists() && !force {
        let existing_checksum = compute_dir_checksum(&dst);
        if lib_checksum == existing_checksum && lib_checksum.is_some() {
            info!("[deploy_skill_to_project] 目标已存在且内容一致，跳过复制");
            let deployment_id = Uuid::new_v4().to_string();
            let conn = pool.get()?;
            conn.execute(
                "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'synced', datetime('now'))
                 ON CONFLICT(path) DO UPDATE SET
                    checksum = ?6, status = 'synced', last_synced = datetime('now'), updated_at = datetime('now')",
                params![deployment_id, skill_id, project_id, tool, deploy_path, existing_checksum.clone()],
            )?;
            return Ok(DeployResult {
                deployment_id,
                files_copied: 0,
                checksum: existing_checksum.clone(),
                deploy_path,
                conflict: Some(DeployConflict {
                    status: "exists_same".to_string(),
                    existing_checksum,
                    library_checksum: lib_checksum,
                }),
            });
        } else if lib_checksum != existing_checksum {
            info!("[deploy_skill_to_project] 目标已存在且内容不同，返回冲突信息");
            return Ok(DeployResult {
                deployment_id: String::new(),
                files_copied: 0,
                checksum: None,
                deploy_path,
                conflict: Some(DeployConflict {
                    status: "exists_different".to_string(),
                    existing_checksum,
                    library_checksum: lib_checksum,
                }),
            });
        }
    }

    // ── 执行部署：从 DB skill_files 导出到目标目录 ──
    if dst.exists() && force {
        info!("[deploy_skill_to_project] 强制覆盖，清空: {}", dst.display());
        std::fs::remove_dir_all(&dst)?;
    }

    info!("[deploy_skill_to_project] 从 DB 导出到: {}", dst.display());
    let files_copied = {
        let conn = pool.get()?;
        db_export_to_dir(&conn, &skill_id, &dst)? as u64
    };
    let checksum = compute_dir_checksum(&dst);

    info!("[deploy_skill_to_project] 复制完成: {} 个文件, checksum={:?}", files_copied, checksum);

    let deployment_id = Uuid::new_v4().to_string();

    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'synced', datetime('now'))
             ON CONFLICT(path) DO UPDATE SET
                checksum = ?6, status = 'synced', last_synced = datetime('now'), updated_at = datetime('now')",
            params![deployment_id, skill_id, project_id, tool, deploy_path, checksum],
        )?;
    }

    Ok(DeployResult {
        deployment_id,
        files_copied,
        checksum,
        deploy_path,
        conflict: None,
    })
}

// ── deploy_skill_global (全局部署) ──

fn global_tool_dir(tool: &str) -> Option<&'static str> {
    ALL_TOOLS.iter().find(|t| t.id == tool).map(|t| t.global_dir)
}

#[tauri::command]
pub async fn deploy_skill_global(
    skill_id: String,
    tool: String,
    force: Option<bool>,
    pool: State<'_, DbPool>,
) -> Result<DeployResult, AppError> {
    let force = force.unwrap_or(false);
    info!("[deploy_skill_global] skill={}, tool={}, force={}", skill_id, tool, force);

    let global_subdir = global_tool_dir(&tool)
        .ok_or_else(|| AppError::Validation(format!("不支持的工具: {}", tool)))?;

    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("无法获取用户主目录".into()))?;

    let skill_name: String = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT name FROM skills WHERE id = ?1",
            params![skill_id],
            |row| row.get(0),
        ).map_err(|_| AppError::NotFound(format!("Skill 不存在: {}", skill_id)))?
    };

    let dst = home.join(global_subdir).join(&skill_name);
    let deploy_path = dst.to_string_lossy().to_string();
    let lib_checksum = {
        let conn = pool.get()?;
        compute_db_checksum(&conn, &skill_id)
    };

    if dst.exists() && !force {
        let existing_checksum = compute_dir_checksum(&dst);
        if lib_checksum == existing_checksum && lib_checksum.is_some() {
            info!("[deploy_skill_global] 目标已存在且内容一致，跳过复制");
            let deployment_id = Uuid::new_v4().to_string();
            let conn = pool.get()?;
            conn.execute(
                "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
                 VALUES (?1, ?2, NULL, ?3, ?4, ?5, 'synced', datetime('now'))
                 ON CONFLICT(path) DO UPDATE SET
                    checksum = ?5, status = 'synced', last_synced = datetime('now'), updated_at = datetime('now')",
                params![deployment_id, skill_id, tool, deploy_path, existing_checksum.clone()],
            )?;
            return Ok(DeployResult {
                deployment_id,
                files_copied: 0,
                checksum: existing_checksum.clone(),
                deploy_path,
                conflict: Some(DeployConflict {
                    status: "exists_same".to_string(),
                    existing_checksum,
                    library_checksum: lib_checksum,
                }),
            });
        } else {
            info!("[deploy_skill_global] 目标已存在且内容不同");
            let existing_checksum = compute_dir_checksum(&dst);
            return Ok(DeployResult {
                deployment_id: String::new(),
                files_copied: 0,
                checksum: None,
                deploy_path,
                conflict: Some(DeployConflict {
                    status: "exists_different".to_string(),
                    existing_checksum,
                    library_checksum: lib_checksum,
                }),
            });
        }
    }

    if dst.exists() && force {
        info!("[deploy_skill_global] 强制覆盖");
        std::fs::remove_dir_all(&dst)?;
    }

    info!("[deploy_skill_global] 从 DB 导出到: {}", dst.display());
    let files_copied = {
        let conn = pool.get()?;
        db_export_to_dir(&conn, &skill_id, &dst)? as u64
    };
    let checksum = compute_dir_checksum(&dst);
    info!("[deploy_skill_global] 完成: {} 个文件, checksum={:?}", files_copied, checksum);

    let deployment_id = Uuid::new_v4().to_string();
    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
             VALUES (?1, ?2, NULL, ?3, ?4, ?5, 'synced', datetime('now'))
             ON CONFLICT(path) DO UPDATE SET
                checksum = ?5, status = 'synced', last_synced = datetime('now'), updated_at = datetime('now')",
            params![deployment_id, skill_id, tool, deploy_path, checksum],
        )?;
    }

    Ok(DeployResult {
        deployment_id,
        files_copied,
        checksum,
        deploy_path,
        conflict: None,
    })
}

#[derive(serde::Serialize)]
pub struct SyncResult {
    pub files_copied: u64,
    pub old_checksum: Option<String>,
    pub new_checksum: Option<String>,
}

#[tauri::command]
pub async fn sync_deployment(
    deployment_id: String,
    pool: State<'_, DbPool>,
) -> Result<SyncResult, AppError> {
    info!("[sync_deployment] deployment_id={}", deployment_id);

    let (skill_id, deploy_path, old_checksum) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT sd.skill_id, sd.path, sd.checksum
             FROM skill_deployments sd
             WHERE sd.id = ?1",
            params![deployment_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            )),
        ).map_err(|_| AppError::NotFound(format!("部署记录不存在: {}", deployment_id)))?
    };

    let dst = Path::new(&deploy_path);

    // 同步前清空目标，再从 DB 重新写出
    if dst.exists() {
        std::fs::remove_dir_all(dst)?;
    }

    info!("[sync_deployment] 从 DB 同步到: {}", dst.display());
    let files_copied = {
        let conn = pool.get()?;
        db_export_to_dir(&conn, &skill_id, dst)? as u64
    };
    let new_checksum = compute_dir_checksum(dst);

    info!("[sync_deployment] 同步完成: {} 个文件, checksum={:?}", files_copied, new_checksum);

    {
        let conn = pool.get()?;
        conn.execute(
            "UPDATE skill_deployments SET checksum = ?1, status = 'synced',
                    last_synced = datetime('now'), updated_at = datetime('now')
             WHERE id = ?2",
            params![new_checksum, deployment_id],
        )?;
    }

    Ok(SyncResult {
        files_copied,
        old_checksum,
        new_checksum,
    })
}

#[derive(serde::Serialize)]
pub struct ConsistencyReport {
    pub total_deployments: usize,
    pub synced: usize,
    pub diverged: usize,
    pub missing: usize,
    pub details: Vec<ConsistencyDetail>,
}

#[derive(serde::Serialize)]
pub struct ConsistencyDetail {
    pub deployment_id: String,
    pub skill_name: String,
    pub tool: String,
    pub deploy_path: String,
    pub status: String,
    pub lib_checksum: Option<String>,
    pub deploy_checksum: Option<String>,
}

#[tauri::command]
pub async fn check_deployment_consistency(
    pool: State<'_, DbPool>,
) -> Result<ConsistencyReport, AppError> {
    let t0 = std::time::Instant::now();
    info!("[check_deployment_consistency] 开始一致性检查");

    let rows: Vec<(String, String, String, String, Option<String>)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT sd.id, s.name, sd.tool, sd.path, sd.checksum
             FROM skill_deployments sd
             JOIN skills s ON sd.skill_id = s.id"
        )?;
        let result = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?.collect::<Result<Vec<_>, _>>()?;
        result
    };

    let total_deployments = rows.len();
    info!("[check_deployment_consistency] 共 {} 个部署，开始逐一检查 (DB查询耗时 {}ms)",
        total_deployments, t0.elapsed().as_millis());

    let mut synced = 0usize;
    let mut diverged = 0usize;
    let mut missing = 0usize;
    let mut details = Vec::new();
    let mut updates: Vec<(String, String)> = Vec::new();

    for (idx, (dep_id, skill_name, tool, deploy_path, db_checksum)) in rows.iter().enumerate() {
        let t_dep = std::time::Instant::now();
        let deploy_dir = PathBuf::from(deploy_path);
        let exists = deploy_dir.exists();

        // compute_dir_checksum 是阻塞 IO，必须在 spawn_blocking 中运行
        // 否则会阻塞 Tokio 异步运行时线程，导致整个命令挂起
        let deploy_checksum = if exists {
            let path = deploy_dir.clone();
            tokio::task::spawn_blocking(move || compute_dir_checksum(&path))
                .await
                .unwrap_or(None)
        } else {
            None
        };

        let elapsed_ms = t_dep.elapsed().as_millis();

        let status = if !exists {
            missing += 1;
            "missing"
        } else if db_checksum == &deploy_checksum {
            synced += 1;
            "synced"
        } else {
            diverged += 1;
            "diverged"
        };

        info!(
            "[check_deployment_consistency] [{}/{}] skill={} tool={} status={} elapsed={}ms | path={}",
            idx + 1, total_deployments, skill_name, tool, status, elapsed_ms, deploy_path
        );

        if elapsed_ms > 500 {
            info!(
                "[check_deployment_consistency]   ⚠ 慢路径 >500ms: db_checksum={:?} disk_checksum={:?}",
                db_checksum, deploy_checksum
            );
        }

        details.push(ConsistencyDetail {
            deployment_id: dep_id.clone(),
            skill_name: skill_name.clone(),
            tool: tool.clone(),
            deploy_path: deploy_path.clone(),
            status: status.to_string(),
            lib_checksum: db_checksum.clone(),
            deploy_checksum,
        });

        updates.push((dep_id.clone(), status.to_string()));
    }

    {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;
        for (dep_id, status) in &updates {
            tx.execute(
                "UPDATE skill_deployments SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![status, dep_id],
            )?;
        }
        tx.commit()?;
    }

    info!("[check_deployment_consistency] 全部完成: {} 总部署, {} 同步, {} 偏离, {} 缺失, 总耗时 {}ms",
        total_deployments, synced, diverged, missing, t0.elapsed().as_millis());

    Ok(ConsistencyReport {
        total_deployments,
        synced,
        diverged,
        missing,
        details,
    })
}

// ── 启动时全量对账 ──

#[derive(serde::Serialize)]
pub struct ReconcileReport {
    pub deployments_checked: usize,
    pub missing_detected: usize,
    pub diverged_detected: usize,
    pub untracked_found: usize,
    pub change_events_created: usize,
}

#[tauri::command]
pub async fn reconcile_all_deployments(
    pool: State<'_, DbPool>,
) -> Result<ReconcileReport, AppError> {
    info!("[reconcile] 开始全量对账...");

    // 1. 读取所有部署记录和对应 Skill 信息
    let deploy_rows: Vec<(String, String, String, String, Option<String>)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT sd.id, sd.skill_id, sd.tool, sd.path, sd.checksum
             FROM skill_deployments sd
             JOIN skills s ON sd.skill_id = s.id"
        )?;
        let result = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?.collect::<Result<Vec<_>, _>>()?;
        result
    };

    let deployments_checked = deploy_rows.len();
    let mut missing_detected = 0usize;
    let mut diverged_detected = 0usize;
    let mut events_to_create: Vec<(String, String, String, Option<String>, Option<String>)> = Vec::new();
    let mut status_updates: Vec<(String, String)> = Vec::new();

    for (dep_id, skill_id, _tool, deploy_path, db_checksum) in &deploy_rows {
        let _ = skill_id; // skill_id 在回写逻辑中使用
        let deploy_dir = Path::new(deploy_path);

        if !deploy_dir.exists() {
            missing_detected += 1;
            status_updates.push((dep_id.clone(), "missing".to_string()));
            events_to_create.push((
                dep_id.clone(),
                "deleted".to_string(),
                skill_id.clone(),
                db_checksum.clone(),
                None,
            ));
            info!("[reconcile] 部署缺失: {} (路径: {})", dep_id, deploy_path);
        } else {
            let current_checksum = compute_dir_checksum(deploy_dir);
            if db_checksum != &current_checksum {
                diverged_detected += 1;
                status_updates.push((dep_id.clone(), "diverged".to_string()));
                events_to_create.push((
                    dep_id.clone(),
                    "modified".to_string(),
                    skill_id.clone(),
                    db_checksum.clone(),
                    current_checksum.clone(),
                ));
                info!("[reconcile] 部署偏离: {} (db={:?}, disk={:?})", dep_id, db_checksum, current_checksum);
            } else {
                status_updates.push((dep_id.clone(), "synced".to_string()));
            }
        }
    }

    // 2. 扫描所有项目目录，检测未跟踪的 Skill
    let project_rows: Vec<(String, String)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare("SELECT id, path FROM projects")?;
        let result = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        result
    };

    let mut untracked_found = 0usize;
    let tracked_paths: std::collections::HashSet<String> = deploy_rows.iter().map(|(_, _, _, p, _)| p.clone()).collect();

    for (project_id, project_path) in &project_rows {
        for t in ALL_TOOLS {
            let (tool, tool_dir) = (t.id, t.project_dir);
            let skill_base = Path::new(project_path).join(tool_dir);
            if !skill_base.exists() || !skill_base.is_dir() {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(&skill_base) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let path_str = path.to_string_lossy().to_string();
                        if !tracked_paths.contains(&path_str) {
                            untracked_found += 1;
                            let skill_name = path.file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_default();
                            info!("[reconcile] 未跟踪 Skill: {} (项目: {}, 工具: {})", skill_name, project_id, tool);
                            events_to_create.push((
                                String::new(),
                                "created".to_string(),
                                format!("{}:{}:{}", project_id, tool, skill_name),
                                None,
                                compute_dir_checksum(&path),
                            ));
                        }
                    }
                }
            }
        }
    }

    // 3. 批量写入数据库
    // 只统计有真实 deployment_id 的事件（未跟踪 Skill 的 dep_id 为空，会跳过）
    let change_events_created = events_to_create.iter().filter(|(dep_id, ..)| !dep_id.is_empty()).count();
    {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;

        for (dep_id, status) in &status_updates {
            tx.execute(
                "UPDATE skill_deployments SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![status, dep_id],
            )?;
        }

        for (dep_id, event_type, _ref_id, old_cs, new_cs) in &events_to_create {
            // 未跟踪的 Skill（dep_id 为空）没有对应的 skill_deployments 记录，
            // 无法满足 change_events.deployment_id 的外键约束，跳过
            if dep_id.is_empty() {
                continue;
            }
            let event_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO change_events (id, deployment_id, event_type, old_checksum, new_checksum, resolution)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'pending')",
                params![event_id, dep_id, event_type, old_cs, new_cs],
            )?;
        }

        tx.commit()?;
    }

    info!("[reconcile] 对账完成: {} 已检查, {} 缺失, {} 偏离, {} 未跟踪, {} 事件已创建",
        deployments_checked, missing_detected, diverged_detected, untracked_found, change_events_created);

    Ok(ReconcileReport {
        deployments_checked,
        missing_detected,
        diverged_detected,
        untracked_found,
        change_events_created,
    })
}

// ── 部署→库 回写 ──

#[derive(serde::Serialize)]
pub struct UpdateLibraryResult {
    pub skill_id: String,
    pub skill_name: String,
    pub backup_id: Option<String>,
    pub new_checksum: Option<String>,
    pub other_deployments_synced: usize,
}

#[tauri::command]
pub async fn update_library_from_deployment(
    deployment_id: String,
    sync_other_deployments: bool,
    pool: State<'_, DbPool>,
) -> Result<UpdateLibraryResult, AppError> {
    info!("[update_library_from_deployment] deployment_id={}, sync_others={}", deployment_id, sync_other_deployments);

    // 1. 查询部署记录和关联 Skill 信息
    let (skill_id, skill_name, deploy_path, old_checksum) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT sd.skill_id, s.name, sd.path, s.checksum
             FROM skill_deployments sd
             JOIN skills s ON sd.skill_id = s.id
             WHERE sd.id = ?1",
            params![deployment_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            )),
        ).map_err(|_| AppError::NotFound(format!("部署记录不存在: {}", deployment_id)))?
    };

    let deploy_dir = Path::new(&deploy_path);
    if !deploy_dir.exists() || !deploy_dir.is_dir() {
        return Err(AppError::Validation(format!("部署目录不存在: {}", deploy_path)));
    }

    // 2. 备份当前 DB 中的 Skill 文件到文件系统
    let backup_id = {
        let conn = pool.get()?;
        if has_db_files(&conn, &skill_id) {
            let backup_base = dirs::home_dir()
                .unwrap_or_default()
                .join(".skills-manager")
                .join("backups")
                .join(&skill_name);
            let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
            let backup_path = backup_base.join(&timestamp);

            match db_export_to_dir(&conn, &skill_id, &backup_path) {
                Ok(_) => {
                    let bid = Uuid::new_v4().to_string();
                    let bp_str = backup_path.to_string_lossy().to_string();
                    conn.execute(
                        "INSERT INTO skill_backups (id, skill_id, version_label, backup_path, checksum, reason)
                         VALUES (?1, ?2, ?3, ?4, ?5, 'before_lib_update')",
                        params![bid, skill_id, timestamp, bp_str, old_checksum],
                    )?;
                    info!("[update_library_from_deployment] 已备份当前 DB 版本到: {}", bp_str);
                    Some(bid)
                }
                Err(e) => {
                    info!("[update_library_from_deployment] 备份失败（继续）: {}", e);
                    None
                }
            }
        } else {
            None
        }
    };

    // 3. 将部署目录文件导入到 DB skill_files（覆盖）
    {
        let conn = pool.get()?;
        // 先清空旧 DB 文件
        conn.execute("DELETE FROM skill_files WHERE skill_id = ?1", params![skill_id])?;
        let files_imported = db_import_from_dir(&conn, &skill_id, deploy_dir)?;
        info!("[update_library_from_deployment] 已导入 {} 个文件到 DB", files_imported);
    }

    let new_checksum = {
        let conn = pool.get()?;
        compute_db_checksum(&conn, &skill_id)
    };

    info!("[update_library_from_deployment] DB 回写完成, checksum={:?}", new_checksum);

    // 4. 更新数据库
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
        conn.execute(
            "UPDATE skill_deployments SET checksum = ?1, status = 'synced',
                    last_synced = datetime('now'), updated_at = datetime('now')
             WHERE id = ?2",
            params![new_checksum, deployment_id],
        )?;
    }

    // 5. 可选：同步到其他部署位置（从 DB 读出写出）
    let mut other_deployments_synced = 0usize;
    if sync_other_deployments {
        let other_deploys: Vec<(String, String)> = {
            let conn = pool.get()?;
            let mut stmt = conn.prepare(
                "SELECT id, path FROM skill_deployments WHERE skill_id = ?1 AND id != ?2"
            )?;
            let result = stmt.query_map(params![skill_id, deployment_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?.collect::<Result<Vec<_>, _>>()?;
            result
        };

        for (dep_id, dep_path) in &other_deploys {
            let dst = Path::new(dep_path);
            if dst.exists() {
                let _ = std::fs::remove_dir_all(dst);
            }
            let conn = pool.get()?;
            let _ = db_export_to_dir(&conn, &skill_id, dst);
            let dep_checksum = compute_dir_checksum(dst);

            conn.execute(
                "UPDATE skill_deployments SET checksum = ?1, status = 'synced',
                        last_synced = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?2",
                params![dep_checksum, dep_id],
            )?;
            other_deployments_synced += 1;
        }
        info!("[update_library_from_deployment] 已同步 {} 个其他部署", other_deployments_synced);
    }
    // 6. 写入同步历史
    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO sync_history (id, skill_id, deployment_id, action, from_checksum, to_checksum, status, created_at)
             VALUES (?1, ?2, ?3, 'update', ?4, ?5, 'success', datetime('now'))",
            params![Uuid::new_v4().to_string(), skill_id, deployment_id, old_checksum, new_checksum],
        )?;
    }

    Ok(UpdateLibraryResult {
        skill_id,
        skill_name,
        backup_id,
        new_checksum,
        other_deployments_synced,
    })
}

// ── get_skills_by_tool (按工具分组查询) ──

#[derive(serde::Serialize)]
pub struct ToolSkillInfo {
    pub skill_id: String,
    pub skill_name: String,
    pub skill_description: String,
    pub deployment_id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub deploy_path: String,
    pub status: String,
    pub checksum: Option<String>,
    pub last_synced: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ToolGroupResult {
    pub tool: String,
    pub skills: Vec<ToolSkillInfo>,
    pub count: usize,
}

#[tauri::command]
pub async fn get_skills_by_tool(
    tool: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<ToolGroupResult>, AppError> {
    info!("[get_skills_by_tool] tool={:?}", tool);

    let conn = pool.get()?;

    let tools: Vec<String> = if let Some(ref t) = tool {
        info!("[get_skills_by_tool] 查询指定工具: {}", t);
        vec![t.clone()]
    } else {
        info!("[get_skills_by_tool] 查询所有工具");
        let mut stmt = conn.prepare(
            "SELECT DISTINCT tool FROM skill_deployments ORDER BY tool"
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        info!("[get_skills_by_tool] 发现 {} 种工具: {:?}", rows.len(), rows);
        rows
    };

    let mut results = Vec::new();

    for t in &tools {
        let mut stmt = conn.prepare(
            "SELECT d.id, d.skill_id, d.project_id, d.path, d.status, d.checksum, d.last_synced,
                    s.name, s.description,
                    p.name as project_name
             FROM skill_deployments d
             JOIN skills s ON s.id = d.skill_id
             LEFT JOIN projects p ON p.id = d.project_id
             WHERE d.tool = ?1
             ORDER BY s.name, p.name"
        )?;

        let skills: Vec<ToolSkillInfo> = stmt.query_map(params![t], |row| {
            Ok(ToolSkillInfo {
                deployment_id: row.get(0)?,
                skill_id: row.get(1)?,
                project_id: row.get(2)?,
                deploy_path: row.get(3)?,
                status: row.get(4)?,
                checksum: row.get(5)?,
                last_synced: row.get(6)?,
                skill_name: row.get(7)?,
                skill_description: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                project_name: row.get(9)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        let count = skills.len();
        info!(
            "[get_skills_by_tool] 工具 '{}': {} 个部署",
            t, count
        );

        for skill in &skills {
            info!(
                "[get_skills_by_tool]   {} | project={:?} | status={} | path={}",
                skill.skill_name, skill.project_name, skill.status, skill.deploy_path
            );
        }

        results.push(ToolGroupResult {
            tool: t.clone(),
            skills,
            count,
        });
    }

    let total: usize = results.iter().map(|r| r.count).sum();
    info!(
        "[get_skills_by_tool] 完成: {} 种工具, 共 {} 个部署",
        results.len(), total
    );

    Ok(results)
}
