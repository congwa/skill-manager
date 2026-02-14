use log::info;
use rusqlite::params;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

use super::utils::{compute_dir_checksum, copy_dir_recursive};
use crate::db::DbPool;
use crate::error::AppError;
use crate::models::*;

// ── GitHub API response types (internal) ──

#[derive(serde::Deserialize)]
struct GhTreeResponse {
    #[allow(dead_code)]
    sha: String,
    tree: Vec<GhTreeEntry>,
}

#[derive(serde::Deserialize)]
struct GhTreeEntry {
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
    sha: String,
    size: Option<u64>,
}

#[derive(serde::Deserialize)]
struct GhBlobResponse {
    content: String,
}

#[derive(serde::Deserialize)]
struct SkillsShApiResponse {
    skills: Option<Vec<SkillsShSearchResult>>,
}

// ── 1. Search skills.sh ──

#[tauri::command]
pub async fn search_skills_sh(
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SkillsShSearchResult>, AppError> {
    info!("[search_skills_sh] query={}, limit={:?}", query, limit);

    if query.len() < 2 {
        return Err(AppError::Validation("搜索关键词至少需要 2 个字符".into()));
    }

    let lim = limit.unwrap_or(20);
    let url = format!(
        "https://skills.sh/api/search?q={}&limit={}",
        urlencoding::encode(&query),
        lim
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "skills-manager")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("HTTP 请求失败: {}", e)))?;

    if !resp.status().is_success() {
        return Err(AppError::Internal(format!(
            "skills.sh API 返回错误: {}",
            resp.status()
        )));
    }

    let data: SkillsShApiResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("解析响应失败: {}", e)))?;

    let results = data.skills.unwrap_or_default();
    info!("[search_skills_sh] 返回 {} 条结果", results.len());
    Ok(results)
}

// ── 2. Get repo tree (GitHub Trees API) ──

async fn fetch_repo_tree_internal(
    owner_repo: &str,
    token: &Option<String>,
) -> Result<(String, Vec<GhTreeEntry>), AppError> {
    let client = reqwest::Client::new();

    for branch in &["main", "master"] {
        let url = format!(
            "https://api.github.com/repos/{}/git/trees/{}?recursive=1",
            owner_repo, branch
        );

        let mut req = client
            .get(&url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "skills-manager");

        if let Some(t) = token {
            req = req.header("Authorization", format!("Bearer {}", t));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("GitHub API 请求失败: {}", e)))?;

        if resp.status().is_success() {
            let data: GhTreeResponse = resp
                .json()
                .await
                .map_err(|e| AppError::Internal(format!("解析 Tree 响应失败: {}", e)))?;
            return Ok((branch.to_string(), data.tree));
        }
    }

    Err(AppError::Internal(format!(
        "无法获取仓库 {} 的文件树 (尝试了 main 和 master 分支)",
        owner_repo
    )))
}

#[tauri::command]
pub async fn get_skill_repo_tree(
    owner_repo: String,
    token: Option<String>,
) -> Result<RepoTreeResult, AppError> {
    info!("[get_skill_repo_tree] owner_repo={}", owner_repo);

    let (branch, tree) = fetch_repo_tree_internal(&owner_repo, &token).await?;

    // Find all SKILL.md files
    let skill_md_entries: Vec<&GhTreeEntry> = tree
        .iter()
        .filter(|e| e.entry_type == "blob" && e.path.ends_with("/SKILL.md"))
        .collect();

    let mut skills = Vec::new();
    for entry in &skill_md_entries {
        let folder_path = entry.path.trim_end_matches("/SKILL.md");

        // Find the folder tree entry for folder SHA
        let folder_sha = tree
            .iter()
            .find(|e| e.entry_type == "tree" && e.path == folder_path)
            .map(|e| e.sha.clone())
            .unwrap_or_default();

        // Find all files under this folder
        let prefix = format!("{}/", folder_path);
        let files: Vec<RepoFileEntry> = tree
            .iter()
            .filter(|e| e.entry_type == "blob" && e.path.starts_with(&prefix))
            .map(|e| RepoFileEntry {
                path: e.path.clone(),
                sha: e.sha.clone(),
                size: e.size,
            })
            .collect();

        skills.push(RepoSkillEntry {
            skill_path: folder_path.to_string(),
            folder_sha,
            file_count: files.len(),
            files,
        });
    }

    info!(
        "[get_skill_repo_tree] 发现 {} 个 Skill (branch={})",
        skills.len(),
        branch
    );

    Ok(RepoTreeResult {
        owner_repo,
        branch,
        skills,
    })
}

