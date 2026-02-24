use log::info;
use rusqlite::params;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

use super::skill_files::{compute_db_checksum, db_export_to_dir, db_write_file};
use super::utils::compute_dir_checksum;
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

/// GitHub Contents API 目录列表条目
#[derive(serde::Deserialize)]
struct GhContentsEntry {
    name: String,
    #[allow(dead_code)]
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
    #[serde(default)]
    download_url: Option<String>,
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

// ── 3b. Fetch SKILL.md via raw.githubusercontent.com (no API rate limits) ──

/// 直接通过 raw.githubusercontent.com 获取 SKILL.md 内容
/// 相比 fetch_skill_content（GitHub Blob API），此方法：
/// 1. 不消耗 GitHub API 配额（60次/小时未认证限制）
/// 2. 不需要先扫描 Tree，只需 owner_repo + skill_path 即可
/// 3. 延迟更低（直接返回文本，无需 base64 解码）
#[tauri::command]
/// 通过 raw.githubusercontent.com 按路径获取 SKILL.md / CLAUDE.md
///
/// 策略（按消耗 GitHub API 配额从低到高排列）：
///   Phase 1 – raw URL 快速尝试（无 API 配额消耗）
///   Phase 2 – Contents API 列出 skills/ 目录，找最匹配子目录（1 次 API 调用）
///   Phase 3 – Contents API 列出仓库根目录（1 次 API 调用），处理单 skill 仓库
///   Phase 4 – 兜底读取 CLAUDE.md / README.md（无 API 配额消耗）
///
/// 不再使用 Tree API（递归完整树），避免 GitHub 匿名 rate limit 问题。
pub async fn fetch_skill_readme(
    owner_repo: String,
    skill_path: String,
    token: Option<String>,
) -> Result<String, AppError> {
    info!("[fetch_skill_readme] {}/{}", owner_repo, skill_path);

    let client = reqwest::Client::new();

    // ── Phase 1: raw URL 快速路径（不消耗 GitHub API 配额）──
    // skills.sh 生态最常见结构：skills/{name}/SKILL.md
    let name_variants = derive_name_variants(&skill_path);
    // 候选文件名：SKILL.md 优先
    let skill_filenames = ["SKILL.md"];
    let prefixes = ["skills/", "", "src/"];

    // 只在 main 分支快速尝试最高概率路径，减少无效请求
    for branch in &["main", "master"] {
        for prefix in &prefixes {
            for variant in &name_variants {
                for filename in &skill_filenames {
                    let url = format!(
                        "https://raw.githubusercontent.com/{}/{}/{}{}/{}",
                        owner_repo, branch, prefix, variant, filename
                    );
                    let mut req = client.get(&url).header("User-Agent", "skills-manager");
                    if let Some(ref t) = token {
                        req = req.header("Authorization", format!("Bearer {}", t));
                    }
                    match req.send().await {
                        Ok(resp) if resp.status().is_success() => {
                            let text = resp.text().await
                                .map_err(|e| AppError::Internal(format!("读取内容失败: {}", e)))?;
                            info!("[fetch_skill_readme] ✓ raw 命中: {} ({} 字节)", url, text.len());
                            return Ok(text);
                        }
                        Ok(resp) => info!("[fetch_skill_readme] {} → {}", url, resp.status()),
                        Err(e) => info!("[fetch_skill_readme] 请求失败: {}", e),
                    }
                }
            }
            // 只在标准结构失败后继续，避免过多无效请求
        }
    }

    info!("[fetch_skill_readme] raw 快速路径全部失败，尝试 Contents API 目录列表");

    // 确定默认分支（先试 main，再试 master）
    let working_branch = detect_default_branch(&client, &owner_repo, &token).await
        .unwrap_or_else(|| "main".to_string());

    // ── Phase 2: Contents API 列出 skills/ 子目录，模糊匹配 ──
    // 比 Tree API（recursive=1）便宜得多，只消耗 1 次 API 配额
    for dir_prefix in &["skills", "src", ""] {
        let contents_url = if dir_prefix.is_empty() {
            format!(
                "https://api.github.com/repos/{}/contents",
                owner_repo
            )
        } else {
            format!(
                "https://api.github.com/repos/{}/contents/{}",
                owner_repo, dir_prefix
            )
        };

        let mut req = client
            .get(&contents_url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "skills-manager");
        if let Some(ref t) = token {
            req = req.header("Authorization", format!("Bearer {}", t));
        }

        let resp = match req.send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                info!("[fetch_skill_readme] Contents API {} → {}", contents_url, r.status());
                continue;
            }
            Err(e) => {
                info!("[fetch_skill_readme] Contents API 请求失败: {}", e);
                continue;
            }
        };

