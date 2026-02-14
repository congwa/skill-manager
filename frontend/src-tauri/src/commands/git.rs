use log::info;
use rusqlite::params;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;
use uuid::Uuid;

use super::utils::{compute_dir_checksum, copy_dir_recursive};
use crate::db::DbPool;
use crate::error::AppError;

// ── 返回类型 ──

#[derive(Debug, Clone, Serialize)]
pub struct GitTestResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitExportResult {
    pub skills_exported: usize,
    pub commit_hash: Option<String>,
    pub pushed: bool,
    pub message: String,
    pub diverged_count: usize,
    pub diverged_skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitCloneResult {
    pub clone_path: String,
    pub skills_found: Vec<GitRepoSkill>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitRepoSkill {
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub status: String, // "new" | "exists_same" | "exists_conflict"
    pub local_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitImportResult {
    pub skills_imported: usize,
    pub skills_skipped: usize,
    pub skills_updated: usize,
    pub message: String,
}

// ── Helper: 运行 git 命令 ──

fn run_git(args: &[&str], cwd: &Path) -> Result<String, AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| AppError::Internal(format!("git 命令执行失败: {}", e)))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::Internal(format!(
            "git {} 失败: {}",
            args.join(" "),
            stderr
        )))
    }
}

fn run_git_allow_fail(args: &[&str], cwd: &Path) -> (bool, String) {
    match Command::new("git").args(args).current_dir(cwd).output() {
        Ok(output) => {
            let out = if output.status.success() {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            } else {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            };
            (output.status.success(), out)
        }
        Err(e) => (false, format!("执行失败: {}", e)),
    }
}

// ── Helper: 解析 SKILL.md frontmatter ──

fn parse_skill_frontmatter(content: &str) -> (Option<String>, Option<String>, Option<String>) {
    let mut name = None;
    let mut description = None;
    let mut version = None;

    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let frontmatter = &content[3..3 + end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("name:") {
                    name = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
                } else if let Some(val) = line.strip_prefix("description:") {
                    description = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
                } else if let Some(val) = line.strip_prefix("version:") {
                    version = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
                }
            }
        }
    }

    (name, description, version)
}

// ── Helper: 获取 skills 库路径 ──

fn get_skills_lib_path(pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>) -> Result<PathBuf, AppError> {
    let conn = pool.get()?;
    let path: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'skills_lib_path'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(None);

    let raw = path
        .map(|p| {
            let p = p.trim_matches('"').to_string();
            if p.starts_with("~/") {
                if let Some(home) = dirs::home_dir() {
                    return home.join(&p[2..]).to_string_lossy().to_string();
                }
            }
            p
        })
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_default()
                .join(".skills-manager/skills")
                .to_string_lossy()
                .to_string()
        });

    Ok(PathBuf::from(raw))
}

// ── 1. test_git_connection ──

#[tauri::command]
pub async fn test_git_connection(
    remote_url: String,
    auth_type: String,
) -> Result<GitTestResult, AppError> {
    info!(
        "[test_git_connection] 测试连接: url={}, auth={}",
        remote_url, auth_type
    );

    let temp_dir = std::env::temp_dir().join("skills-manager-git-test");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| AppError::Internal(format!("创建临时目录失败: {}", e)))?;

    let (success, msg) = run_git_allow_fail(&["ls-remote", "--exit-code", &remote_url], &temp_dir);

    let _ = std::fs::remove_dir_all(&temp_dir);

    if success {
        Ok(GitTestResult {
            success: true,
            message: "连接成功".to_string(),
        })
    } else {
        Ok(GitTestResult {
            success: false,
            message: format!("连接失败: {}", msg),
        })
    }
}

// ── 2. export_skills_to_git ──

