use serde::{Deserialize, Serialize};

// ── Projects ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub status: String,
    pub last_scanned: Option<String>,
    pub skill_count: i64,
    pub tool_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

// ── Skills ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub checksum: Option<String>,
    pub last_modified: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// 来源类型：'local' | 'skills-sh' | 'github' | 'gitee'，来自 skill_sources 表
    pub source_type: String,
    /// Watcher 检测到部署目录变更并同步到 DB 的时间，NULL 表示无待处理变更
    pub watcher_modified_at: Option<String>,
    /// 写入前自动备份的 backup ID，用于"放弃并还原"操作
    pub watcher_backup_id: Option<String>,
    /// 触发此次 watcher 变更的 deployment ID
    pub watcher_trigger_dep_id: Option<String>,
}

// ── Skill Sources ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSource {
    pub id: String,
    pub skill_id: String,
    pub source_type: String,
    pub url: Option<String>,
    pub installed_version: Option<String>,
    pub original_checksum: Option<String>,
    pub remote_sha: Option<String>,
    pub skill_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── dmgrok Catalog ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogSkill {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub provider: String,
    pub category: String,
    pub license: Option<String>,
    pub compatibility: Option<String>,
    pub last_updated_at: String,
    pub has_scripts: bool,
    pub has_references: bool,
    pub has_assets: bool,
    pub tags: Vec<String>,
    pub days_since_update: u32,
    pub maintenance_status: String,
    pub quality_score: u32,
    /// source.repo — "owner/repo" 形式
    pub source_repo: String,
    /// source.path — skill 在仓库中的相对路径
    pub source_path: String,
    /// source.skill_md_url — SKILL.md 的 Raw URL，直接可用
    pub skill_md_url: String,
    /// source.commit_sha — 用于更新检测
    pub commit_sha: String,
    /// 由 skills.sh API 补充（可能为 None）
    pub installs: Option<u64>,
}

// ── skills.sh Search Results ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsShSearchResult {
    #[serde(default)]
    pub id: String,
    /// skills.sh API 返回的是 camelCase "skillId"，需要显式 rename
    #[serde(rename = "skillId", alias = "skill_id", default)]
    pub skill_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub installs: u64,
    #[serde(default)]
    pub source: String,
    /// skills.sh API 可能返回的简短描述
    #[serde(default)]
    pub description: Option<String>,
}

// ── skills.sh Install ──

#[derive(Debug, Clone, Deserialize)]
pub struct DeployTarget {
    pub project_id: Option<String>,
    pub tool: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillsShInstallResult {
    pub skill_id: String,
    pub files_downloaded: usize,
    pub deployments_created: usize,
    pub conflict: Option<InstallConflict>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallConflict {
    pub conflict_type: String,
    pub local_version: Option<String>,
    pub local_checksum: Option<String>,
}

// ── Remote Update Check ──

#[derive(Debug, Clone, Serialize)]
pub struct RemoteUpdateInfo {
    pub skill_id: String,
    pub skill_name: String,
    pub current_version: Option<String>,
    pub source_url: Option<String>,
    pub owner_repo: String,
    pub skill_path: String,
    pub local_sha: Option<String>,
    pub remote_sha: String,
    pub has_update: bool,
    pub locally_modified: bool,
    pub deploy_count: i64,
}

// ── Skill Deployments ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDeployment {
    pub id: String,
    pub skill_id: String,
    pub project_id: Option<String>,
    pub tool: String,
    pub path: String,
    pub checksum: Option<String>,
    pub status: String,
    pub last_synced: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Skill Backups ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillBackup {
    pub id: String,
    pub skill_id: String,
    pub version_label: Option<String>,
    pub backup_path: String,
    pub checksum: String,
    pub reason: String,
    pub metadata: Option<String>,
    pub created_at: String,
}

// ── Git Export Config ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitExportConfig {
    pub id: String,
    pub provider: String,
    pub remote_url: String,
    pub auth_type: String,
    pub branch: String,
    pub auto_export: String,
    pub last_push_at: Option<String>,
    pub last_pull_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── App Settings ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSetting {
    pub key: String,
    pub value: Option<String>,
    pub updated_at: String,
}

// ── Scan Results ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedSkill {
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub tool: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub project_name: String,
    pub project_path: String,
    pub tools: Vec<String>,
    pub skills: Vec<ScannedSkill>,
}

// ── Dashboard Stats ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_projects: i64,
    pub total_skills: i64,
    pub pending_changes: i64,
    pub diverged_deployments: i64,
}

// ── Project Detail ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDetailDeployment {
    pub deployment_id: String,
    pub skill_id: String,
    pub skill_name: String,
    pub skill_description: Option<String>,
    pub skill_version: Option<String>,
    pub tool: String,
    pub path: String,
    pub status: String,
    pub checksum: Option<String>,
    pub last_synced: Option<String>,
}
