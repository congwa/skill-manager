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
    pub local_path: Option<String>,
    pub last_modified: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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

// ── skills.sh Search Results ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsShSearchResult {
    pub id: String,
    pub skill_id: String,
    pub name: String,
    pub installs: u64,
    pub source: String,
}

// ── Repository Tree ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoTreeResult {
    pub owner_repo: String,
    pub branch: String,
    pub skills: Vec<RepoSkillEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSkillEntry {
    pub skill_path: String,
    pub folder_sha: String,
    pub file_count: usize,
    pub files: Vec<RepoFileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoFileEntry {
    pub path: String,
    pub sha: String,
    pub size: Option<u64>,
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
    pub local_path: String,
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

// ── Sync History ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncHistoryEntry {
    pub id: String,
    pub skill_id: String,
    pub deployment_id: Option<String>,
    pub action: String,
    pub from_checksum: Option<String>,
    pub to_checksum: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

// ── Change Events ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeEvent {
    pub id: String,
    pub deployment_id: String,
    pub event_type: String,
    pub old_checksum: Option<String>,
    pub new_checksum: Option<String>,
    pub resolution: Option<String>,
    pub resolved_at: Option<String>,
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
