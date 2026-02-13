import { invoke } from '@tauri-apps/api/core'

// ── 环境检测 ──

export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

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

export interface DashboardStats {
  total_projects: number
  total_skills: number
  pending_changes: number
  diverged_deployments: number
}

export interface ProjectDetailDeployment {
  deployment_id: string
  skill_id: string
  skill_name: string
  skill_description: string | null
  skill_version: string | null
  tool: string
  path: string
  status: string
  checksum: string | null
  last_synced: string | null
}

export const projectsApi = {
  getAll: () => invoke<ProjectRow[]>('get_projects'),
  add: (path: string) => invoke<ProjectRow>('add_project', { path }),
  remove: (projectId: string) => invoke<void>('remove_project', { projectId }),
  getDeployments: (projectId: string) =>
    invoke<ProjectDetailDeployment[]>('get_project_deployments', { projectId }),
  getDashboardStats: () => invoke<DashboardStats>('get_dashboard_stats'),
}

// ── Skills ──

export interface SkillRow {
  id: string
  name: string
  description: string | null
  version: string | null
  checksum: string | null
  local_path: string | null
  last_modified: string | null
  created_at: string
  updated_at: string
}

export interface SkillSourceRow {
  id: string
  skill_id: string
  source_type: string
  url: string | null
  installed_version: string | null
  original_checksum: string | null
  created_at: string
  updated_at: string
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
  getById: (skillId: string) => invoke<SkillRow>('get_skill_by_id', { skillId }),
  create: (params: {
    name: string
    description?: string
    version?: string
    sourceType: string
    sourceUrl?: string
  }) => invoke<SkillRow>('create_skill', params),
  delete: (skillId: string) => invoke<void>('delete_skill', { skillId }),
  getSource: (skillId: string) => invoke<SkillSourceRow | null>('get_skill_source', { skillId }),
  getBackups: (skillId: string) => invoke<SkillBackupRow[]>('get_skill_backups', { skillId }),
  readFile: (filePath: string) => invoke<string>('read_skill_file', { filePath }),
  writeFile: (filePath: string, content: string) => invoke<void>('write_skill_file', { filePath, content }),
  listFiles: (dirPath: string) => invoke<string[]>('list_skill_files', { dirPath }),
  checkUpdates: () => invoke<SkillUpdateInfoRow[]>('check_skill_updates'),
  updateFromLibrary: (skillId: string, syncDeployments: boolean) =>
    invoke<SkillUpdateResultRow>('update_skill_from_library', { skillId, syncDeployments }),
}

export interface SkillUpdateInfoRow {
  skill_id: string
  skill_name: string
  current_version: string | null
  source_type: string
  source_url: string | null
  installed_version: string | null
  original_checksum: string | null
  current_checksum: string | null
  locally_modified: boolean
  deploy_count: number
}

export interface SkillUpdateResultRow {
  skill_id: string
  backup_id: string | null
  deployments_synced: number
  new_checksum: string | null
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

export interface DeployResultData {
  deployment_id: string
  files_copied: number
  checksum: string | null
  deploy_path: string
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
  create: (params: {
    skillId: string
    projectId: string | null
    tool: string
    targetPath: string
  }) => invoke<DeploymentRow>('create_deployment', params),
  delete: (deploymentId: string) =>
    invoke<void>('delete_deployment', { deploymentId }),
  updateStatus: (deploymentId: string, status: string, checksum: string | null) =>
    invoke<void>('update_deployment_status', { deploymentId, status, checksum }),
  getDiverged: () => invoke<DeploymentRow[]>('get_diverged_deployments'),
  deployToProject: (skillId: string, projectId: string, tool: string) =>
    invoke<DeployResultData>('deploy_skill_to_project', { skillId, projectId, tool }),
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

// ── Change Events & Sync History ──

export interface ChangeEventRow {
  id: string
  deployment_id: string
  event_type: string
  old_checksum: string | null
  new_checksum: string | null
  resolution: string | null
  resolved_at: string | null
  created_at: string
}

export interface SyncHistoryRow {
  id: string
  skill_id: string
  deployment_id: string | null
  action: string
  from_checksum: string | null
  to_checksum: string | null
  status: string
  error_message: string | null
  created_at: string
}

export const syncApi = {
  getChangeEvents: (statusFilter?: string) =>
    invoke<ChangeEventRow[]>('get_change_events', { statusFilter }),
  resolveEvent: (eventId: string, resolution: string) =>
    invoke<void>('resolve_change_event', { eventId, resolution }),
  getHistory: (limit?: number) =>
    invoke<SyncHistoryRow[]>('get_sync_history', { limit }),
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