// ── 3. Fetch blob content (GitHub Blob API) ──

#[tauri::command]
pub async fn fetch_skill_content(
    owner_repo: String,
    blob_sha: String,
    token: Option<String>,
) -> Result<String, AppError> {
    info!(
        "[fetch_skill_content] owner_repo={}, sha={}",
        owner_repo, blob_sha
    );

    let url = format!(
        "https://api.github.com/repos/{}/git/blobs/{}",
        owner_repo, blob_sha
    );

    let client = reqwest::Client::new();
    let mut req = client
        .get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "skills-manager");

    if let Some(t) = &token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("GitHub Blob API 请求失败: {}", e)))?;

    if !resp.status().is_success() {
        return Err(AppError::Internal(format!(
            "GitHub Blob API 返回错误: {}",
            resp.status()
        )));
    }

    let data: GhBlobResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("解析 Blob 响应失败: {}", e)))?;

    // Decode base64 content (GitHub returns with newlines in base64)
    let clean_b64: String = data.content.chars().filter(|c| !c.is_whitespace()).collect();
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &clean_b64)
        .map_err(|e| AppError::Internal(format!("Base64 解码失败: {}", e)))?;

    String::from_utf8(decoded)
        .map_err(|e| AppError::Internal(format!("UTF-8 解码失败: {}", e)))
}

// ── 4. Install from skills.sh ──

