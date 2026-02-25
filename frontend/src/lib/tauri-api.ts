import { invoke } from '@tauri-apps/api/core'


// ── Projects ──

export interface ProjectRow {
  id: string
  name: string
  path: string
  status: string
  last_scanned: string | null
  skill_count: number
  tool_count: number
  created_at: string
  updated_at: string
}

export interface BatchAddResultData {
  added: ProjectRow[]
  skipped: { path: string; reason: string }[]
  total: number
}

export const projectsApi = {
  getAll: () => invoke<ProjectRow[]>('get_projects'),
  add: (path: string) => invoke<ProjectRow>('add_project', { path }),
  batchAdd: (paths: string[]) => invoke<BatchAddResultData>('batch_add_projects', { paths }),
  remove: (projectId: string) => invoke<void>('remove_project', { projectId }),
}

// ── Skills ──

export interface SkillRow {
  id: string
  name: string
  description: string | null
  version: string | null
  checksum: string | null
  last_modified: string | null
  created_at: string
  updated_at: string
  /** 来源类型：'local' | 'skills-sh' | 'github' | 'gitee' */
  source_type: string
  /** Watcher 检测到变更并同步到 DB 的时间，null 表示无待处理变更 */
  watcher_modified_at: string | null
  /** 写入前自动备份的 backup ID */
  watcher_backup_id: string | null
  /** 触发此次变更的 deployment ID */
  watcher_trigger_dep_id: string | null
}

export interface SkillBackupRow {
  id: string
  skill_id: string
  version_label: string | null
  backup_path: string
  checksum: string
  reason: string
  metadata: string | null
  created_at: string
}

export const skillsApi = {
  getAll: () => invoke<SkillRow[]>('get_skills'),
  getBackups: (skillId: string) => invoke<SkillBackupRow[]>('get_skill_backups', { skillId }),
  readFile: (skillId: string, relPath: string) =>
    invoke<string>('read_skill_file', { skillId, relPath }),
  writeFile: (skillId: string, relPath: string, content: string) =>
    invoke<void>('write_skill_file', { skillId, relPath, content }),
  listFiles: (skillId: string) =>
    invoke<string[]>('list_skill_files', { skillId }),
  restoreFromBackup: (backupId: string, syncDeployments: boolean) =>
    invoke<RestoreResultRow>('restore_from_backup', { backupId, syncDeployments }),
  batchDelete: (skillId: string) =>
    invoke<BatchDeleteResultData>('batch_delete_skill', { skillId }),
  dismissWatcherChange: (skillId: string) =>
    invoke<void>('dismiss_watcher_change', { skillId }),
  discardWatcherChange: (skillId: string) =>
    invoke<void>('discard_watcher_change', { skillId }),
}

export interface BatchDeleteResultData {
  skill_id: string
  skill_name: string
  deployments_deleted: number
  files_removed: number
}

export interface RestoreResultRow {
  skill_id: string
  restored_version: string | null
  new_checksum: string | null
  deployments_synced: number
}

// ── Deployments ──

export interface DeploymentRow {
  id: string
  skill_id: string
  project_id: string | null
  tool: string
  path: string
  checksum: string | null
  status: string
  last_synced: string | null
  created_at: string
  updated_at: string
}

export interface DeployConflictData {
  status: string  // "exists_same" | "exists_different"
  existing_checksum: string | null
  library_checksum: string | null
}

export interface DeployResultData {
  deployment_id: string
  files_copied: number
  checksum: string | null
  deploy_path: string
  conflict: DeployConflictData | null
}

export interface SyncResultData {
  files_copied: number
  old_checksum: string | null
  new_checksum: string | null
}

export interface ConsistencyReportData {
  total_deployments: number
  synced: number
  diverged: number
  missing: number
  details: ConsistencyDetailData[]
}

export interface ConsistencyDetailData {
  deployment_id: string
  skill_name: string
  tool: string
  deploy_path: string
  status: string
  lib_checksum: string | null
  deploy_checksum: string | null
}

export interface ReconcileReportData {
  deployments_checked: number
  missing_detected: number
  diverged_detected: number
  untracked_found: number
  change_events_created: number
}

