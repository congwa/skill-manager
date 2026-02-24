use log::info;
use rusqlite::params;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

use super::skill_files::{compute_db_checksum, db_import_from_dir, has_db_files};
use super::utils::compute_dir_checksum;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{ScanResult, ScannedSkill};
use crate::tools::ALL_TOOLS;

#[tauri::command]
pub async fn scan_project(project_path: String) -> Result<ScanResult, AppError> {
    info!("[scan_project] 开始扫描项目: {}", project_path);
    let base = PathBuf::from(&project_path);
    if !base.exists() || !base.is_dir() {
        return Err(AppError::Validation(format!("路径不存在或不是目录: {}", project_path)));
    }

    let project_name = base
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let mut tools = Vec::new();
    let mut skills = Vec::new();

    for t in ALL_TOOLS {
        let (tool, dir) = (t.id, t.project_dir);
        let skill_dir = base.join(dir);
        if skill_dir.exists() && skill_dir.is_dir() {
            tools.push(tool.to_string());

            if let Ok(entries) = std::fs::read_dir(&skill_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let skill_md = path.join("SKILL.md");
                        if skill_md.exists() {
                            let (name, description, version) = parse_skill_md(&skill_md);
                            skills.push(ScannedSkill {
                                name,
                                description,
                                version,
                                tool: tool.to_string(),
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    info!("[scan_project] 扫描完成: 发现 {} 个工具, {} 个 Skill", tools.len(), skills.len());
    Ok(ScanResult {
        project_name,
        project_path,
        tools,
        skills,
    })
}

#[tauri::command]
pub async fn scan_and_import_project(
    project_path: String,
    pool: State<'_, DbPool>,
) -> Result<ScanResult, AppError> {
    info!("[scan_and_import] 开始扫描并导入: {}", project_path);
    let scan_result = scan_project(project_path.clone()).await?;

    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;

    let project_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT OR IGNORE INTO projects (id, name, path, last_scanned)
         VALUES (?1, ?2, ?3, datetime('now'))",
        params![project_id, scan_result.project_name, scan_result.project_path],
    )?;

    let actual_project_id: String = tx.query_row(
        "SELECT id FROM projects WHERE path = ?1",
        params![scan_result.project_path],
        |row| row.get(0),
    )?;

    tx.execute(
        "UPDATE projects SET last_scanned = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1",
        params![actual_project_id],
    )?;

    for skill in &scan_result.skills {
        let skill_id = Uuid::new_v4().to_string();

        let checksum = compute_dir_checksum(Path::new(&skill.path));

        tx.execute(
            "INSERT OR IGNORE INTO skills (id, name, description, version, checksum, last_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            params![skill_id, skill.name, skill.description, skill.version, checksum],
        )?;

        let actual_skill_id: String = tx.query_row(
            "SELECT id FROM skills WHERE name = ?1",
            params![skill.name],
            |row| row.get(0),
        )?;

        // 将扫描到的 Skill 文件导入到 DB skill_files 表（权威源）
        let skill_src = Path::new(&skill.path);
        if skill_src.exists() && !has_db_files(&tx, &actual_skill_id) {
            match db_import_from_dir(&tx, &actual_skill_id, skill_src) {
                Ok(n) => {
                    info!("[scan_and_import] 已导入 '{}' 到 DB: {} 个文件", skill.name, n);
                    // 从 DB 内容重新计算 checksum，保证一致性
                    let db_cs = compute_db_checksum(&tx, &actual_skill_id);
                    let _ = tx.execute(
                        "UPDATE skills SET checksum = ?1 WHERE id = ?2",
                        params![db_cs, actual_skill_id],
                    );
                }
                Err(e) => {
                    info!("[scan_and_import] 导入 '{}' 到 DB 失败: {}", skill.name, e);
                }
            }
        }

        tx.execute(
            "INSERT OR IGNORE INTO skill_sources (id, skill_id, source_type)
             VALUES (?1, ?2, 'local')",
            params![Uuid::new_v4().to_string(), actual_skill_id],
        )?;

        let deployment_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT OR IGNORE INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'synced', datetime('now'))",
            params![
                deployment_id,
                actual_skill_id,
                actual_project_id,
                skill.tool,
                skill.path,
                checksum,
            ],
        )?;
    }

    tx.commit()?;
    info!("[scan_and_import] 导入完成: {} 个 Skill 已入库", scan_result.skills.len());

    Ok(scan_result)
}


#[derive(serde::Serialize)]
pub struct GlobalScanResult {
    pub tools_found: Vec<String>,
    pub skills_imported: usize,
    pub deployments_created: usize,
}

/// 核心扫描逻辑，可被 Tauri command 和启动任务共同调用
pub async fn scan_global_skills_internal(pool: &DbPool) -> Result<GlobalScanResult, AppError> {
    info!("[scan_global] 开始扫描全局工具目录...");
    let home = dirs::home_dir().expect("Cannot find home directory");
    let mut tools_found = Vec::new();
    let mut all_skills: Vec<(String, ScannedSkill)> = Vec::new();

    for t in ALL_TOOLS {
        let (tool, dir) = (t.id, t.global_dir);
        let global_dir = home.join(dir);
        if global_dir.exists() && global_dir.is_dir() {
            tools_found.push(tool.to_string());
            if let Ok(entries) = std::fs::read_dir(&global_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let skill_md = path.join("SKILL.md");
                        if skill_md.exists() {
                            let (name, description, version) = parse_skill_md(&skill_md);
                            all_skills.push((tool.to_string(), ScannedSkill {
                                name,
                                description,
                                version,
                                tool: tool.to_string(),
                                path: path.to_string_lossy().to_string(),
                            }));
                        } else {
                            let name = path.file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| "unknown".to_string());
                            all_skills.push((tool.to_string(), ScannedSkill {
                                name,
                                description: None,
                                version: None,
                                tool: tool.to_string(),
                                path: path.to_string_lossy().to_string(),
                            }));
                        }
                    }
                }
            }
        }
    }

    let skills_imported;
    let deployments_created;

    {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;

        let mut skill_count = 0usize;
        let mut deploy_count = 0usize;

        for (_tool, skill) in &all_skills {
            let skill_id = Uuid::new_v4().to_string();

            let checksum = compute_dir_checksum(Path::new(&skill.path));

            let inserted = tx.execute(
                "INSERT OR IGNORE INTO skills (id, name, description, version, checksum, last_modified)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                params![skill_id, skill.name, skill.description, skill.version, checksum],
            )?;

            if inserted > 0 {
                skill_count += 1;
            }

            let actual_skill_id: String = tx.query_row(
                "SELECT id FROM skills WHERE name = ?1",
                params![skill.name],
                |row| row.get(0),
            )?;

            // 将文件导入到 DB skill_files（仅当 DB 中还没有文件时）
            let skill_src = Path::new(&skill.path);
            if skill_src.exists() && !has_db_files(&tx, &actual_skill_id) {
                match db_import_from_dir(&tx, &actual_skill_id, skill_src) {
                    Ok(n) => {
                        info!("[scan_global] 已导入 '{}' 到 DB: {} 个文件", skill.name, n);
                        let db_cs = compute_db_checksum(&tx, &actual_skill_id);
                        let _ = tx.execute(
                            "UPDATE skills SET checksum = ?1 WHERE id = ?2",
                            params![db_cs, actual_skill_id],
                        );
                    }
                    Err(e) => {
                        info!("[scan_global] 导入 '{}' 到 DB 失败: {}", skill.name, e);
                    }
                }
            }

            tx.execute(
                "INSERT OR IGNORE INTO skill_sources (id, skill_id, source_type)
                 VALUES (?1, ?2, 'local')",
                params![Uuid::new_v4().to_string(), actual_skill_id],
            )?;

            let deployment_id = Uuid::new_v4().to_string();
            let dep_inserted = tx.execute(
                "INSERT OR IGNORE INTO skill_deployments (id, skill_id, project_id, tool, path, checksum, status, last_synced)
                 VALUES (?1, ?2, NULL, ?3, ?4, ?5, 'synced', datetime('now'))",
                params![
                    deployment_id,
                    actual_skill_id,
                    skill.tool,
                    skill.path,
                    checksum,
                ],
            )?;

            if dep_inserted > 0 {
                deploy_count += 1;
            }
        }

        tx.commit()?;
        skills_imported = skill_count;
        deployments_created = deploy_count;
    }

    info!("[scan_global] 扫描完成: 发现工具 {:?}, 导入 {} 个 Skill, 创建 {} 个部署",
        tools_found, skills_imported, deployments_created);
    Ok(GlobalScanResult {
        tools_found,
        skills_imported,
        deployments_created,
    })
}

#[tauri::command]
pub async fn scan_global_skills(
    pool: State<'_, DbPool>,
) -> Result<GlobalScanResult, AppError> {
    scan_global_skills_internal(&pool).await
}

fn parse_skill_md(path: &Path) -> (String, Option<String>, Option<String>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => {
            let name = path
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            return (name, None, None);
        }
    };

    let mut name = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let mut description = None;
    let mut version = None;

    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let frontmatter = &content[3..3 + end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("name:") {
                    let val = val.trim().trim_matches('"').trim_matches('\'');
                    if !val.is_empty() {
                        name = val.to_string();
                    }
                } else if let Some(val) = line.strip_prefix("description:") {
                    let val = val.trim().trim_matches('"').trim_matches('\'');
                    if !val.is_empty() {
                        description = Some(val.to_string());
                    }
                } else if let Some(val) = line.strip_prefix("version:") {
                    let val = val.trim().trim_matches('"').trim_matches('\'');
                    if !val.is_empty() {
                        version = Some(val.to_string());
                    }
                }
            }
        }
    }

    (name, description, version)
}

// compute_dir_checksum 已移到 commands::utils 公共模块