#[tauri::command]
pub async fn install_from_skills_sh(
    owner_repo: String,
    skill_path: String,
    skill_name: String,
    folder_sha: String,
    files: Vec<RepoFileEntry>,
    token: Option<String>,
    deploy_targets: Vec<DeployTarget>,
    force_overwrite: Option<bool>,
    pool: State<'_, DbPool>,
) -> Result<SkillsShInstallResult, AppError> {
    info!(
        "[install_from_skills_sh] skill={}, repo={}, files={}, targets={}",
        skill_name,
        owner_repo,
        files.len(),
        deploy_targets.len()
    );

    let force = force_overwrite.unwrap_or(false);

    // Step 1: Check for conflicts
    {
        let conn = pool.get()?;
        let existing: Option<(String, Option<String>, Option<String>)> = conn
            .query_row(
                "SELECT s.id, s.version, s.checksum FROM skills s WHERE s.name = ?1",
                params![skill_name],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;

        if let Some((existing_id, existing_version, existing_checksum)) = existing {
            if !force {
                // Check if locally modified
                let original_checksum: Option<String> = conn
                    .query_row(
                        "SELECT original_checksum FROM skill_sources WHERE skill_id = ?1",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .optional()?
                    .flatten();

                let locally_modified = match (&existing_checksum, &original_checksum) {
                    (Some(c), Some(o)) => c != o,
                    _ => false,
                };

                let conflict_type = if locally_modified {
                    "locally_modified"
                } else {
                    "already_installed"
                };

                return Ok(SkillsShInstallResult {
                    skill_id: existing_id,
                    local_path: String::new(),
                    files_downloaded: 0,
                    deployments_created: 0,
                    conflict: Some(InstallConflict {
                        conflict_type: conflict_type.to_string(),
                        local_version: existing_version,
                        local_checksum: existing_checksum,
                    }),
                });
            }
        }
    }

    // Step 2: Download all files to local skill library
    let home = dirs::home_dir().expect("Cannot find home directory");
    let local_skill_dir = home
        .join(".skills-manager")
        .join("skills")
        .join(&skill_name);

    // Clean existing dir if force overwrite
    if local_skill_dir.exists() && force {
        let _ = std::fs::remove_dir_all(&local_skill_dir);
    }
    std::fs::create_dir_all(&local_skill_dir)
        .map_err(|e| AppError::Io(e))?;

    let client = reqwest::Client::new();
    let mut files_downloaded = 0usize;

    for file_entry in &files {
        // Extract relative path within skill folder
        let relative_path = file_entry
            .path
            .strip_prefix(&format!("{}/", skill_path))
            .unwrap_or(&file_entry.path);

        // Skip excluded files
        let filename = Path::new(relative_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if filename == "README.md" || filename == "metadata.json" || filename.starts_with('_') {
            continue;
        }

        let blob_url = format!(
            "https://api.github.com/repos/{}/git/blobs/{}",
            owner_repo, file_entry.sha
        );

        let mut req = client
            .get(&blob_url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "skills-manager");

        if let Some(t) = &token {
            req = req.header("Authorization", format!("Bearer {}", t));
        }

        let resp = req.send().await.map_err(|e| {
            AppError::Internal(format!("下载文件 {} 失败: {}", relative_path, e))
        })?;

        if !resp.status().is_success() {
            info!(
                "[install_from_skills_sh] 跳过文件 {} (HTTP {})",
                relative_path,
                resp.status()
            );
            continue;
        }

        let blob: GhBlobResponse = resp.json().await.map_err(|e| {
            AppError::Internal(format!("解析文件 {} 失败: {}", relative_path, e))
        })?;

        let clean_b64: String = blob.content.chars().filter(|c| !c.is_whitespace()).collect();
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &clean_b64)
                .map_err(|e| {
                    AppError::Internal(format!("解码文件 {} 失败: {}", relative_path, e))
                })?;

        let target_path = local_skill_dir.join(relative_path);
        if let Some(parent) = target_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&target_path, &decoded)?;
        files_downloaded += 1;
    }

    info!(
        "[install_from_skills_sh] 下载完成: {} 个文件",
        files_downloaded
    );

    // Step 3: Parse SKILL.md frontmatter for description/version
    let skill_md_path = local_skill_dir.join("SKILL.md");
    let (description, version) = if skill_md_path.exists() {
        let content = std::fs::read_to_string(&skill_md_path)?;
        parse_skill_md_frontmatter(&content)
    } else {
        (None, None)
    };

    // Step 4: Compute checksum and write to database
    let checksum = compute_dir_checksum(&local_skill_dir);
    let local_path_str = local_skill_dir.to_string_lossy().to_string();
    let source_url = format!(
        "https://skills.sh/{}/{}",
        owner_repo,
        skill_name
    );

    let skill_id = {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;

        // Check if skill already exists (for force overwrite case)
        let existing_id: Option<String> = tx
            .query_row(
                "SELECT id FROM skills WHERE name = ?1",
                params![skill_name],
                |row| row.get(0),
            )
            .optional()?;

        let sid = if let Some(eid) = existing_id {
            // Update existing
            tx.execute(
                "UPDATE skills SET description = ?1, version = ?2, checksum = ?3,
                        local_path = ?4, last_modified = datetime('now'),
                        updated_at = datetime('now')
                 WHERE id = ?5",
                params![description, version, checksum, local_path_str, eid],
            )?;
            tx.execute(
                "UPDATE skill_sources SET source_type = 'skills-sh', url = ?1,
                        installed_version = ?2, original_checksum = ?3,
                        remote_sha = ?4, skill_path = ?5,
                        updated_at = datetime('now')
                 WHERE skill_id = ?6",
                params![source_url, version, checksum, folder_sha, skill_path, eid],
            )?;
            eid
        } else {
            // Insert new
            let new_id = Uuid::new_v4().to_string();
            let source_id = Uuid::new_v4().to_string();

            tx.execute(
                "INSERT INTO skills (id, name, description, version, checksum, local_path, last_modified)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
                params![new_id, skill_name, description, version, checksum, local_path_str],
            )?;

            tx.execute(
                "INSERT INTO skill_sources (id, skill_id, source_type, url, installed_version,
                        original_checksum, remote_sha, skill_path)
                 VALUES (?1, ?2, 'skills-sh', ?3, ?4, ?5, ?6, ?7)",
                params![
                    source_id,
                    new_id,
                    source_url,
                    version,
                    checksum,
                    folder_sha,
                    skill_path
                ],
            )?;

            new_id
        };

        tx.commit()?;
        sid
    };

    // Step 5: Deploy to targets
    let mut deployments_created = 0usize;
    for target in &deploy_targets {
        let deploy_result =
            deploy_skill_internal(&pool, &skill_id, &skill_name, target, &local_skill_dir).await;
        match deploy_result {
            Ok(_) => deployments_created += 1,
            Err(e) => info!(
                "[install_from_skills_sh] 部署到 {:?}/{} 失败: {}",
                target.project_id, target.tool, e
            ),
        }
    }

    // Step 6: Write sync_history
    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO sync_history (id, skill_id, action, status, created_at)
             VALUES (?1, ?2, 'install', 'success', datetime('now'))",
            params![Uuid::new_v4().to_string(), skill_id],
        )?;
    }

    info!(
        "[install_from_skills_sh] 安装完成: skill_id={}, files={}, deploys={}",
        skill_id, files_downloaded, deployments_created
    );

    Ok(SkillsShInstallResult {
        skill_id,
        local_path: local_path_str,
        files_downloaded,
        deployments_created,
        conflict: None,
    })
}

