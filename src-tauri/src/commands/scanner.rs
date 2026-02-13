use rusqlite::params;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{ScanResult, ScannedSkill};

const TOOL_DIRS: &[(&str, &str)] = &[
    ("windsurf", ".windsurf/skills"),
    ("cursor", ".cursor/skills"),
    ("claude-code", ".claude/skills"),
    ("codex", ".agents/skills"),
    ("trae", ".trae/skills"),
];

#[tauri::command]
pub async fn scan_project(project_path: String) -> Result<ScanResult, AppError> {
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

    for (tool, dir) in TOOL_DIRS {
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

        let home = dirs::home_dir().expect("Cannot find home directory");
        let local_path = home
            .join(".skills-manager")
            .join("skills")
            .join(&skill.name)
            .to_string_lossy()
            .to_string();

        let checksum = compute_dir_checksum(Path::new(&skill.path));

        tx.execute(
            "INSERT OR IGNORE INTO skills (id, name, description, version, checksum, local_path, last_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
            params![skill_id, skill.name, skill.description, skill.version, checksum, local_path],
        )?;

        let actual_skill_id: String = tx.query_row(
            "SELECT id FROM skills WHERE name = ?1",
            params![skill.name],
            |row| row.get(0),
        )?;

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

    Ok(scan_result)
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

fn compute_dir_checksum(dir: &Path) -> Option<String> {
    let mut hasher = Sha256::new();
    let mut found_files = false;

    let mut paths: Vec<PathBuf> = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();

    paths.sort();

    for path in paths {
        if let Ok(content) = std::fs::read(&path) {
            let relative = path.strip_prefix(dir).unwrap_or(&path);
            hasher.update(relative.to_string_lossy().as_bytes());
            hasher.update(&content);
            found_files = true;
        }
    }

    if found_files {
        Some(hex::encode(hasher.finalize()))
    } else {
        None
    }
}