        let entries: Vec<GhContentsEntry> = match resp.json().await {
            Ok(e) => e,
            Err(e) => {
                info!("[fetch_skill_readme] Contents API 解析失败: {}", e);
                continue;
            }
        };

        info!(
            "[fetch_skill_readme] Contents API {} 返回 {} 条",
            dir_prefix, entries.len()
        );

        // 先找直接的 SKILL.md 文件（根目录或 dir_prefix 下）
        let direct_skill_md = entries.iter().find(|e| {
            e.entry_type == "file" && (e.name == "SKILL.md" || e.name == "CLAUDE.md")
        });
        if let Some(file_entry) = direct_skill_md {
            if let Some(ref dl_url) = file_entry.download_url {
                let mut req = client.get(dl_url).header("User-Agent", "skills-manager");
                if let Some(ref t) = token {
                    req = req.header("Authorization", format!("Bearer {}", t));
                }
                if let Ok(r) = req.send().await {
                    if r.status().is_success() {
                        let text = r.text().await
                            .map_err(|e| AppError::Internal(format!("读取内容失败: {}", e)))?;
                        info!(
                            "[fetch_skill_readme] ✓ Contents 直接命中 {}/{} ({} 字节)",
                            dir_prefix, file_entry.name, text.len()
                        );
                        return Ok(text);
                    }
                }
            }
        }

        // 在子目录中找最匹配的 skill 目录
        let subdirs: Vec<&GhContentsEntry> = entries
            .iter()
            .filter(|e| e.entry_type == "dir")
            .collect();

