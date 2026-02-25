use log::info;
use rusqlite::{params, OptionalExtension};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use super::skill_files::{compute_db_checksum, db_write_file};
use crate::db::DbPool;
use crate::error::AppError;
use crate::models::*;

// ── 内存缓存 ──

struct CatalogCache {
    skills: Vec<CatalogSkill>,
    fetched_at: std::time::Instant,
}

static CATALOG_CACHE: Mutex<Option<CatalogCache>> = Mutex::new(None);

const CATALOG_TTL_SECS: u64 = 86400; // 24 小时
const INSTALLS_TTL_SECS: i64 = 604800; // 7 天（秒）

// ── catalog.json 原始结构 ──

#[derive(serde::Deserialize)]
struct RawCatalog {
    skills: Vec<RawCatalogSkill>,
}

#[derive(serde::Deserialize)]
struct RawCatalogSkill {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    description: Option<String>,
    #[serde(default)]
    provider: String,
    #[serde(default)]
    category: String,
    license: Option<String>,
    compatibility: Option<String>,
    last_updated_at: Option<String>,
    #[serde(default)]
    has_scripts: bool,
    #[serde(default)]
    has_references: bool,
    #[serde(default)]
    has_assets: bool,
    #[serde(default)]
    tags: Vec<String>,
    days_since_update: Option<u32>,
    maintenance_status: Option<String>,
    #[serde(default)]
    quality_score: u32,
    source: RawCatalogSource,
}


#[derive(serde::Deserialize)]
struct RawCatalogSource {
    #[serde(default)]
    repo: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    skill_md_url: String,
    #[serde(default)]
    commit_sha: String,
}

fn raw_to_catalog(r: RawCatalogSkill) -> CatalogSkill {
    CatalogSkill {
        id: r.id,
        name: r.name,
        description: r.description,
        provider: r.provider,
        category: r.category,
        license: r.license,
        compatibility: r.compatibility,
        last_updated_at: r.last_updated_at.unwrap_or_default(),
        has_scripts: r.has_scripts,
        has_references: r.has_references,
        has_assets: r.has_assets,
        tags: r.tags,
        days_since_update: r.days_since_update.unwrap_or(0),
        maintenance_status: r.maintenance_status.unwrap_or_else(|| "unknown".to_string()),
        quality_score: r.quality_score,
        source_repo: r.source.repo,
        source_path: r.source.path,
        skill_md_url: r.source.skill_md_url,
        commit_sha: r.source.commit_sha,
        installs: None,
    }
}

// ── 内部 helper：加载全量 catalog（带内存缓存） ──