export const deploymentsApi = {
  getAll: () => invoke<DeploymentRow[]>('get_deployments'),
  getBySkill: (skillId: string) =>
    invoke<DeploymentRow[]>('get_skill_deployments', { skillId }),
  delete: (deploymentId: string) =>
    invoke<void>('delete_deployment', { deploymentId }),
  deployToProject: (skillId: string, projectId: string, tool: string, force?: boolean) =>
    invoke<DeployResultData>('deploy_skill_to_project', { skillId, projectId, tool, force: force ?? false }),
  deployGlobal: (skillId: string, tool: string, force?: boolean) =>
    invoke<DeployResultData>('deploy_skill_global', { skillId, tool, force: force ?? false }),
  syncDeployment: (deploymentId: string) =>
    invoke<SyncResultData>('sync_deployment', { deploymentId }),
  checkConsistency: () =>
    invoke<ConsistencyReportData>('check_deployment_consistency'),
  reconcile: () =>
    invoke<ReconcileReportData>('reconcile_all_deployments'),
}

// ── Settings ──

export interface AppSettingRow {
  key: string
  value: string | null
  updated_at: string
}

export interface GitExportConfigRow {
  id: string
  provider: string
  remote_url: string
  auth_type: string
  branch: string
  auto_export: string
  last_push_at: string | null
  last_pull_at: string | null
  created_at: string
  updated_at: string
}

export interface AppInitStatus {
  initialized: boolean
  db_path: string
  skills_lib_path: string
  backups_path: string
  db_exists: boolean
  skills_dir_exists: boolean
  project_count: number
  skill_count: number
}

export const settingsApi = {
  getAll: () => invoke<AppSettingRow[]>('get_all_settings'),
  get: (key: string) => invoke<string | null>('get_setting', { key }),
  set: (key: string, value: string) => invoke<void>('set_setting', { key, value }),
  getGitConfigs: () => invoke<GitExportConfigRow[]>('get_git_export_configs'),
  saveGitConfig: (params: {
    provider: string
    remoteUrl: string
    authType: string
    branch: string
    autoExport: string
  }) => invoke<GitExportConfigRow>('save_git_export_config', params),
  deleteGitConfig: (configId: string) =>
    invoke<void>('delete_git_export_config', { configId }),
  getInitStatus: () => invoke<AppInitStatus>('get_app_init_status'),
  initializeApp: (skillsLibPath?: string) =>
    invoke<AppInitStatus>('initialize_app', { skillsLibPath }),
  resetApp: () => invoke<void>('reset_app'),
}

// ── Scanner ──

export interface ScannedSkill {
  name: string
  description: string | null
  version: string | null
  tool: string
  path: string
}

export interface ScanResultData {
  project_name: string
  project_path: string
  tools: string[]
  skills: ScannedSkill[]
}

export interface GlobalScanResult {
  tools_found: string[]
  skills_imported: number
  deployments_created: number
}

export const scannerApi = {
  scan: (projectPath: string) => invoke<ScanResultData>('scan_project', { projectPath }),
  scanAndImport: (projectPath: string) =>
    invoke<ScanResultData>('scan_and_import_project', { projectPath }),
  scanGlobalSkills: () => invoke<GlobalScanResult>('scan_global_skills'),
}

// ── Git Operations ──

export interface GitTestResult {
  success: boolean
  message: string
}

export interface GitExportResult {
  skills_exported: number
  commit_hash: string | null
  pushed: boolean
  message: string
  diverged_count: number
  diverged_skills: string[]
}

export interface GitRepoSkill {
  name: string
  description: string | null
  version: string | null
  status: string // "new" | "exists_same" | "exists_conflict"
  local_version: string | null
}

export interface GitCloneResult {
  clone_path: string
  skills_found: GitRepoSkill[]
}

export interface GitRepoUpdateInfo {
  config_id: string
  remote_url: string
  branch: string
  skills: GitSkillUpdateStatus[]
  has_updates: boolean
  remote_commit: string | null
}

