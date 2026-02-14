use log::info;
use rusqlite::params;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

use super::utils::{compute_dir_checksum, copy_dir_recursive};
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

// ── 文件操作命令 ──

const TOOL_SKILL_DIRS: &[(&str, &str)] = &[
    ("windsurf", ".windsurf/skills"),
    ("cursor", ".cursor/skills"),
    ("claude-code", ".claude/skills"),
    ("codex", ".agents/skills"),
    ("trae", ".trae/skills"),
];

fn tool_skill_subdir(tool: &str) -> Option<&'static str> {
    TOOL_SKILL_DIRS.iter().find(|(t, _)| *t == tool).map(|(_, d)| *d)
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

    let (skill_name, skill_local_path, project_path) = {
        let conn = pool.get()?;

        let (name, local_path): (String, String) = conn.query_row(
            "SELECT name, local_path FROM skills WHERE id = ?1",
            params![skill_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| AppError::NotFound(format!("Skill 不存在: {}", skill_id)))?;

        let proj_path: String = conn.query_row(
            "SELECT path FROM projects WHERE id = ?1",
            params![project_id],
            |row| row.get(0),
        ).map_err(|_| AppError::NotFound(format!("项目不存在: {}", project_id)))?;

        (name, local_path, proj_path)
    };

    let src = Path::new(&skill_local_path);
    if !src.exists() || !src.is_dir() {
        return Err(AppError::Validation(format!(
            "Skill 本地路径不存在: {}，请先确保 Skill 已同步到本地库",
            skill_local_path
        )));
    }

    let dst = Path::new(&project_path).join(tool_subdir).join(&skill_name);
    let deploy_path = dst.to_string_lossy().to_string();
    let lib_checksum = compute_dir_checksum(src);

    // 冲突检测：目标目录已存在时检查内容是否一致
    if dst.exists() && dst.is_dir() && !force {
        let existing_checksum = compute_dir_checksum(&dst);
        if lib_checksum == existing_checksum {
            // 内容一致，跳过复制，仅确保数据库记录存在
            info!("[deploy_skill_to_project] 目标已存在且内容一致，跳过复制");
            let deployment_id = Uuid::new_v4().to_string();
            let conn = pool.get()?;
            conn.execute(
                "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'synced', datetime('now'))
                 ON CONFLICT(skill_id, project_id, tool) DO UPDATE SET
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
        } else {
            // 内容不同，返回冲突信息，不覆盖
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

    // 无冲突或 force=true，执行部署
    if dst.exists() && force {
        info!("[deploy_skill_to_project] 强制覆盖目标目录");
        std::fs::remove_dir_all(&dst)?;
    }

    info!("[deploy_skill_to_project] 复制文件: {} -> {}", src.display(), dst.display());
    let files_copied = copy_dir_recursive(src, &dst)?;
    let checksum = compute_dir_checksum(&dst);

    info!("[deploy_skill_to_project] 复制完成: {} 个文件, checksum={:?}", files_copied, checksum);

    let deployment_id = Uuid::new_v4().to_string();

    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'synced', datetime('now'))
             ON CONFLICT(skill_id, project_id, tool) DO UPDATE SET
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

const GLOBAL_TOOL_DIRS: &[(&str, &str)] = &[
    ("windsurf", ".codeium/windsurf/skills"),
    ("cursor", ".cursor/skills"),
    ("claude-code", ".claude/skills"),
    ("codex", ".agents/skills"),
    ("trae", ".trae/skills"),
];

fn global_tool_dir(tool: &str) -> Option<&'static str> {
    GLOBAL_TOOL_DIRS.iter().find(|(t, _)| *t == tool).map(|(_, d)| *d)
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

    let (skill_name, skill_local_path) = {
        let conn = pool.get()?;
        let (name, local_path): (String, String) = conn.query_row(
            "SELECT name, local_path FROM skills WHERE id = ?1",
            params![skill_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| AppError::NotFound(format!("Skill 不存在: {}", skill_id)))?;
        (name, local_path)
    };

    let src = Path::new(&skill_local_path);
    if !src.exists() || !src.is_dir() {
        return Err(AppError::Validation(format!(
            "Skill 本地路径不存在: {}",
            skill_local_path
        )));
    }

    let dst = home.join(global_subdir).join(&skill_name);
    let deploy_path = dst.to_string_lossy().to_string();
    let lib_checksum = compute_dir_checksum(src);

    if dst.exists() && dst.is_dir() && !force {
        let existing_checksum = compute_dir_checksum(&dst);
        if lib_checksum == existing_checksum {
            info!("[deploy_skill_global] 目标已存在且内容一致，跳过复制");
            let deployment_id = Uuid::new_v4().to_string();
            let conn = pool.get()?;
            conn.execute(
                "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
                 VALUES (?1, ?2, NULL, ?3, ?4, ?5, 'synced', datetime('now'))
                 ON CONFLICT(skill_id, project_id, tool) DO UPDATE SET
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
        } else if !force {
            info!("[deploy_skill_global] 目标已存在且内容不同");
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

    std::fs::create_dir_all(dst.parent().unwrap_or(&dst))?;
    info!("[deploy_skill_global] 复制: {} -> {}", src.display(), dst.display());
    let files_copied = copy_dir_recursive(src, &dst)?;
    let checksum = compute_dir_checksum(&dst);
    info!("[deploy_skill_global] 完成: {} 个文件, checksum={:?}", files_copied, checksum);

    let deployment_id = Uuid::new_v4().to_string();
    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
             VALUES (?1, ?2, NULL, ?3, ?4, ?5, 'synced', datetime('now'))
             ON CONFLICT(skill_id, project_id, tool) DO UPDATE SET
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

    let (skill_local_path, deploy_path, old_checksum) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT s.local_path, sd.path, sd.checksum
             FROM skill_deployments sd
             JOIN skills s ON sd.skill_id = s.id
             WHERE sd.id = ?1",
            params![deployment_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            )),
        ).map_err(|_| AppError::NotFound(format!("部署记录不存在: {}", deployment_id)))?
    };

    let src = Path::new(&skill_local_path);
    if !src.exists() || !src.is_dir() {
        return Err(AppError::Validation(format!(
            "Skill 本地路径不存在: {}",
            skill_local_path
        )));
    }

    let dst = Path::new(&deploy_path);

    if dst.exists() {
        std::fs::remove_dir_all(dst)?;
    }

    info!("[sync_deployment] 同步文件: {} -> {}", src.display(), dst.display());
    let files_copied = copy_dir_recursive(src, dst)?;
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
    info!("[check_deployment_consistency] 开始一致性检查");

    let rows: Vec<(String, String, String, String, String)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT sd.id, s.name, sd.tool, sd.path, s.local_path
             FROM skill_deployments sd
             JOIN skills s ON sd.skill_id = s.id"
        )?;
        let result = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?.collect::<Result<Vec<_>, _>>()?;
        result
    };

    let total_deployments = rows.len();
    let mut synced = 0usize;
    let mut diverged = 0usize;
    let mut missing = 0usize;
    let mut details = Vec::new();
    let mut updates: Vec<(String, String)> = Vec::new();

    for (dep_id, skill_name, tool, deploy_path, local_path) in &rows {
        let deploy_dir = Path::new(deploy_path);
        let lib_dir = Path::new(local_path);

        let lib_checksum = compute_dir_checksum(lib_dir);
        let deploy_checksum = if deploy_dir.exists() {
            compute_dir_checksum(deploy_dir)
        } else {
            None
        };

        let status = if !deploy_dir.exists() {
            missing += 1;
            "missing"
        } else if lib_checksum == deploy_checksum {
            synced += 1;
            "synced"
        } else {
            diverged += 1;
            "diverged"
        };

        details.push(ConsistencyDetail {
            deployment_id: dep_id.clone(),
            skill_name: skill_name.clone(),
            tool: tool.clone(),
            deploy_path: deploy_path.clone(),
            status: status.to_string(),
            lib_checksum,
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

    info!("[check_deployment_consistency] 检查完成: {} 总部署, {} 同步, {} 偏离, {} 缺失",
        total_deployments, synced, diverged, missing);

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
    let deploy_rows: Vec<(String, String, String, String, String, Option<String>)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT sd.id, sd.skill_id, sd.tool, sd.path, s.local_path, sd.checksum
             FROM skill_deployments sd
             JOIN skills s ON sd.skill_id = s.id"
        )?;
        let result = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?.collect::<Result<Vec<_>, _>>()?;
        result
    };

    let deployments_checked = deploy_rows.len();
    let mut missing_detected = 0usize;
    let mut diverged_detected = 0usize;
    let mut events_to_create: Vec<(String, String, String, Option<String>, Option<String>)> = Vec::new();
    let mut status_updates: Vec<(String, String)> = Vec::new();

    for (dep_id, skill_id, _tool, deploy_path, _local_path, db_checksum) in &deploy_rows {
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
    let tracked_paths: std::collections::HashSet<String> = deploy_rows.iter().map(|(_, _, _, p, _, _)| p.clone()).collect();

    for (project_id, project_path) in &project_rows {
        for (tool, tool_dir) in TOOL_SKILL_DIRS {
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
    let change_events_created = events_to_create.len();
    {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;

        for (dep_id, status) in &status_updates {
            tx.execute(
                "UPDATE skill_deployments SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![status, dep_id],
            )?;
        }

        for (dep_id, event_type, ref_id, old_cs, new_cs) in &events_to_create {
            let event_id = Uuid::new_v4().to_string();
            let deployment_id = if dep_id.is_empty() { ref_id } else { dep_id };
            tx.execute(
                "INSERT INTO change_events (id, deployment_id, event_type, old_checksum, new_checksum, resolution)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'pending')",
                params![event_id, deployment_id, event_type, old_cs, new_cs],
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
    let (skill_id, skill_name, local_path, deploy_path, old_checksum) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT sd.skill_id, s.name, s.local_path, sd.path, s.checksum
             FROM skill_deployments sd
             JOIN skills s ON sd.skill_id = s.id
             WHERE sd.id = ?1",
            params![deployment_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            )),
        ).map_err(|_| AppError::NotFound(format!("部署记录不存在: {}", deployment_id)))?
    };

    let deploy_dir = Path::new(&deploy_path);
    if !deploy_dir.exists() || !deploy_dir.is_dir() {
        return Err(AppError::Validation(format!("部署目录不存在: {}", deploy_path)));
    }

    let lib_dir = Path::new(&local_path);

    // 2. 备份当前本地 Skill 库版本
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
                 VALUES (?1, ?2, ?3, ?4, ?5, 'before_lib_update')",
                params![bid, skill_id, timestamp, bp_str, old_checksum],
            )?;
            info!("[update_library_from_deployment] 已备份当前库版本: {}", bp_str);
            Some(bid)
        } else {
            None
        }
    };

    // 3. 用部署目录内容覆盖本地 Skill 库
    if lib_dir.exists() {
        std::fs::remove_dir_all(lib_dir)?;
    }
    let files_copied = copy_dir_recursive(deploy_dir, lib_dir)?;
    let new_checksum = compute_dir_checksum(lib_dir);

    info!("[update_library_from_deployment] 回写完成: {} 个文件, checksum={:?}", files_copied, new_checksum);

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
        // 更新当前部署记录为 synced
        conn.execute(
            "UPDATE skill_deployments SET checksum = ?1, status = 'synced',
                    last_synced = datetime('now'), updated_at = datetime('now')
             WHERE id = ?2",
            params![new_checksum, deployment_id],
        )?;
    }

    // 5. 可选：同步到其他部署位置
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
            let _ = copy_dir_recursive(lib_dir, dst);
            let dep_checksum = compute_dir_checksum(dst);

            let conn = pool.get()?;
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
             VALUES (?1, ?2, ?3, 'lib_update', ?4, ?5, 'success', datetime('now'))",
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