async fn load_catalog_all() -> Result<Vec<CatalogSkill>, AppError> {
    // 检查内存缓存
    {
        let guard = CATALOG_CACHE.lock().map_err(|_| AppError::Internal("锁污染".into()))?;
        if let Some(ref cache) = *guard {
            if cache.fetched_at.elapsed().as_secs() < CATALOG_TTL_SECS {
                info!("[load_catalog_all] 命中内存缓存，共 {} 条", cache.skills.len());
                return Ok(cache.skills.clone());
            }
        }
    }

    // 拉取 catalog，依次尝试多个镜像，任一成功即止
    info!("[load_catalog_all] 拉取 dmgrok catalog.json...");
    const CATALOG_URLS: &[&str] = &[
        "https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.json",
        "https://raw.githubusercontent.com/dmgrok/agent_skills_directory/main/catalog.json",
        "https://ghproxy.com/https://raw.githubusercontent.com/dmgrok/agent_skills_directory/main/catalog.json",
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    let mut last_err = String::new();
    let mut raw_opt: Option<RawCatalog> = None;

    for url in CATALOG_URLS {
        info!("[load_catalog_all] 尝试: {}", url);
        match client
            .get(*url)
            .header("User-Agent", "shirehub-skills-manager")
            .header("Accept-Encoding", "identity")
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<RawCatalog>().await {
                    Ok(parsed) => {
                        raw_opt = Some(parsed);
                        break;
                    }
                    Err(e) => {
                        last_err = format!("解析失败 ({}): {}", url, e);
                        info!("[load_catalog_all] {}", last_err);
                    }
                }
            }
            Ok(resp) => {
                last_err = format!("HTTP {} ({})", resp.status(), url);
                info!("[load_catalog_all] {}", last_err);
            }
            Err(e) => {
                last_err = format!("请求失败 ({}): {}", url, e);
                info!("[load_catalog_all] {}", last_err);
            }
        }
    }

    let raw = raw_opt.ok_or_else(|| AppError::Internal(format!("所有镜像均拉取失败，最后错误: {}", last_err)))?;

    let mut skills: Vec<CatalogSkill> = raw.skills.into_iter().map(raw_to_catalog).collect();
    skills.sort_by(|a, b| b.quality_score.cmp(&a.quality_score));

    info!("[load_catalog_all] 拉取成功，共 {} 个 Skill", skills.len());

    {
        let mut guard = CATALOG_CACHE.lock().map_err(|_| AppError::Internal("锁污染".into()))?;
        *guard = Some(CatalogCache {
            skills: skills.clone(),
            fetched_at: std::time::Instant::now(),
        });
    }

    Ok(skills)
}

// ── 1. fetch_catalog ──

#[tauri::command]
pub async fn fetch_catalog(
    category: Option<String>,
) -> Result<Vec<CatalogSkill>, AppError> {
    info!("[fetch_catalog] category={:?}", category);
    let skills = load_catalog_all().await?;
    let result = filter_by_category(&skills, &category);
    info!("[fetch_catalog] 返回 {} 条", result.len());
    Ok(result)
}

fn filter_by_category(skills: &[CatalogSkill], category: &Option<String>) -> Vec<CatalogSkill> {
    match category {
        None => skills.to_vec(),
        Some(cat) if cat.is_empty() => skills.to_vec(),
        Some(cat) => skills
            .iter()
            .filter(|s| s.category.eq_ignore_ascii_case(cat))
            .cloned()
            .collect(),
    }
}

// ── 2. search_catalog ──

#[tauri::command]
pub async fn search_catalog(
    query: String,
    category: Option<String>,
) -> Result<Vec<CatalogSkill>, AppError> {
    info!("[search_catalog] query={}, category={:?}", query, category);

    // 先确保缓存已加载
    let all = fetch_catalog(None).await?;

    let q = query.to_lowercase();
    let mut results: Vec<CatalogSkill> = all
        .into_iter()
        .filter(|s| {
            // category 过滤
            if let Some(ref cat) = category {
                if !cat.is_empty() && !s.category.eq_ignore_ascii_case(cat) {
                    return false;
                }
            }
            // 关键词匹配
            s.name.to_lowercase().contains(&q)
                || s.description
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase()
                    .contains(&q)
                || s.tags.iter().any(|t| t.to_lowercase().contains(&q))
                || s.provider.to_lowercase().contains(&q)
        })
        .collect();

    // 按质量分降序
    results.sort_by(|a, b| b.quality_score.cmp(&a.quality_score));
    info!("[search_catalog] 匹配到 {} 条", results.len());
    Ok(results)
}

// ── 3. enrich_single_install ── （详情面板按需调用，带 SQLite 缓存）