export interface GitSkillUpdateStatus {
  name: string
  local_checksum: string | null
  remote_checksum: string | null
  status: 'updated' | 'unchanged' | 'new_remote' | 'deleted_remote'
}

export interface GitImportResult {
  skills_imported: number
  skills_skipped: number
  skills_updated: number
  message: string
}

export const gitApi = {
  testConnection: (remoteUrl: string, authType: string) =>
    invoke<GitTestResult>('test_git_connection', { remoteUrl, authType }),
  exportToGit: (configId: string) =>
    invoke<GitExportResult>('export_skills_to_git', { configId }),
  cloneRepo: (remoteUrl: string, branch?: string) =>
    invoke<GitCloneResult>('clone_git_repo', { remoteUrl, branch }),
  importFromRepo: (clonePath: string, skillNames: string[], overwriteConflicts: boolean, sourceUrl?: string) =>
    invoke<GitImportResult>('import_from_git_repo', { clonePath, skillNames, overwriteConflicts, sourceUrl: sourceUrl ?? null }),
  checkRepoUpdates: (configId?: string) =>
    invoke<GitRepoUpdateInfo[]>('check_git_repo_updates', { configId: configId ?? null }),
}

// ── skills.sh ──

export interface DeployTargetParam {
  project_id: string | null
  tool: string
}

export interface InstallConflict {
  conflict_type: string
  local_version: string | null
  local_checksum: string | null
}

export interface SkillsShInstallResult {
  skill_id: string
  files_downloaded: number
  deployments_created: number
  conflict: InstallConflict | null
}

export interface RemoteUpdateInfo {
  skill_id: string
  skill_name: string
  current_version: string | null
  source_url: string | null
  owner_repo: string
  skill_path: string
  local_sha: string | null
  remote_sha: string
  has_update: boolean
  locally_modified: boolean
  deploy_count: number
}

// ── dmgrok Catalog ──

export interface CatalogSkill {
  id: string
  name: string
  description: string | null
  provider: string
  category: string
  license: string | null
  compatibility: string | null
  last_updated_at: string
  has_scripts: boolean
  has_references: boolean
  has_assets: boolean
  tags: string[]
  days_since_update: number
  maintenance_status: string
  quality_score: number
  source_repo: string
  source_path: string
  skill_md_url: string
  commit_sha: string
  installs: number | null
}

// ── skills.sh 搜索结果类型 ──
export interface SkillsShItem {
  id: string        // "vercel-labs/skills/find-skills"
  skillId: string   // "find-skills"
  name: string
  installs: number
  source: string    // "vercel-labs/skills" (owner/repo)
  description?: string | null
}

export const skillsShApi = {
  search: (query: string) =>
    invoke<SkillsShItem[]>('search_skills_sh', { query }),
  install: (params: {
    source: string
    skillId: string
    deployTargets: DeployTargetParam[]
    forceOverwrite?: boolean
    token?: string
  }) =>
    invoke<SkillsShInstallResult>('install_from_skills_sh', {
      source: params.source,
      skillId: params.skillId,
      deployTargets: params.deployTargets,
      forceOverwrite: params.forceOverwrite ?? false,
      token: params.token ?? null,
    }),
}

export const catalogApi = {
  fetch: (category?: string) =>
    invoke<CatalogSkill[]>('fetch_catalog', { category: category ?? null }),
  search: (query: string, category?: string) =>
    invoke<CatalogSkill[]>('search_catalog', { query, category: category ?? null }),
  enrichSingle: (skillName: string, sourceRepo: string) =>
    invoke<number | null>('enrich_single_install', { skillName, sourceRepo }),
  enrichBatchByCategory: (categoryKeyword: string) =>
    invoke<void>('enrich_batch_by_category', { categoryKeyword }),
  install: (params: {
    sourceRepo: string
    sourcePath: string
    skillName: string
    commitSha: string
    deployTargets: DeployTargetParam[]
    forceOverwrite?: boolean
    token?: string
  }) => invoke<SkillsShInstallResult>('install_from_catalog', params),
  checkUpdates: () =>
    invoke<RemoteUpdateInfo[]>('check_catalog_updates'),
}

