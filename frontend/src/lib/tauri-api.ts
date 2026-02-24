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
  /** @deprecated DB 是权威源，local_path 不再保证有效。请使用 skill_id 访问文件内容 */
  local_path?: string | null
  last_modified: string | null
  created_at: string
  updated_at: string
  /** 来源类型：'local' | 'skills-sh' | 'github' | 'gitee' */
  source_type: string
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
  /** 从 DB 读取 Skill 文件内容（文本） */
  readFile: (skillId: string, relPath: string) =>
    invoke<string>('read_skill_file', { skillId, relPath }),
  /** 写入文本内容到 DB Skill 文件 */
  writeFile: (skillId: string, relPath: string, content: string) =>
    invoke<void>('write_skill_file', { skillId, relPath, content }),
  /** 列出 DB 中 Skill 的所有文件相对路径 */
  listFiles: (skillId: string) =>
    invoke<string[]>('list_skill_files', { skillId }),
  /** 导出 Skill 文件到本地路径（供编辑器打开），返回路径 */
  exportToLocal: (skillId: string) =>
    invoke<string>('export_skill_to_local', { skillId }),
  /** 通过 skill_id 在编辑器中打开 Skill（自动先导出到本地） */
  openSkillInEditor: (skillId: string, editor?: string) =>
    invoke<string>('open_skill_in_editor', { skillId, editor: editor ?? null }),
  checkUpdates: () => invoke<SkillUpdateInfoRow[]>('check_skill_updates'),
  updateFromLibrary: (skillId: string, syncDeployments: boolean, projectIds?: string[], toolNames?: string[]) =>
    invoke<SkillUpdateResultRow>('update_skill_from_library', {
      skillId, syncDeployments,
      projectIds: projectIds ?? null,
      toolNames: toolNames ?? null,
    }),
  restoreFromBackup: (backupId: string, syncDeployments: boolean) =>
    invoke<RestoreResultRow>('restore_from_backup', { backupId, syncDeployments }),
  openInEditor: (path: string, editor?: string) =>
    invoke<void>('open_in_editor', { path, editor: editor ?? null }),
  batchDelete: (skillId: string, deleteLocalLib: boolean) =>
    invoke<BatchDeleteResultData>('batch_delete_skill', { skillId, deleteLocalLib }),
  computeDiff: (leftPath: string, rightPath: string) =>
    invoke<SkillDiffResult>('compute_skill_diff', { leftPath, rightPath }),
  mergeVersions: (leftPath: string, rightPath: string, basePath?: string) =>
    invoke<MergeResultData>('merge_skill_versions', { leftPath, rightPath, basePath: basePath ?? null }),
  applyMerge: (targetPath: string, resolutions: MergeResolutionData[]) =>
    invoke<void>('apply_merge_result', { targetPath, resolutions }),
}

export interface BatchDeleteResultData {
  skill_id: string
  skill_name: string
  deployments_deleted: number
  files_removed: number
  local_lib_removed: boolean
}

export interface SkillDiffResult {
  left_path: string
  right_path: string
  files: FileDiffItem[]
  summary: DiffSummary
}

export interface FileDiffItem {
  path: string
  status: 'added' | 'removed' | 'modified' | 'unchanged'
  hunks: DiffHunk[]
}

export interface DiffHunk {
  old_start: number
  old_count: number
  new_start: number
  new_count: number
  lines: DiffLine[]
}

export interface DiffLine {
  tag: '+' | '-' | ' '
  content: string
}

export interface DiffSummary {
  added: number
  removed: number
  modified: number
  unchanged: number
}

export interface MergeResultData {
  files: MergeFileResultData[]
  auto_merged_count: number
  conflict_count: number
  total_files: number
}

export interface MergeFileResultData {
  path: string
  status: 'auto_merged' | 'conflict' | 'added_left' | 'added_right' | 'deleted_left' | 'deleted_right' | 'unchanged'
  merged_content: string | null
  left_content: string | null
  right_content: string | null
  base_content: string | null
}

export interface MergeResolutionData {
  path: string
  content: string
}