#[tauri::command]
pub async fn enrich_single_install(
    skill_name: String,
    source_repo: String,
    pool: State<'_, DbPool>,
) -> Result<Option<u64>, AppError> {
    info!("[enrich_single_install] name={}", skill_name);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // 查 SQLite 缓存
    {
        let conn = pool.get()?;
        let cached: Option<(i64, i64)> = conn
            .query_row(
                "SELECT installs, fetched_at FROM catalog_installs_cache WHERE skill_name = ?1",
                params![skill_name],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        if let Some((installs, fetched_at)) = cached {
            if now - fetched_at < INSTALLS_TTL_SECS {
                info!(
                    "[enrich_single_install] 命中缓存: {} installs={}",
                    skill_name, installs
                );
                return Ok(Some(installs as u64));
            }
        }
    }

    // 调 skills.sh 搜索 API
    let client = reqwest::Client::new();
    let url = format!(
        "https://skills.sh/api/search?q={}&limit=10",
        urlencoding_encode(&skill_name)
    );
    info!("[enrich_single_install] 请求 skills.sh: {}", url);

    let resp = client
        .get(&url)
        .header("User-Agent", "shirehub-skills-manager")
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("skills.sh 请求失败: {}", e)))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    #[derive(serde::Deserialize)]
    struct ApiResp {
        skills: Option<Vec<SkillsShSearchResult>>,
    }

    let data: ApiResp = resp
        .json()
        .await
        .map_err(|_| AppError::Internal("解析 skills.sh 响应失败".into()))?;

    let installs = data
        .skills
        .unwrap_or_default()
        .into_iter()
        .find(|s| {
            // 按 source 精确匹配（避免误匹配同名 Skill）
            let source_match = s.source.contains(&source_repo)
                || source_repo.contains(&s.source)
                || s.source.is_empty(); // 部分条目无 source 时按名称匹配
            let name_match = s.name.to_lowercase() == skill_name.to_lowercase()
                || s.skill_id.to_lowercase() == skill_name.to_lowercase();
            name_match && source_match
        })
        .map(|s| s.installs);

    if let Some(cnt) = installs {
        // 写入缓存
        let conn = pool.get()?;
        conn.execute(
            "INSERT OR REPLACE INTO catalog_installs_cache (skill_name, installs, fetched_at)
             VALUES (?1, ?2, ?3)",
            params![skill_name, cnt as i64, now],
        )?;
        info!("[enrich_single_install] 写入缓存: {} installs={}", skill_name, cnt);
    }

    Ok(installs)
}

// ── 4. enrich_batch_by_category ── （切换分类 tab 时静默预热缓存）

#[tauri::command]
pub async fn enrich_batch_by_category(
    category_keyword: String,
    pool: State<'_, DbPool>,
) -> Result<(), AppError> {
    info!("[enrich_batch_by_category] keyword={}", category_keyword);

    let client = reqwest::Client::new();
    let url = format!(
        "https://skills.sh/api/search?q={}&limit=50",
        urlencoding_encode(&category_keyword)
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "shirehub-skills-manager")
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("skills.sh 请求失败: {}", e)))?;

    if !resp.status().is_success() {
        return Ok(());
    }

    #[derive(serde::Deserialize)]
    struct ApiResp {
        skills: Option<Vec<SkillsShSearchResult>>,
    }

    let data: ApiResp = match resp.json().await {
        Ok(d) => d,
        Err(_) => return Ok(()),
    };

    let skills = data.skills.unwrap_or_default();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let conn = pool.get()?;
    for s in &skills {
        if s.installs > 0 {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO catalog_installs_cache (skill_name, installs, fetched_at)
                 VALUES (?1, ?2, ?3)",
                params![s.name, s.installs as i64, now],
            );
        }
    }

    info!("[enrich_batch_by_category] 预热 {} 条安装量缓存", skills.len());
    Ok(())
}

// ── 5. install_from_catalog ── （Contents API 获取文件列表 + Raw URL 下载）

#[derive(serde::Deserialize)]
struct GhContentsEntry {
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
    #[serde(default)]
    download_url: Option<String>,
}

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