// ── 5. Check remote updates ──

#[tauri::command]
pub async fn check_remote_updates(
    pool: State<'_, DbPool>,
) -> Result<Vec<RemoteUpdateInfo>, AppError> {
    info!("[check_remote_updates] 检查远程更新");

    // Get GitHub token from settings
    let token: Option<String> = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'github_token'",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten()
        .and_then(|v| {
            let trimmed = v.trim_matches('"').to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
    };

    // Get all skills-sh sourced skills
    #[derive(Debug)]
    struct SourcedSkill {
        skill_id: String,
        skill_name: String,
        version: Option<String>,
        url: Option<String>,
        remote_sha: Option<String>,
        skill_path: Option<String>,
        checksum: Option<String>,
        original_checksum: Option<String>,
        deploy_count: i64,
    }

    let sourced_skills: Vec<SourcedSkill> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.version, ss.url, ss.remote_sha, ss.skill_path,
                    s.checksum, ss.original_checksum,
                    (SELECT COUNT(*) FROM skill_deployments sd WHERE sd.skill_id = s.id)
             FROM skills s
             JOIN skill_sources ss ON ss.skill_id = s.id
             WHERE ss.source_type = 'skills-sh'
               AND ss.url IS NOT NULL
               AND ss.skill_path IS NOT NULL"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SourcedSkill {
                skill_id: row.get(0)?,
                skill_name: row.get(1)?,
                version: row.get(2)?,
                url: row.get(3)?,
                remote_sha: row.get(4)?,
                skill_path: row.get(5)?,
                checksum: row.get(6)?,
                original_checksum: row.get(7)?,
                deploy_count: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    if sourced_skills.is_empty() {
        info!("[check_remote_updates] 没有来自 skills.sh 的 Skill");
        return Ok(vec![]);
    }

    // Group by owner_repo
    let mut by_repo: std::collections::HashMap<String, Vec<&SourcedSkill>> =
        std::collections::HashMap::new();

    for skill in &sourced_skills {
        if let Some(url) = &skill.url {
            // Parse owner/repo from url like "https://skills.sh/vercel-labs/agent-skills/skill-name"
            let parts: Vec<&str> = url
                .trim_start_matches("https://skills.sh/")
                .split('/')
                .collect();
            if parts.len() >= 2 {
                let repo_key = format!("{}/{}", parts[0], parts[1]);
                by_repo.entry(repo_key).or_default().push(skill);
            }
        }
    }

    let mut results = Vec::new();

    // For each repo, call Trees API once
    for (repo, skills_in_repo) in &by_repo {
        let tree_result = fetch_repo_tree_internal(repo, &token).await;
        let tree = match tree_result {
            Ok((_, tree)) => tree,
            Err(e) => {
                info!(
                    "[check_remote_updates] 获取仓库 {} 文件树失败: {}",
                    repo, e
                );
                continue;
            }
        };

        for skill in skills_in_repo {
            let sp = match &skill.skill_path {
                Some(p) => p.as_str(),
                None => continue,
            };

            // Find latest folder SHA
            let latest_sha = tree
                .iter()
                .find(|e| e.entry_type == "tree" && e.path == sp)
                .map(|e| e.sha.clone());

            if let Some(latest) = latest_sha {
                let has_update = skill
                    .remote_sha
                    .as_ref()
                    .map(|saved| saved != &latest)
                    .unwrap_or(true);

                let locally_modified = match (&skill.checksum, &skill.original_checksum) {
                    (Some(c), Some(o)) => c != o,
                    _ => false,
                };

                results.push(RemoteUpdateInfo {
                    skill_id: skill.skill_id.clone(),
                    skill_name: skill.skill_name.clone(),
                    current_version: skill.version.clone(),
                    source_url: skill.url.clone(),
                    owner_repo: repo.clone(),
                    skill_path: sp.to_string(),
                    local_sha: skill.remote_sha.clone(),
                    remote_sha: latest,
                    has_update,
                    locally_modified,
                    deploy_count: skill.deploy_count,
                });
            }
        }
    }

    let update_count = results.iter().filter(|r| r.has_update).count();
    info!(
        "[check_remote_updates] 检查完成: {} 个 Skill, {} 个有更新",
        results.len(),
        update_count
    );

    Ok(results)
}

// ── Helper: deploy skill internally ──

async fn deploy_skill_internal(
    pool: &State<'_, DbPool>,
    skill_id: &str,
    skill_name: &str,
    target: &DeployTarget,
    source_dir: &Path,
) -> Result<(), AppError> {
    let tool_dir = match target.tool.as_str() {
        "windsurf" => ".windsurf/skills",
        "cursor" => ".cursor/skills",
        "claude-code" => ".claude/skills",
        "codex" => ".agents/skills",
        "trae" => ".trae/skills",
        _ => return Err(AppError::Validation(format!("未知工具: {}", target.tool))),
    };

    let deploy_path = if let Some(pid) = &target.project_id {
        let conn = pool.get()?;
        let project_path: String = conn
            .query_row(
                "SELECT path FROM projects WHERE id = ?1",
                params![pid],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NotFound(format!("项目不存在: {}", pid)))?;
        Path::new(&project_path)
            .join(tool_dir)
            .join(skill_name)
    } else {
        let home = dirs::home_dir().expect("Cannot find home directory");
        let global_dir = match target.tool.as_str() {
            "windsurf" => home.join(".codeium/windsurf/skills"),
            "cursor" => home.join(".cursor/skills"),
            "claude-code" => home.join(".claude/skills"),
            "codex" => home.join(".agents/skills"),
            "trae" => home.join(".trae/skills"),
            _ => return Err(AppError::Validation(format!("未知工具: {}", target.tool))),
        };
        global_dir.join(skill_name)
    };

    // Copy files
    if deploy_path.exists() {
        let _ = std::fs::remove_dir_all(&deploy_path);
    }
    copy_dir_recursive(source_dir, &deploy_path)?;

    let deploy_checksum = compute_dir_checksum(&deploy_path);
    let deploy_path_str = deploy_path.to_string_lossy().to_string();
    let dep_id = Uuid::new_v4().to_string();

    let conn = pool.get()?;
    conn.execute(
        "INSERT OR REPLACE INTO skill_deployments
            (id, skill_id, project_id, tool, path, checksum, status, last_synced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'synced', datetime('now'))",
        params![
            dep_id,
            skill_id,
            target.project_id,
            target.tool,
            deploy_path_str,
            deploy_checksum
        ],
    )?;

    Ok(())
}

// ── Helper: parse SKILL.md frontmatter ──

fn parse_skill_md_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return (None, None);
    }

    let rest = &trimmed[3..];
    if let Some(end_idx) = rest.find("---") {
        let frontmatter = &rest[..end_idx];
        let mut description = None;
        let mut version = None;

        for line in frontmatter.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("description:") {
                description = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
            } else if let Some(val) = line.strip_prefix("version:") {
                version = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
            }
        }

        (description, version)
    } else {
        (None, None)
    }
}