#[tauri::command]
pub async fn export_skills_to_git(
    config_id: String,
    pool: State<'_, DbPool>,
) -> Result<GitExportResult, AppError> {
    info!("[export_skills_to_git] 开始导出, config_id={}", config_id);

    let conn = pool.get()?;

    // 查询 Git 配置
    let (remote_url, branch): (String, String) = conn.query_row(
        "SELECT remote_url, branch FROM git_export_config WHERE id = ?1",
        params![config_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    info!(
        "[export_skills_to_git] remote={}, branch={}",
        remote_url, branch
    );

    // 获取 skills 库路径
    let skills_lib = get_skills_lib_path(&pool)?;

    // 准备导出目录
    let export_dir = std::env::temp_dir().join("skills-manager-export");
    if export_dir.exists() {
        std::fs::remove_dir_all(&export_dir)
            .map_err(|e| AppError::Internal(format!("清理导出目录失败: {}", e)))?;
    }

    // 尝试 clone 现有仓库（如果存在）
    let (clone_ok, _) = run_git_allow_fail(
        &[
            "clone",
            "--branch",
            &branch,
            "--single-branch",
            "--depth",
            "1",
            &remote_url,
            export_dir.to_str().unwrap_or(""),
        ],
        &std::env::temp_dir(),
    );

    if !clone_ok {
        // 仓库不存在或空仓库，初始化新仓库
        std::fs::create_dir_all(&export_dir)
            .map_err(|e| AppError::Internal(format!("创建导出目录失败: {}", e)))?;
        run_git(&["init"], &export_dir)?;
        run_git(&["remote", "add", "origin", &remote_url], &export_dir)?;
        run_git(&["checkout", "-b", &branch], &export_dir)?;
    }

    // 清理导出目录中的 skills/ 文件夹（保留 .git）
    let export_skills_dir = export_dir.join("skills");
    if export_skills_dir.exists() {
        std::fs::remove_dir_all(&export_skills_dir)
            .map_err(|e| AppError::Internal(format!("清理 skills 目录失败: {}", e)))?;
    }
    std::fs::create_dir_all(&export_skills_dir)
        .map_err(|e| AppError::Internal(format!("创建 skills 目录失败: {}", e)))?;

    // ── 导出前一致性检查 ──
    info!("[export_skills_to_git] 执行导出前一致性检查...");
    let mut div_stmt = conn.prepare(
        "SELECT s.name, d.tool, d.path, d.status
         FROM skill_deployments d
         JOIN skills s ON s.id = d.skill_id
         WHERE d.status IN ('diverged', 'missing')
         ORDER BY s.name"
    )?;
    let diverged_list: Vec<(String, String, String, String)> = div_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?,
            row.get::<_, String>(2)?, row.get::<_, String>(3)?))
    })?.collect::<Result<Vec<_>, _>>()?;

    let diverged_skill_names: Vec<String> = diverged_list.iter()
        .map(|(name, _, _, _)| name.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let diverged_count = diverged_list.len();

    if diverged_count > 0 {
        info!(
            "[export_skills_to_git] ⚠️ 发现 {} 个偏离/缺失部署（涉及 {} 个 Skill）:",
            diverged_count, diverged_skill_names.len()
        );
        for (name, tool, path, status) in &diverged_list {
            info!(
                "[export_skills_to_git]   {} | tool={} | status={} | path={}",
                name, tool, status, path
            );
        }
        info!("[export_skills_to_git] 继续导出（以本地库为准）...");
    } else {
        info!("[export_skills_to_git] ✅ 所有部署状态正常，无偏离");
    }

    // 查询所有 Skill 并复制
    let mut stmt = conn.prepare(
        "SELECT id, name, description, version, local_path FROM skills ORDER BY name",
    )?;
    let skills: Vec<(String, String, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut exported = 0;
    for (id, name, _desc, _ver, local_path) in &skills {
        let mut src = if let Some(lp) = local_path {
            PathBuf::from(lp)
        } else {
            skills_lib.join(name)
        };

        // local_path 无效时回退到已有部署的 deploy_path
        let has_files = src.exists() && walkdir::WalkDir::new(&src)
            .into_iter()
            .filter_map(|e| e.ok())
            .any(|e| e.file_type().is_file());

        if !has_files {
            let fallback: Option<String> = conn.query_row(
                "SELECT path FROM skill_deployments WHERE skill_id = ?1 AND path IS NOT NULL ORDER BY last_synced DESC LIMIT 1",
                params![id],
                |row| row.get(0),
            ).ok();
            if let Some(ref dp) = fallback {
                let dp_path = PathBuf::from(dp);
                if dp_path.exists() {
                    info!("[export_skills_to_git] {}: local_path 无效，回退到 deploy_path={}", name, dp);
                    src = dp_path;
                }
            }
        }

        if src.exists() {
            let dest = export_skills_dir.join(name);
            copy_dir_recursive(&src, &dest)?;
            exported += 1;
        }
    }

    // 生成 README.md
    let mut readme = String::from("# Skills Manager Backup\n\n");
    readme.push_str(&format!(
        "导出时间: {}\n\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
    ));
    readme.push_str("| 名称 | 版本 | 描述 |\n|------|------|------|\n");
    for (_id, name, desc, ver, _lp) in &skills {
        readme.push_str(&format!(
            "| {} | {} | {} |\n",
            name,
            ver.as_deref().unwrap_or("-"),
            desc.as_deref().unwrap_or("-")
        ));
    }
    std::fs::write(export_dir.join("README.md"), &readme)
        .map_err(|e| AppError::Internal(format!("写入 README.md 失败: {}", e)))?;

    // Git add + commit + push
    run_git(&["add", "-A"], &export_dir)?;

    let (has_changes, _) =
        run_git_allow_fail(&["diff", "--cached", "--quiet"], &export_dir);
    
    let commit_hash = if !has_changes {
        // has_changes=false 意味着 diff --cached 有差异（exit code != 0）
        let msg = format!(
            "backup: {} skills exported at {}",
            exported,
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
        );
        run_git(&["commit", "-m", &msg], &export_dir)?;
        let hash = run_git(&["rev-parse", "HEAD"], &export_dir)?;
        Some(hash)
    } else {
        None
    };

    // Push
    let (push_ok, push_msg) = run_git_allow_fail(
        &["push", "-u", "origin", &branch],
        &export_dir,
    );

    if !push_ok {
        info!(
            "[export_skills_to_git] push 失败，尝试 pull --rebase: {}",
            push_msg
        );
        run_git(&["pull", "--rebase", "origin", &branch], &export_dir)?;
        run_git(&["push", "-u", "origin", &branch], &export_dir)?;
    }

    // 更新 last_push_at
    conn.execute(
        "UPDATE git_export_config SET last_push_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![config_id],
    )?;

    // 写入 sync_history
    conn.execute(
        "INSERT INTO sync_history (id, skill_id, action, status, created_at)
         VALUES (?1, 'all', 'export', 'success', datetime('now'))",
        params![Uuid::new_v4().to_string()],
    )?;

    // 清理导出目录
    let _ = std::fs::remove_dir_all(&export_dir);

    info!(
        "[export_skills_to_git] 导出完成: {} 个 Skill",
        exported
    );

    let msg = if diverged_count > 0 {
        format!(
            "成功导出 {} 个 Skill 到 {}（⚠️ {} 个部署存在偏离/缺失，涉及: {}）",
            exported, remote_url, diverged_count, diverged_skill_names.join(", ")
        )
    } else {
        format!("成功导出 {} 个 Skill 到 {}", exported, remote_url)
    };

    Ok(GitExportResult {
        skills_exported: exported,
        commit_hash,
        pushed: true,
        message: msg,
        diverged_count,
        diverged_skills: diverged_skill_names,
    })
}

// ── 3. clone_git_repo ──

#[tauri::command]
pub async fn clone_git_repo(
    remote_url: String,
    branch: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<GitCloneResult, AppError> {
    info!(
        "[clone_git_repo] 克隆仓库: url={}, branch={:?}",
        remote_url, branch
    );

    let clone_dir = std::env::temp_dir().join("skills-manager-import");
    if clone_dir.exists() {
        std::fs::remove_dir_all(&clone_dir)
            .map_err(|e| AppError::Internal(format!("清理克隆目录失败: {}", e)))?;
    }

    let branch_str = branch.unwrap_or_else(|| "main".to_string());
    let (ok, _msg) = run_git_allow_fail(
        &[
            "clone",
            "--branch",
            &branch_str,
            "--single-branch",
            "--depth",
            "1",
            &remote_url,
            clone_dir.to_str().unwrap_or(""),
        ],
        &std::env::temp_dir(),
    );

    if !ok {
        // 如果指定分支失败，尝试不指定分支
        let (ok2, msg2) = run_git_allow_fail(
            &[
                "clone",
                "--depth",
                "1",
                &remote_url,
                clone_dir.to_str().unwrap_or(""),
            ],
            &std::env::temp_dir(),
        );
        if !ok2 {
            return Err(AppError::Internal(format!("克隆仓库失败: {}", msg2)));
        }
    }

    // 扫描 skills/ 目录
    let skills_dir = clone_dir.join("skills");
    let mut repo_skills = Vec::new();

    if skills_dir.exists() {
        let conn = pool.get()?;

        for entry in std::fs::read_dir(&skills_dir)
            .map_err(|e| AppError::Internal(format!("读取 skills 目录失败: {}", e)))?
        {
            let entry = entry.map_err(|e| AppError::Internal(e.to_string()))?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let dir_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let skill_md = path.join("SKILL.md");
            let (name, description, version) = if skill_md.exists() {
                let content = std::fs::read_to_string(&skill_md).unwrap_or_default();
                let (n, d, v) = parse_skill_frontmatter(&content);
                (n.unwrap_or(dir_name.clone()), d, v)
            } else {
                (dir_name.clone(), None, None)
            };

            // 检查本地是否存在
            let local: Option<(String, Option<String>)> = conn
                .query_row(
                    "SELECT id, version FROM skills WHERE name = ?1",
                    params![name],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .ok();

            let status = if let Some((_local_id, _local_ver)) = &local {
                // 比较 checksum
                let repo_checksum = compute_dir_checksum(&path).unwrap_or_default();
                let local_skill_path = get_skills_lib_path(&pool)?.join(&name);
                if local_skill_path.exists() {
                    let local_checksum = compute_dir_checksum(&local_skill_path).unwrap_or_default();
                    if repo_checksum == local_checksum {
                        "exists_same".to_string()
                    } else {
                        "exists_conflict".to_string()
                    }
                } else {
                    "new".to_string()
                }
            } else {
                "new".to_string()
            };

            repo_skills.push(GitRepoSkill {
                name,
                description,
                version,
                status,
                local_version: local.and_then(|(_, v)| v),
            });
        }
    }

    info!(
        "[clone_git_repo] 扫描完成: {} 个 Skill",
        repo_skills.len()
    );

    Ok(GitCloneResult {
        clone_path: clone_dir.to_string_lossy().to_string(),
        skills_found: repo_skills,
    })
}

// ── 4. import_from_git_repo ──

#[tauri::command]
pub async fn import_from_git_repo(
    clone_path: String,
    skill_names: Vec<String>,
    overwrite_conflicts: bool,
    source_url: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<GitImportResult, AppError> {
    info!(
        "[import_from_git_repo] 导入: path={}, skills={:?}, overwrite={}, source_url={:?}",
        clone_path, skill_names, overwrite_conflicts, source_url
    );

    // 推断 source_type
    let source_type = source_url.as_deref().map(|u| {
        if u.contains("gitee") { "gitee" } else { "github" }
    }).unwrap_or("git");

    let clone_dir = PathBuf::from(&clone_path);
    let skills_dir = clone_dir.join("skills");
    let skills_lib = get_skills_lib_path(&pool)?;
    std::fs::create_dir_all(&skills_lib)
        .map_err(|e| AppError::Internal(format!("创建 Skill 库目录失败: {}", e)))?;

    let conn = pool.get()?;
    let mut imported = 0;
    let mut skipped = 0;
    let mut updated = 0;

    for name in &skill_names {
        let src = skills_dir.join(name);
        if !src.exists() {
            info!("[import_from_git_repo] 跳过不存在的 Skill: {}", name);
            skipped += 1;
            continue;
        }

        let dest = skills_lib.join(name);

        // 解析 SKILL.md
        let skill_md = src.join("SKILL.md");
        let (_, description, version) = if skill_md.exists() {
            let content = std::fs::read_to_string(&skill_md).unwrap_or_default();
            parse_skill_frontmatter(&content)
        } else {
            (None, None, None)
        };

        // 检查本地是否已存在
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM skills WHERE name = ?1",
                params![name],
                |row| row.get(0),
            )
            .ok();

        if let Some(skill_id) = existing {
            if dest.exists() {
                let src_checksum = compute_dir_checksum(&src).unwrap_or_default();
                let dest_checksum = compute_dir_checksum(&dest).unwrap_or_default();
                if src_checksum == dest_checksum {
                    info!("[import_from_git_repo] 跳过一致的 Skill: {}", name);
                    skipped += 1;
                    continue;
                }
                if !overwrite_conflicts {
                    info!(
                        "[import_from_git_repo] 跳过冲突的 Skill(不覆盖): {}",
                        name
                    );
                    skipped += 1;
                    continue;
                }
            }
            // 覆盖更新
            if dest.exists() {
                std::fs::remove_dir_all(&dest)
                    .map_err(|e| AppError::Internal(format!("删除旧 Skill 目录失败: {}", e)))?;
            }
            copy_dir_recursive(&src, &dest)?;
            let new_checksum = compute_dir_checksum(&dest).unwrap_or_default();
            conn.execute(
                "UPDATE skills SET description = COALESCE(?2, description), version = COALESCE(?3, version),
                 checksum = ?4, local_path = ?5, last_modified = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?1",
                params![
                    skill_id,
                    description,
                    version,
                    new_checksum,
                    dest.to_string_lossy().to_string()
                ],
            )?;
            // 更新 skill_sources 记录
            conn.execute(
                "INSERT INTO skill_sources (id, skill_id, source_type, source_url, installed_version, original_checksum)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(skill_id) DO UPDATE SET
                    source_url = COALESCE(?4, source_url), original_checksum = ?6, updated_at = datetime('now')",
                params![Uuid::new_v4().to_string(), skill_id, source_type, source_url, version, new_checksum],
            )?;
            updated += 1;
            info!("[import_from_git_repo] 更新 Skill: {}", name);
        } else {
            // 新导入
            copy_dir_recursive(&src, &dest)?;
            let checksum = compute_dir_checksum(&dest).unwrap_or_default();
            let skill_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO skills (id, name, description, version, checksum, local_path, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))",
                params![
                    skill_id,
                    name,
                    description,
                    version,
                    checksum,
                    dest.to_string_lossy().to_string()
                ],
            )?;
            // 创建 skill_sources 记录
            let source_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO skill_sources (id, skill_id, source_type, source_url, installed_version, original_checksum)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(skill_id) DO UPDATE SET
                    source_type = ?3, source_url = ?4, installed_version = ?5, original_checksum = ?6, updated_at = datetime('now')",
                params![source_id, skill_id, source_type, source_url, version, checksum],
            )?;
            imported += 1;
            info!("[import_from_git_repo] 导入新 Skill: {} (source={})", name, source_type);
        }
    }

    // 写入 sync_history
    conn.execute(
        "INSERT INTO sync_history (id, skill_id, action, status, created_at)
         VALUES (?1, 'all', 'import', 'success', datetime('now'))",
        params![Uuid::new_v4().to_string()],
    )?;

    // 清理克隆目录
    let _ = std::fs::remove_dir_all(&clone_dir);

    info!(
        "[import_from_git_repo] 完成: imported={}, updated={}, skipped={}",
        imported, updated, skipped
    );

    Ok(GitImportResult {
        skills_imported: imported,
        skills_skipped: skipped,
        skills_updated: updated,
        message: format!(
            "导入 {} 个, 更新 {} 个, 跳过 {} 个",
            imported, updated, skipped
        ),
    })
}