#[tauri::command]
pub async fn install_from_catalog(
    source_repo: String,
    source_path: String,
    skill_name: String,
    commit_sha: String,
    deploy_targets: Vec<DeployTarget>,
    force_overwrite: Option<bool>,
    token: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<SkillsShInstallResult, AppError> {
    info!(
        "[install_from_catalog] skill={}, repo={}, path={}, sha={}",
        skill_name, source_repo, source_path, commit_sha
    );

    if skill_name.trim().is_empty() {
        return Err(AppError::Validation("skill_name 不能为空".into()));
    }

    let force = force_overwrite.unwrap_or(false);

    // Step 1: 冲突检查
    let pre_skill_id: String = {
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
                let original_checksum: Option<String> = conn
                    .query_row(
                        "SELECT original_checksum FROM skill_sources WHERE skill_id = ?1",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .optional()?
                    .flatten();

                let locally_modified = existing_checksum != original_checksum;
                let conflict_type = if locally_modified {
                    "locally_modified"
                } else {
                    "already_installed"
                };
                return Ok(SkillsShInstallResult {
                    skill_id: existing_id,
                    files_downloaded: 0,
                    deployments_created: 0,
                    conflict: Some(InstallConflict {
                        conflict_type: conflict_type.to_string(),
                        local_version: existing_version,
                        local_checksum: existing_checksum,
                    }),
                });
            }
            existing_id
        } else {
            Uuid::new_v4().to_string()
        }
    };

    // 强制覆盖时清空旧文件；新安装时先插入占位记录（FK 约束要求 skill_id 存在）
    {
        let conn = pool.get()?;
        if force {
            let _ = conn.execute(
                "DELETE FROM skill_files WHERE skill_id = ?1",
                params![pre_skill_id],
            );
        } else {
            // 新安装：只有 pre_skill_id 不在 skills 表时才插占位
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(1) FROM skills WHERE id = ?1",
                    params![pre_skill_id],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap_or(0) > 0;
            if !exists {
                conn.execute(
                    "INSERT INTO skills (id, name) VALUES (?1, ?2)",
                    params![pre_skill_id, skill_name],
                )?;
            }
        }
    }

    // Step 2: Contents API 获取文件列表（含 download_url）
    // source_repo 可能是完整 GitHub URL（如 https://github.com/openai/skills），需提取 owner/repo
    let owner_repo = extract_owner_repo(&source_repo)
        .unwrap_or_else(|| source_repo.trim_start_matches("https://github.com/").to_string());
    let contents_url = if source_path.is_empty() {
        format!(
            "https://api.github.com/repos/{}/contents?ref={}",
            owner_repo, commit_sha
        )
    } else {
        format!(
            "https://api.github.com/repos/{}/contents/{}?ref={}",
            owner_repo, source_path, commit_sha
        )
    };

    info!("[install_from_catalog] Contents API: {}", contents_url);
    let client = reqwest::Client::new();
    let mut req = client
        .get(&contents_url)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "shirehub-skills-manager")
        .header("Accept-Encoding", "identity");

    if let Some(ref t) = token {
        if !t.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", t));
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Contents API 请求失败: {}", e)))?;

    if !resp.status().is_success() {
        return Err(AppError::Internal(format!(
            "Contents API 返回 HTTP {}",
            resp.status()
        )));
    }

    let entries: Vec<GhContentsEntry> = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("解析 Contents API 响应失败: {}", e)))?;

    // Step 3: 逐文件用 download_url（Raw URL）下载
    let mut files_downloaded = 0usize;
    let mut skill_md_content: Option<String> = None;

    {
        let conn = pool.get()?;
        for entry in &entries {
            if entry.entry_type != "file" {
                continue;
            }

            // 跳过无关文件
            let fname = &entry.name;
            if fname == "README.md"
                || fname == "metadata.json"
                || fname.starts_with('_')
                || fname.starts_with('.')
            {
                continue;
            }

            let download_url = match &entry.download_url {
                Some(u) if !u.is_empty() => u.clone(),
                _ => {
                    info!(
                        "[install_from_catalog] 跳过 {} (无 download_url)",
                        fname
                    );
                    continue;
                }
            };

            // Raw URL 直接下载，不消耗 GitHub API 配额
            let mut raw_req = client
                .get(&download_url)
                .header("User-Agent", "shirehub-skills-manager");

            if let Some(ref t) = token {
                if !t.is_empty() {
                    raw_req = raw_req.header("Authorization", format!("Bearer {}", t));
                }
            }

            let file_resp = raw_req.send().await.map_err(|e| {
                AppError::Internal(format!("下载文件 {} 失败: {}", fname, e))
            })?;

            if !file_resp.status().is_success() {
                info!(
                    "[install_from_catalog] 跳过 {} (HTTP {})",
                    fname,
                    file_resp.status()
                );
                continue;
            }

            let bytes = file_resp.bytes().await.map_err(|e| {
                AppError::Internal(format!("读取文件 {} 失败: {}", fname, e))
            })?;

            db_write_file(&conn, &pre_skill_id, fname, &bytes)?;
            files_downloaded += 1;

            if fname == "SKILL.md" {
                skill_md_content = String::from_utf8(bytes.to_vec()).ok();
            }
        }
    }

    info!(
        "[install_from_catalog] 下载完成: {} 个文件写入 DB",
        files_downloaded
    );

    // Step 4: 解析 SKILL.md frontmatter
    let (description, version) = if let Some(ref content) = skill_md_content {
        parse_skill_md_frontmatter(content)
    } else {
        (None, None)
    };

    // Step 5: 计算 checksum，写 skills + skill_sources
    let checksum = {
        let conn = pool.get()?;
        compute_db_checksum(&conn, &pre_skill_id)
    };

    let source_url = format!("https://github.com/{}/tree/{}/{}", source_repo, commit_sha, source_path);

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
                params![source_url, version, checksum, commit_sha, source_path, eid],
            )?;
            eid
        } else {
            let source_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO skills (id, name, description, version, checksum, last_modified)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                params![pre_skill_id, skill_name, description, version, checksum],
            )?;
            tx.execute(
                "INSERT INTO skill_sources
                    (id, skill_id, source_type, url, installed_version,
                     original_checksum, remote_sha, skill_path)
                 VALUES (?1, ?2, 'skills-sh', ?3, ?4, ?5, ?6, ?7)",
                params![
                    source_id,
                    pre_skill_id,
                    source_url,
                    version,
                    checksum,
                    commit_sha,
                    source_path
                ],
            )?;
            pre_skill_id.clone()
        };

        tx.commit()?;
        sid
    };

    // Step 6: 部署到目标
    let mut deployments_created = 0usize;
    for target in &deploy_targets {
        let deploy_result = deploy_skill_internal(
            &pool,
            &skill_id,
            &skill_name,
            target,
            std::path::Path::new(""),
        )
        .await;
        match deploy_result {
            Ok(_) => deployments_created += 1,
            Err(e) => info!(
                "[install_from_catalog] 部署失败 {:?}/{}: {}",
                target.project_id, target.tool, e
            ),
        }
    }

    // Step 7: 写 sync_history
    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO sync_history (id, skill_id, action, status, created_at)
             VALUES (?1, ?2, 'import', 'success', datetime('now'))",
            params![Uuid::new_v4().to_string(), skill_id],
        )?;
    }

    info!(
        "[install_from_catalog] 安装完成: skill_id={}, files={}, deploys={}",
        skill_id, files_downloaded, deployments_created
    );

    Ok(SkillsShInstallResult {
        skill_id,
        files_downloaded,
        deployments_created,
        conflict: None,
    })
}