export interface RestoreResultRow {
  skill_id: string
  restored_version: string | null
  new_checksum: string | null
  deployments_synced: number
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

export interface ToolSkillInfoData {
  skill_id: string
  skill_name: string
  skill_description: string
  deployment_id: string
  project_id: string | null
  project_name: string | null
  deploy_path: string
  status: string
  checksum: string | null
  last_synced: string | null
}

export interface ToolGroupResultData {
  tool: string
  skills: ToolSkillInfoData[]
  count: number
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
  deployToProject: (skillId: string, projectId: string, tool: string, force?: boolean) =>
    invoke<DeployResultData>('deploy_skill_to_project', { skillId, projectId, tool, force: force ?? false }),
  deployGlobal: (skillId: string, tool: string, force?: boolean) =>
    invoke<DeployResultData>('deploy_skill_global', { skillId, tool, force: force ?? false }),
  syncDeployment: (deploymentId: string) =>
    invoke<SyncResultData>('sync_deployment', { deploymentId }),
  checkConsistency: () =>
    invoke<ConsistencyReportData>('check_deployment_consistency'),
  getSkillsByTool: (tool?: string) =>
    invoke<ToolGroupResultData[]>('get_skills_by_tool', { tool: tool ?? null }),
  reconcile: () =>
    invoke<ReconcileReportData>('reconcile_all_deployments'),
  updateLibraryFromDeployment: (deploymentId: string, syncOtherDeployments: boolean) =>
    invoke<UpdateLibraryResultData>('update_library_from_deployment', { deploymentId, syncOtherDeployments }),
}

export interface UpdateLibraryResultData {
  skill_id: string
  skill_name: string
  backup_id: string | null
  new_checksum: string | null
  other_deployments_synced: number
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
  skill_name: string | null
  project_name: string | null
  tool: string | null
  deploy_path: string | null
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

export interface RemoteNewSkillData {
  name: string
  description: string | null
  version: string | null
  dir_name: string
}

export interface ScanRemoteResultData {
  config_id: string
  remote_url: string
  new_skills: RemoteNewSkillData[]
  total_remote: number
  total_local: number
  clone_path: string
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
  scanRemoteNewSkills: (configId: string) =>
    invoke<ScanRemoteResultData>('scan_remote_new_skills', { configId }),
}

// ── skills.sh ──

export interface SkillsShSearchResult {
  id: string
  skill_id: string
  name: string
  installs: number
  source: string
  /** skills.sh API 可能返回的简短描述 */
  description?: string | null
}

export interface RepoFileEntry {
  path: string
  sha: string
  size: number | null
}

export interface RepoSkillEntry {
  skill_path: string
  folder_sha: string
  file_count: number
  files: RepoFileEntry[]
}

export interface RepoTreeResult {
  owner_repo: string
  branch: string
  skills: RepoSkillEntry[]
}

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
  local_path: string
  files_downloaded: number
  deployments_created: number
  conflict: InstallConflict | null
}

export interface BrowseResultData {
  category: string
  skills: SkillsShSearchResult[]
  total: number
}

export interface SkillCategoryData {
  id: string
  name: string
  icon: string
  keywords: string[]
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

export const skillsShApi = {
  search: (query: string, limit?: number) =>
    invoke<SkillsShSearchResult[]>('search_skills_sh', { query, limit }),
  getRepoTree: (ownerRepo: string, token?: string) =>
    invoke<RepoTreeResult>('get_skill_repo_tree', { ownerRepo, token }),
  fetchContent: (ownerRepo: string, blobSha: string, token?: string) =>
    invoke<string>('fetch_skill_content', { ownerRepo, blobSha, token }),
  /** 直接通过 raw.githubusercontent.com 获取 SKILL.md，不消耗 GitHub API 配额 */
  fetchReadme: (ownerRepo: string, skillPath: string, token?: string) =>
    invoke<string>('fetch_skill_readme', { ownerRepo, skillPath, token }),
  install: (params: {
    ownerRepo: string
    skillPath: string
    skillName: string
    folderSha: string
    files: RepoFileEntry[]
    token?: string
    deployTargets: DeployTargetParam[]
    forceOverwrite?: boolean
  }) => invoke<SkillsShInstallResult>('install_from_skills_sh', params),
  checkRemoteUpdates: () =>
    invoke<RemoteUpdateInfo[]>('check_remote_updates'),
  browsePopular: (category?: string) =>
    invoke<BrowseResultData>('browse_popular_skills_sh', { category: category ?? null }),
  getCategories: () =>
    invoke<SkillCategoryData[]>('get_skill_categories'),
}