        let dir_names: Vec<&str> = subdirs.iter().map(|e| e.name.as_str()).collect();
        if let Some(best_dir_name) = find_best_dir_match(&skill_path, &dir_names) {
            let skill_md_path = if dir_prefix.is_empty() {
                format!("{}/SKILL.md", best_dir_name)
            } else {
                format!("{}/{}/SKILL.md", dir_prefix, best_dir_name)
            };
            let raw_url = format!(
                "https://raw.githubusercontent.com/{}/{}/{}",
                owner_repo, working_branch, skill_md_path
            );
            info!(
                "[fetch_skill_readme] Contents 匹配: '{}' → '{}', 尝试 {}",
                skill_path, best_dir_name, raw_url
            );
            let mut req = client.get(&raw_url).header("User-Agent", "skills-manager");
            if let Some(ref t) = token {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
            if let Ok(r) = req.send().await {
                if r.status().is_success() {
                    let text = r.text().await
                        .map_err(|e| AppError::Internal(format!("读取内容失败: {}", e)))?;
                    info!(
                        "[fetch_skill_readme] ✓ Contents 模糊匹配成功 ({} 字节)",
                        text.len()
                    );
                    return Ok(text);
                }
            }

            // SKILL.md 不存在，试 CLAUDE.md
            let claude_path = skill_md_path.replace("SKILL.md", "CLAUDE.md");
            let claude_url = format!(
                "https://raw.githubusercontent.com/{}/{}/{}",
                owner_repo, working_branch, claude_path
            );
            let mut req = client.get(&claude_url).header("User-Agent", "skills-manager");
            if let Some(ref t) = token {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
            if let Ok(r) = req.send().await {
                if r.status().is_success() {
                    let text = r.text().await
                        .map_err(|e| AppError::Internal(format!("读取内容失败: {}", e)))?;
                    info!("[fetch_skill_readme] ✓ CLAUDE.md 匹配成功 ({} 字节)", text.len());
                    return Ok(text);
                }
            }
        }
    }

    // ── Phase 3: 兜底——读取仓库根目录 CLAUDE.md 或 README.md ──
    // 适用于单 skill 仓库（如 nextlevelbuilder/ui-ux-pro-max-skill）
    for fallback_file in &["CLAUDE.md", "README.md"] {
        let url = format!(
            "https://raw.githubusercontent.com/{}/{}/{}",
            owner_repo, working_branch, fallback_file
        );
        let mut req = client.get(&url).header("User-Agent", "skills-manager");
        if let Some(ref t) = token {
            req = req.header("Authorization", format!("Bearer {}", t));
        }
        if let Ok(resp) = req.send().await {
            if resp.status().is_success() {
                let text = resp.text().await
                    .map_err(|e| AppError::Internal(format!("读取内容失败: {}", e)))?;
                info!("[fetch_skill_readme] ✓ 兜底 {} ({} 字节)", fallback_file, text.len());
                return Ok(text);
            }
        }
    }

    Err(AppError::Internal(format!(
        "无法获取 {}/{} 的 Skill 内容（已尝试 raw 路径、Contents API 目录列表及兜底文件）",
        owner_repo, skill_path
    )))
}

/// 从 skill_id/skill_path 推导可能的目录名变体
/// 处理 skills.sh ID 与实际 GitHub 目录名的常见差异
fn derive_name_variants(skill_path: &str) -> Vec<String> {
    let mut variants = vec![skill_path.to_string()];

    // 去掉第一个 "-" 前的 org 前缀（如 "vercel-react-native" → "react-native"）
    if let Some(idx) = skill_path.find('-') {
        let without_prefix = &skill_path[idx + 1..];
        if !without_prefix.is_empty() && without_prefix != skill_path {
            variants.push(without_prefix.to_string());
        }
    }

    // 去掉多个常见 org 前缀
    for prefix in &["vercel-", "react-", "nextjs-", "vue-", "angular-", "remotion-"] {
        if let Some(stripped) = skill_path.strip_prefix(prefix) {
            if !stripped.is_empty() {
                variants.push(stripped.to_string());
            }
        }
    }

    // 去掉常见后缀（如 "best-practices" 中第一个词作为简称）
    // 例如 "remotion-best-practices" → "remotion"
    if let Some(idx) = skill_path.find('-') {
        let first_word = &skill_path[..idx];
        if first_word.len() >= 3 {
            variants.push(first_word.to_string());
        }
    }

    // 去重保序
    let mut seen = std::collections::HashSet::new();
    variants.retain(|v| seen.insert(v.clone()));
    variants
}

/// 从 Contents API 返回的目录名列表中，找与 skill_name 最匹配的目录名
/// 策略顺序：精确匹配 → 包含匹配 → 去前缀后匹配 → 词语重叠最多
fn find_best_dir_match<'a>(skill_name: &str, dir_names: &[&'a str]) -> Option<&'a str> {
    let skill_lower = skill_name.to_lowercase();

    // 1. 精确匹配
    for &name in dir_names {
        if name.to_lowercase() == skill_lower {
            return Some(name);
        }
    }

    // 2. skill_name 包含目录名，或目录名包含 skill_name
    for &name in dir_names {
        let name_lower = name.to_lowercase();
        if skill_lower.contains(&name_lower) || name_lower.contains(&skill_lower) {
            return Some(name);
        }
    }

    // 3. 去掉双方第一段前缀后比较（"remotion-best-practices" 的第一词 "remotion" vs dir "remotion"）
    let skill_first_word = skill_lower
        .split('-')
        .next()
        .unwrap_or(&skill_lower);
    let skill_core = skill_lower
        .find('-')
        .map(|i| &skill_lower[i + 1..])
        .unwrap_or(&skill_lower);

    for &name in dir_names {
        let name_lower = name.to_lowercase();
        // 目录名与 skill 第一个词完全匹配（"remotion" == "remotion"）
        if name_lower == skill_first_word {
            return Some(name);
        }
        let dir_core = name_lower
            .find('-')
            .map(|i| name_lower[i + 1..].to_string())
            .unwrap_or_else(|| name_lower.clone());
        if skill_core == dir_core || skill_core.contains(&dir_core as &str) || dir_core.contains(skill_core) {
            return Some(name);
        }
    }

    // 4. 词语重叠：计算共同的连字符分词数量
    let mut best: Option<(&str, usize)> = None;
    for &name in dir_names {
        let name_lower_owned = name.to_lowercase();
        let dir_words: std::collections::HashSet<&str> = name_lower_owned
            .split('-')
            .collect::<Vec<_>>()
            .into_iter()
            .collect();
        // 由于生命周期限制，重新基于 skill_lower 分词
        let overlap = skill_lower.split('-')
            .filter(|w| name_lower_owned.split('-').any(|d| d == *w))
            .count();
        let _ = dir_words; // suppress unused
        if overlap > 0 {
            match best {
                None => best = Some((name, overlap)),
                Some((_, prev)) if overlap > prev => best = Some((name, overlap)),
                _ => {}
            }
        }
    }
    if let Some((name, _)) = best {
        return Some(name);
    }

    None
}