// ── 6. search_skills_sh ── （直接查询 skills.sh 搜索 API）

#[tauri::command]
pub async fn search_skills_sh(query: String) -> Result<Vec<SkillsShSearchResult>, AppError> {
    info!("[search_skills_sh] query={}", query);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    let url = format!(
        "https://skills.sh/api/search?q={}&limit=50",
        urlencoding_encode(&query)
    );
    info!("[search_skills_sh] url={}", url);

    let resp = client
        .get(&url)
        .header("User-Agent", "shirehub-skills-manager")
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("skills.sh 请求失败: {}", e)))?;

    if !resp.status().is_success() {
        info!("[search_skills_sh] HTTP {}", resp.status());
        return Ok(vec![]);
    }

    #[derive(serde::Deserialize)]
    struct ApiResp {
        skills: Option<Vec<SkillsShSearchResult>>,
    }

    let data: ApiResp = resp
        .json()
        .await
        .map_err(|_| AppError::Internal("解析 skills.sh 响应失败".into()))?;

    let skills = data.skills.unwrap_or_default();
    info!("[search_skills_sh] 返回 {} 条", skills.len());
    Ok(skills)
}

// ── 7. install_from_skills_sh ── （从 skills.sh 安装：先发现路径，再委托 install_from_catalog）