// ── URL encoding helper ──

mod urlencoding {
    pub fn encode(input: &str) -> String {
        let mut result = String::new();
        for byte in input.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    result.push(byte as char);
                }
                _ => {
                    result.push_str(&format!("%{:02X}", byte));
                }
            }
        }
        result
    }
}

use rusqlite::OptionalExtension;

// ── 6. 排行榜 / 分类浏览 ──

#[derive(serde::Serialize)]
pub struct BrowseResult {
    pub category: String,
    pub skills: Vec<SkillsShSearchResult>,
    pub total: usize,
}

#[tauri::command]
pub async fn browse_popular_skills_sh(
    category: Option<String>,
) -> Result<BrowseResult, AppError> {
    info!("[browse_popular_skills_sh] category={:?}", category);

    // 预定义分类关键词
    let categories: std::collections::HashMap<&str, Vec<&str>> = [
        ("popular", vec!["skill", "best", "design", "code", "build"]),
        ("frontend", vec!["react", "vue", "css", "tailwind", "nextjs"]),
        ("backend", vec!["api", "database", "server", "python", "rust"]),
        ("devops", vec!["docker", "deploy", "ci", "testing", "git"]),
        ("ai", vec!["ai", "llm", "prompt", "agent", "machine"]),
        ("mobile", vec!["mobile", "ios", "android", "flutter", "swift"]),
    ].into_iter().collect();

    let cat = category.as_deref().unwrap_or("popular");
    let keywords = categories.get(cat).cloned().unwrap_or_else(|| {
        // 如果传入的是自定义关键词而非预定义分类，直接用它搜索
        vec![]
    });

    info!("[browse_popular_skills_sh] 使用关键词: {:?}", keywords);

    let client = reqwest::Client::new();
    let mut seen_ids = std::collections::HashSet::new();
    let mut all_results: Vec<SkillsShSearchResult> = Vec::new();

    // 如果是自定义关键词
    if keywords.is_empty() {
        let query = category.as_deref().unwrap_or("skill");
        if query.len() < 2 {
            return Err(AppError::Validation("关键词至少需要 2 个字符".into()));
        }
        let url = format!(
            "https://skills.sh/api/search?q={}&limit=50",
            urlencoding::encode(query)
        );
        info!("[browse_popular_skills_sh] 请求: {}", url);
        let resp = client
            .get(&url)
            .header("User-Agent", "skills-manager")
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("HTTP 请求失败: {}", e)))?;

        if resp.status().is_success() {
            let body = resp.text().await
                .map_err(|e| AppError::Internal(format!("读取响应失败: {}", e)))?;
            info!("[browse_popular_skills_sh] 响应体前200字符: {}", &body[..body.len().min(200)]);
            let data: SkillsShApiResponse = serde_json::from_str(&body)
                .map_err(|e| AppError::Internal(format!("解析响应失败: {} | body={}", e, &body[..body.len().min(300)])))?;
            for skill in data.skills.unwrap_or_default() {
                if seen_ids.insert(skill.id.clone()) {
                    all_results.push(skill);
                }
            }
        }
    } else {
        // 用多个关键词搜索并聚合
        for keyword in &keywords {
            let url = format!(
                "https://skills.sh/api/search?q={}&limit=30",
                urlencoding::encode(keyword)
            );
            info!("[browse_popular_skills_sh] 请求: {} (keyword={})", url, keyword);

            let resp = client
                .get(&url)
                .header("User-Agent", "skills-manager")
                .send()
                .await;

            match resp {
                Ok(r) if r.status().is_success() => {
                    let body = r.text().await
                        .map_err(|e| AppError::Internal(format!("读取响应失败: {}", e)))?;
                    info!("[browse_popular_skills_sh]   keyword='{}' 响应前200字符: {}", keyword, &body[..body.len().min(200)]);
                    let data: SkillsShApiResponse = serde_json::from_str(&body)
                        .map_err(|e| {
                            info!("[browse_popular_skills_sh]   keyword='{}' 解析失败: {}", keyword, e);
                            AppError::Internal(format!("解析响应失败: {}", e))
                        })?;
                    let skills = data.skills.unwrap_or_default();
                    info!("[browse_popular_skills_sh]   keyword='{}' 返回 {} 条", keyword, skills.len());
                    for skill in skills {
                        if seen_ids.insert(skill.id.clone()) {
                            all_results.push(skill);
                        }
                    }
                }
                Ok(r) => {
                    info!("[browse_popular_skills_sh]   keyword='{}' 返回状态 {}", keyword, r.status());
                }
                Err(e) => {
                    info!("[browse_popular_skills_sh]   keyword='{}' 请求失败: {}", keyword, e);
                }
            }
        }
    }

    // 按 installs 降序排列
    all_results.sort_by(|a, b| b.installs.cmp(&a.installs));

    let total = all_results.len();
    info!(
        "[browse_popular_skills_sh] 完成: category='{}', 去重后 {} 条结果",
        cat, total
    );

    Ok(BrowseResult {
        category: cat.to_string(),
        skills: all_results,
        total,
    })
}