/// 检测仓库默认分支，通过 GitHub refs API 验证（消耗 1 次配额）
async fn detect_default_branch(
    client: &reqwest::Client,
    owner_repo: &str,
    token: &Option<String>,
) -> Option<String> {
    for branch in &["main", "master"] {
        let api_url = format!(
            "https://api.github.com/repos/{}/git/refs/heads/{}",
            owner_repo, branch
        );
        let mut req = client
            .get(&api_url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "skills-manager");
        if let Some(ref t) = token {
            req = req.header("Authorization", format!("Bearer {}", t));
        }
        if let Ok(r) = req.send().await {
            if r.status().is_success() {
                return Some(branch.to_string());
            }
        }
    }
    Some("main".to_string())
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

    // Safety: skill_name 不能为空，否则会删除整个 skills 目录
    if skill_name.trim().is_empty() {
        return Err(AppError::Validation("skill_name 不能为空".into()));
    }

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

    // Step 2: 先确定 skill_id（用于写入 DB skill_files）
    // 需要先 INSERT OR 获取已有记录，再写文件
    let pre_skill_id: String = {
        let conn = pool.get()?;
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM skills WHERE name = ?1",
                params![skill_name],
                |row| row.get(0),
            )
            .optional()?;
        existing.unwrap_or_else(|| Uuid::new_v4().to_string())
    };

    // 若强制覆盖，先清空 DB 中的旧文件
    if force {
        let conn = pool.get()?;
        let _ = conn.execute(
            "DELETE FROM skill_files WHERE skill_id = ?1",
            params![pre_skill_id],
        );
    }

    let client = reqwest::Client::new();
    let mut files_downloaded = 0usize;
    let mut skill_md_content: Option<String> = None;

    {
        let conn = pool.get()?;
        for file_entry in &files {
            // 提取相对于 skill_path 的路径
            let relative_path = file_entry
                .path
                .strip_prefix(&format!("{}/", skill_path))
                .unwrap_or(&file_entry.path);

            // 跳过不需要的文件
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

            // 写入 DB skill_files（权威源）
            db_write_file(&conn, &pre_skill_id, relative_path, &decoded)?;
            files_downloaded += 1;

            // 记录 SKILL.md 内容用于解析 frontmatter
            if relative_path == "SKILL.md" {
                skill_md_content = String::from_utf8(decoded).ok();
            }
        }
    }

    info!(
        "[install_from_skills_sh] 下载完成: {} 个文件写入 DB",
        files_downloaded
    );

    // Step 3: Parse SKILL.md frontmatter for description/version
    let (description, version) = if let Some(ref content) = skill_md_content {
        parse_skill_md_frontmatter(content)
    } else {
        (None, None)
    };

    // Step 4: Compute checksum from DB files and write to database
    let checksum = {
        let conn = pool.get()?;
        compute_db_checksum(&conn, &pre_skill_id)
    };
    let local_path_str = String::new(); // DB 是权威源，local_path 不再必要
    let source_url = format!(
        "https://skills.sh/{}/{}",
        owner_repo,
        skill_name
    );

    let skill_id = {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;

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
                        last_modified = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?4",
                params![description, version, checksum, eid],
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
            // Insert new（使用前面预分配的 pre_skill_id）
            let source_id = Uuid::new_v4().to_string();

            tx.execute(
                "INSERT INTO skills (id, name, description, version, checksum, last_modified)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                params![pre_skill_id, skill_name, description, version, checksum],
            )?;

            tx.execute(
                "INSERT INTO skill_sources (id, skill_id, source_type, url, installed_version,
                        original_checksum, remote_sha, skill_path)
                 VALUES (?1, ?2, 'skills-sh', ?3, ?4, ?5, ?6, ?7)",
                params![
                    source_id,
                    pre_skill_id,
                    source_url,
                    version,
                    checksum,
                    folder_sha,
                    skill_path
                ],
            )?;

            pre_skill_id.clone()
        };

        tx.commit()?;
        sid
    };

    // Step 5: Deploy to targets
    let mut deployments_created = 0usize;
    for target in &deploy_targets {
        // source_dir 参数已废弃（部署从 DB skill_files 导出），传空路径
        let deploy_result =
            deploy_skill_internal(&pool, &skill_id, &skill_name, target, std::path::Path::new("")).await;
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
             VALUES (?1, ?2, 'import', 'success', datetime('now'))",
            params![Uuid::new_v4().to_string(), skill_id],
        )?;
    }

    info!(
        "[install_from_skills_sh] 安装完成: skill_id={}, files={}, deploys={}",
        skill_id, files_downloaded, deployments_created
    );

    let _ = local_path_str; // DB 是权威源，不再返回 local_path
    Ok(SkillsShInstallResult {
        skill_id,
        local_path: String::new(),
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
    _source_dir: &Path,
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

    // Safety: 防止 skill_name 为空时删除整个 skills 父目录
    if skill_name.trim().is_empty() {
        return Err(AppError::Validation("skill_name 不能为空，拒绝部署".into()));
    }

    // 从 DB skill_files 导出到部署目标目录
    if deploy_path.exists() {
        let _ = std::fs::remove_dir_all(&deploy_path);
    }
    {
        let conn = pool.get()?;
        db_export_to_dir(&conn, skill_id, &deploy_path)?;
    }

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