fn extract_frontmatter_name(content: &str) -> Option<String> {
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = &trimmed[3..];
    let end_idx = rest.find("---")?;
    let frontmatter = &rest[..end_idx];
    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("name:") {
            return Some(
                val.trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string(),
            );
        }
    }
    None
}

#[derive(serde::Deserialize)]
struct GitTreeEntry {
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
}

#[derive(serde::Deserialize)]
struct GitTree {
    tree: Vec<GitTreeEntry>,
}

async fn discover_skill_path_in_repo(
    client: &reqwest::Client,
    owner_repo: &str,
    skill_id: &str,
    token: &Option<String>,
) -> Result<(String, String), AppError> {
    info!(
        "[discover_skill_path] owner_repo={}, skill_id={}",
        owner_repo, skill_id
    );

    // Step 1: 获取最新 commit SHA
    #[derive(serde::Deserialize)]
    struct CommitInfo {
        sha: String,
    }

    let commits_url = format!("https://api.github.com/repos/{}/commits/HEAD", owner_repo);
    let mut commits_req = client
        .get(&commits_url)
        .header("User-Agent", "shirehub-skills-manager")
        .header("Accept", "application/vnd.github.v3+json");
    if let Some(ref t) = token {
        if !t.is_empty() {
            commits_req = commits_req.header("Authorization", format!("Bearer {}", t));
        }
    }
    let commit_sha = match commits_req.send().await {
        Ok(r) if r.status().is_success() => r
            .json::<CommitInfo>()
            .await
            .map(|c| c.sha)
            .unwrap_or_else(|_| "HEAD".to_string()),
        _ => "HEAD".to_string(),
    };
    info!("[discover_skill_path] commit_sha={}", commit_sha);

    // Step 2: 递归获取文件树
    let tree_url = format!(
        "https://api.github.com/repos/{}/git/trees/{}?recursive=1",
        owner_repo, commit_sha
    );
    let mut tree_req = client
        .get(&tree_url)
        .header("User-Agent", "shirehub-skills-manager")
        .header("Accept", "application/vnd.github.v3+json");
    if let Some(ref t) = token {
        if !t.is_empty() {
            tree_req = tree_req.header("Authorization", format!("Bearer {}", t));
        }
    }
    let tree: GitTree = tree_req
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("获取仓库文件树失败: {}", e)))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("解析文件树失败: {}", e)))?;

    // Step 3: 找所有 SKILL.md 路径
    let skill_md_paths: Vec<String> = tree
        .tree
        .into_iter()
        .filter(|e| {
            e.entry_type == "blob"
                && (e.path.ends_with("/SKILL.md") || e.path == "SKILL.md")
        })
        .map(|e| e.path)
        .collect();

    if skill_md_paths.is_empty() {
        return Err(AppError::Internal(format!(
            "仓库 {} 中未找到任何 SKILL.md 文件",
            owner_repo
        )));
    }

    info!(
        "[discover_skill_path] 找到 {} 个 SKILL.md",
        skill_md_paths.len()
    );

    let skill_id_lower = skill_id.to_lowercase();

    // Step 4: 优先按父目录名匹配
    for path in &skill_md_paths {
        let parent = std::path::Path::new(path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let dir_name = std::path::Path::new(path)
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        if dir_name == skill_id_lower {
            info!("[discover_skill_path] 按目录名匹配: {} → {}", skill_id, parent);
            return Ok((parent, commit_sha));
        }
    }

    // Step 5: 兜底：读取 SKILL.md 检查 frontmatter name
    for path in &skill_md_paths {
        let raw_url = format!(
            "https://raw.githubusercontent.com/{}/{}/{}",
            owner_repo, commit_sha, path
        );

        let mut raw_req = client
            .get(&raw_url)
            .header("User-Agent", "shirehub-skills-manager");
        if let Some(ref t) = token {
            if !t.is_empty() {
                raw_req = raw_req.header("Authorization", format!("Bearer {}", t));
            }
        }
        if let Ok(resp) = raw_req.send().await {
            if resp.status().is_success() {
                if let Ok(content) = resp.text().await {
                    if let Some(name) = extract_frontmatter_name(&content) {
                        if name.to_lowercase() == skill_id_lower {
                            let parent = std::path::Path::new(path)
                                .parent()
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_default();
                            info!(
                                "[discover_skill_path] 按 frontmatter name 匹配: {} → {}",
                                skill_id, parent
                            );
                            return Ok((parent, commit_sha));
                        }
                    }
                }
            }
        }
    }

    Err(AppError::Internal(format!(
        "在仓库 {} 中未找到名为 '{}' 的 Skill",
        owner_repo, skill_id
    )))
}