#[tauri::command]
pub async fn get_skill_categories() -> Result<Vec<SkillCategory>, AppError> {
    info!("[get_skill_categories] 返回预定义分类列表");
    Ok(vec![
        SkillCategory { id: "popular".into(), name: "热门".into(), icon: "flame".into(), keywords: vec!["skill".into(), "best".into(), "design".into()] },
        SkillCategory { id: "frontend".into(), name: "前端".into(), icon: "layout".into(), keywords: vec!["react".into(), "vue".into(), "css".into(), "tailwind".into()] },
        SkillCategory { id: "backend".into(), name: "后端".into(), icon: "server".into(), keywords: vec!["api".into(), "database".into(), "python".into(), "rust".into()] },
        SkillCategory { id: "devops".into(), name: "DevOps".into(), icon: "git-branch".into(), keywords: vec!["docker".into(), "deploy".into(), "testing".into()] },
        SkillCategory { id: "ai".into(), name: "AI / LLM".into(), icon: "brain".into(), keywords: vec!["ai".into(), "llm".into(), "prompt".into(), "agent".into()] },
        SkillCategory { id: "mobile".into(), name: "移动端".into(), icon: "smartphone".into(), keywords: vec!["mobile".into(), "ios".into(), "android".into()] },
    ])
}

#[derive(serde::Serialize)]
pub struct SkillCategory {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub keywords: Vec<String>,
}