// ── 5. check_git_repo_updates ──

#[derive(Debug, Clone, Serialize)]
pub struct GitRepoUpdateInfo {
    pub config_id: String,
    pub remote_url: String,
    pub branch: String,
    pub skills: Vec<GitSkillUpdateStatus>,
    pub has_updates: bool,
    pub remote_commit: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitSkillUpdateStatus {
    pub name: String,
    pub local_checksum: Option<String>,
    pub remote_checksum: Option<String>,
    pub status: String, // "updated", "unchanged", "new_remote", "deleted_remote"
}

#[tauri::command]
pub async fn check_git_repo_updates(
    config_id: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<GitRepoUpdateInfo>, AppError> {
    info!("[check_git_repo_updates] config_id={:?}", config_id);

    // 1. 获取 git_export_config
    let conn = pool.get()?;
    let configs: Vec<(String, String, String, String)> = if let Some(ref cid) = config_id {
        info!("[check_git_repo_updates] 查询指定配置: {}", cid);
        let mut stmt = conn.prepare(
            "SELECT id, remote_url, branch, provider FROM git_export_config WHERE id = ?1"
        )?;
        let rows = stmt.query_map(params![cid], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?,
                row.get::<_, String>(2)?, row.get::<_, String>(3)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        rows
    } else {
        info!("[check_git_repo_updates] 查询所有配置");
        let mut stmt = conn.prepare(
            "SELECT id, remote_url, branch, provider FROM git_export_config"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?,
                row.get::<_, String>(2)?, row.get::<_, String>(3)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        rows
    };
    drop(conn);

    info!("[check_git_repo_updates] 找到 {} 个 Git 配置", configs.len());

    if configs.is_empty() {
        return Ok(Vec::new());
    }

    let skills_lib = get_skills_lib_path(&pool)?;
    let mut results = Vec::new();

    for (cid, remote_url, branch, _provider) in &configs {
        info!("[check_git_repo_updates] 检查仓库: {} (branch={})", remote_url, branch);

        // 2. Clone to temp dir (shallow)
        let clone_dir = std::env::temp_dir().join(format!("skills-manager-check-{}", cid));
        if clone_dir.exists() {
            let _ = std::fs::remove_dir_all(&clone_dir);
        }

        let (ok, clone_msg) = run_git_allow_fail(
            &["clone", "--branch", branch, "--single-branch", "--depth", "1",
              remote_url, clone_dir.to_str().unwrap_or("")],
            &std::env::temp_dir(),
        );

        if !ok {
            info!("[check_git_repo_updates] clone 失败: {}, 尝试不指定分支", clone_msg);
            let (ok2, msg2) = run_git_allow_fail(
                &["clone", "--depth", "1", remote_url, clone_dir.to_str().unwrap_or("")],
                &std::env::temp_dir(),
            );
            if !ok2 {
                info!("[check_git_repo_updates] clone 最终失败: {}", msg2);
                continue;
            }
        }

        // 3. Get remote commit hash
        let remote_commit = run_git(&["rev-parse", "HEAD"], &clone_dir).ok();
        info!("[check_git_repo_updates] 远程 commit: {:?}", remote_commit);

        // 4. Scan remote skills dir
        let remote_skills_dir = clone_dir.join("skills");
        let mut skill_statuses = Vec::new();
        let mut has_updates = false;

        if remote_skills_dir.exists() && remote_skills_dir.is_dir() {
            let entries: Vec<_> = std::fs::read_dir(&remote_skills_dir)
                .map(|rd| rd.filter_map(|e| e.ok()).collect())
                .unwrap_or_default();

            info!("[check_git_repo_updates] 远程 skills/ 目录中发现 {} 个项", entries.len());

            for entry in entries {
                let skill_name = entry.file_name().to_string_lossy().to_string();
                if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }

                let remote_path = remote_skills_dir.join(&skill_name);
                let local_path = skills_lib.join(&skill_name);

                let remote_checksum = compute_dir_checksum(&remote_path);

                // 优先从 local_path 计算，若为空则回退到 DB 中已有部署的 checksum
                let local_checksum = {
                    let lp_cksum = if local_path.exists() {
                        compute_dir_checksum(&local_path)
                    } else {
                        None
                    };
                    if lp_cksum.is_some() {
                        lp_cksum
                    } else {
                        // 回退：查 DB 中该 skill 的部署 checksum
                        let db_conn = pool.get().ok();
                        db_conn.and_then(|c| {
                            c.query_row(
                                "SELECT sd.checksum FROM skill_deployments sd JOIN skills s ON sd.skill_id = s.id WHERE s.name = ?1 AND sd.checksum IS NOT NULL LIMIT 1",
                                params![skill_name],
                                |row| row.get::<_, Option<String>>(0),
                            ).ok().flatten()
                        })
                    }
                };

                // 判断是否存在于本地（library 或任何部署中）
                let exists_locally = local_checksum.is_some();

                let status = if !exists_locally {
                    has_updates = true;
                    "new_remote".to_string()
                } else if remote_checksum == local_checksum {
                    "unchanged".to_string()
                } else {
                    has_updates = true;
                    "updated".to_string()
                };

                info!(
                    "[check_git_repo_updates]   Skill '{}': status={}, local_cksum={:?}, remote_cksum={:?}",
                    skill_name, status, local_checksum, remote_checksum
                );

                skill_statuses.push(GitSkillUpdateStatus {
                    name: skill_name,
                    local_checksum,
                    remote_checksum,
                    status,
                });
            }

            // Check for skills deleted from remote (exist locally but not in remote)
            if skills_lib.exists() {
                let local_entries: Vec<_> = std::fs::read_dir(&skills_lib)
                    .map(|rd| rd.filter_map(|e| e.ok()).collect())
                    .unwrap_or_default();

                for entry in local_entries {
                    let skill_name = entry.file_name().to_string_lossy().to_string();
                    if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        continue;
                    }
                    if !skill_statuses.iter().any(|s| s.name == skill_name) {
                        let local_checksum = compute_dir_checksum(&skills_lib.join(&skill_name));
                        info!(
                            "[check_git_repo_updates]   Skill '{}': status=deleted_remote (本地有,远程无)",
                            skill_name
                        );
                        skill_statuses.push(GitSkillUpdateStatus {
                            name: skill_name,
                            local_checksum,
                            remote_checksum: None,
                            status: "deleted_remote".to_string(),
                        });
                    }
                }
            }
        } else {
            info!("[check_git_repo_updates] 远程仓库无 skills/ 目录");
        }

        // 5. Cleanup
        let _ = std::fs::remove_dir_all(&clone_dir);

        let update_count = skill_statuses.iter().filter(|s| s.status != "unchanged").count();
        info!(
            "[check_git_repo_updates] 仓库 {} 检查完成: {} 个 Skill, {} 个有变化, has_updates={}",
            remote_url, skill_statuses.len(), update_count, has_updates
        );

        results.push(GitRepoUpdateInfo {
            config_id: cid.clone(),
            remote_url: remote_url.clone(),
            branch: branch.clone(),
            skills: skill_statuses,
            has_updates,
            remote_commit,
        });
    }

    info!("[check_git_repo_updates] 全部检查完成: {} 个仓库", results.len());
    Ok(results)
}

// ── 6. scan_remote_new_skills ──

#[derive(Debug, Clone, Serialize)]
pub struct RemoteNewSkill {
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub dir_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanRemoteResult {
    pub config_id: String,
    pub remote_url: String,
    pub new_skills: Vec<RemoteNewSkill>,
    pub total_remote: usize,
    pub total_local: usize,
    pub clone_path: String,
}

#[tauri::command]
pub async fn scan_remote_new_skills(
    config_id: String,
    pool: State<'_, DbPool>,
) -> Result<ScanRemoteResult, AppError> {
    info!("[scan_remote_new_skills] config_id={}", config_id);

    let conn = pool.get()?;

    let (remote_url, branch): (String, String) = conn.query_row(
        "SELECT remote_url, branch FROM git_export_config WHERE id = ?1",
        params![config_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    info!(
        "[scan_remote_new_skills] remote={}, branch={}",
        remote_url, branch
    );

    // 浅克隆
    let clone_dir = std::env::temp_dir().join("skills-manager-scan-remote");
    if clone_dir.exists() {
        let _ = std::fs::remove_dir_all(&clone_dir);
    }

    let (ok, msg) = run_git_allow_fail(
        &[
            "clone", "--branch", &branch, "--single-branch",
            "--depth", "1", &remote_url,
            clone_dir.to_str().unwrap_or(""),
        ],
        &std::env::temp_dir(),
    );

    if !ok {
        return Err(AppError::Internal(format!(
            "克隆远程仓库失败: {}", msg
        )));
    }

    // 扫描远程 skills/ 目录
    let skills_dir = clone_dir.join("skills");
    let mut new_skills = Vec::new();
    let mut total_remote = 0usize;

    if skills_dir.exists() {
        // 获取本地所有 Skill 名称
        let mut stmt = conn.prepare("SELECT name FROM skills")?;
        let local_names: std::collections::HashSet<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<std::collections::HashSet<_>, _>>()?;

        let total_local = local_names.len();
        info!(
            "[scan_remote_new_skills] 本地 {} 个 Skill",
            total_local
        );

        for entry in std::fs::read_dir(&skills_dir)
            .map_err(|e| AppError::Internal(format!("读取远程 skills 目录失败: {}", e)))?
        {
            let entry = entry.map_err(|e| AppError::Internal(e.to_string()))?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            total_remote += 1;
            let dir_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // 解析 SKILL.md
            let skill_md = path.join("SKILL.md");
            let (name, description, version) = if skill_md.exists() {
                let content = std::fs::read_to_string(&skill_md).unwrap_or_default();
                let (n, d, v) = parse_skill_frontmatter(&content);
                (n.unwrap_or(dir_name.clone()), d, v)
            } else {
                (dir_name.clone(), None, None)
            };

            if !local_names.contains(&name) {
                info!(
                    "[scan_remote_new_skills]   新增: {} (dir={}, ver={:?})",
                    name, dir_name, version
                );
                new_skills.push(RemoteNewSkill {
                    name,
                    description,
                    version,
                    dir_name,
                });
            }
        }

        info!(
            "[scan_remote_new_skills] 远程 {} 个 Skill, 本地 {} 个, 新增 {} 个",
            total_remote, total_local, new_skills.len()
        );

        return Ok(ScanRemoteResult {
            config_id,
            remote_url,
            new_skills,
            total_remote,
            total_local,
            clone_path: clone_dir.to_string_lossy().to_string(),
        });
    }

    info!("[scan_remote_new_skills] 远程仓库无 skills/ 目录");

    Ok(ScanRemoteResult {
        config_id,
        remote_url,
        new_skills,
        total_remote: 0,
        total_local: 0,
        clone_path: clone_dir.to_string_lossy().to_string(),
    })
}