#[tauri::command]
pub async fn install_from_skills_sh(
    source: String,
    skill_id: String,
    deploy_targets: Vec<DeployTarget>,
    force_overwrite: Option<bool>,
    token: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<SkillsShInstallResult, AppError> {
    info!(
        "[install_from_skills_sh] source={}, skill_id={}",
        source, skill_id
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();

    let (source_path, commit_sha) =
        discover_skill_path_in_repo(&client, &source, &skill_id, &token).await?;

    info!(
        "[install_from_skills_sh] 发现路径: path={}, sha={}",
        source_path, commit_sha
    );

    install_from_catalog(
        source,
        source_path,
        skill_id,
        commit_sha,
        deploy_targets,
        force_overwrite,
        token,
        pool,
    )
    .await
}

// ── 内部工具函数 ──

fn urlencoding_encode(input: &str) -> String {
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

async fn deploy_skill_internal(
    pool: &DbPool,
    skill_id: &str,
    skill_name: &str,
    target: &DeployTarget,
    _source_dir: &std::path::Path,
) -> Result<(), AppError> {
    use super::skill_files::db_export_to_dir;
    use super::utils::compute_dir_checksum;

    let tool_cfg = crate::tools::get_tool(&target.tool)
        .ok_or_else(|| AppError::Validation(format!("未知工具: {}", target.tool)))?;

    let deploy_path = if let Some(pid) = &target.project_id {
        let conn = pool.get()?;
        let project_path: String = conn
            .query_row(
                "SELECT path FROM projects WHERE id = ?1",
                rusqlite::params![pid],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NotFound(format!("项目不存在: {}", pid)))?;
        std::path::Path::new(&project_path)
            .join(tool_cfg.project_dir)
            .join(skill_name)
    } else {
        let home = dirs::home_dir().expect("Cannot find home directory");
        home.join(tool_cfg.global_dir).join(skill_name)
    };

    if skill_name.trim().is_empty() {
        return Err(AppError::Validation("skill_name 不能为空，拒绝部署".into()));
    }

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
        rusqlite::params![
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

// ── 6. check_catalog_updates ──

/// 从 URL "https://github.com/{owner}/{repo}/tree/{sha}/{path}" 中提取 "owner/repo"
fn extract_owner_repo(github_url: &str) -> Option<String> {
    // 去掉前缀 "https://github.com/"
    let rest = github_url.strip_prefix("https://github.com/")?;
    // 取前两段 "owner/repo"
    let mut parts = rest.splitn(3, '/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(format!("{}/{}", owner, repo))
}

#[tauri::command]
pub async fn check_catalog_updates(
    pool: State<'_, DbPool>,
) -> Result<Vec<RemoteUpdateInfo>, AppError> {
    info!("[check_catalog_updates] 开始检查 catalog 更新");

    // 1. 从 DB 查询所有通过 catalog 安装的 Skill
    //    catalog 安装的 URL 格式：https://github.com/...
    #[derive(Debug)]
    struct InstalledSkill {
        skill_id: String,
        skill_name: String,
        version: Option<String>,
        url: Option<String>,
        remote_sha: Option<String>,  // 存的是 commit_sha
        skill_path: Option<String>,  // 存的是 source_path
        checksum: Option<String>,
        original_checksum: Option<String>,
        deploy_count: i64,
    }

    let installed: Vec<InstalledSkill> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.version, ss.url, ss.remote_sha, ss.skill_path,
                    s.checksum, ss.original_checksum,
                    (SELECT COUNT(*) FROM skill_deployments sd WHERE sd.skill_id = s.id)
             FROM skills s
             JOIN skill_sources ss ON ss.skill_id = s.id
             WHERE ss.source_type = 'skills-sh'
               AND ss.url LIKE 'https://github.com/%'
               AND ss.skill_path IS NOT NULL"
        )?;
        let rows: Vec<InstalledSkill> = stmt.query_map([], |row| {
            Ok(InstalledSkill {
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
        })?.collect::<Result<Vec<_>, _>>()?;
        rows
    };

    if installed.is_empty() {
        info!("[check_catalog_updates] 没有从 catalog 安装的 Skill");
        return Ok(vec![]);
    }

    // 2. 获取最新 catalog（利用内存缓存）
    let catalog_skills = load_catalog_all().await?;

    // 3. 逐一对比 commit_sha
    let mut results = Vec::new();

    for skill in &installed {
        let owner_repo = skill.url.as_deref().and_then(extract_owner_repo);
        let sp = skill.skill_path.as_deref().unwrap_or("");

        // 优先按 source_path 精确匹配，再用 source_repo 辅助验证
        let catalog_entry = catalog_skills.iter().find(|c| {
            c.source_path == sp
                && owner_repo.as_deref().map(|r| r == c.source_repo).unwrap_or(true)
        });

        if let Some(entry) = catalog_entry {
            let local_sha = skill.remote_sha.clone();
            let remote_sha = entry.commit_sha.clone();

            let has_update = match &local_sha {
                Some(saved) => saved != &remote_sha,
                None => true,
            };

            let locally_modified = match (&skill.checksum, &skill.original_checksum) {
                (Some(c), Some(o)) => c != o,
                _ => false,
            };

            results.push(RemoteUpdateInfo {
                skill_id: skill.skill_id.clone(),
                skill_name: skill.skill_name.clone(),
                current_version: skill.version.clone(),
                source_url: skill.url.clone(),
                owner_repo: entry.source_repo.clone(),
                skill_path: entry.source_path.clone(),
                local_sha,
                remote_sha,
                has_update,
                locally_modified,
                deploy_count: skill.deploy_count,
            });
        } else {
            info!(
                "[check_catalog_updates] Skill '{}' 在 catalog 中未找到对应条目（path={}）",
                skill.skill_name, sp
            );
        }
    }

    let update_count = results.iter().filter(|r| r.has_update).count();
    info!(
        "[check_catalog_updates] 完成: {} 个已安装 Skill, {} 个有更新",
        results.len(),
        update_count
    );

    Ok(results)
}
