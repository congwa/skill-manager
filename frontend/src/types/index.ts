export type ToolName = 'windsurf' | 'cursor' | 'claude-code' | 'codex' | 'trae'

export type DeploymentStatus = 'synced' | 'diverged' | 'missing' | 'untracked' | 'pending'
export type SkillSource = 'local' | 'skills-sh' | 'github' | 'gitee'
export type ChangeEventType = 'modified' | 'created' | 'deleted' | 'renamed'
export type EventStatus = 'pending' | 'resolved' | 'ignored'
export type SyncActionType = 'deploy' | 'update' | 'delete' | 'export' | 'import'

export interface Project {
  id: string
  name: string
  path: string
  detected_tools: ToolName[]
  skill_count: number
  last_scanned_at: string
  sync_status: 'synced' | 'changed' | 'unsynced'
  created_at: string
}

export interface Skill {
  id: string
  name: string
  description: string
  version: string
  source: SkillSource
  source_url?: string
  local_path: string
  checksum: string
  tags: string[]
  last_modified_at: string
  created_at: string
}

export interface SkillDeployment {
  id: string
  skill_id: string
  project_id: string | null
  tool_name: ToolName
  deploy_path: string
  status: DeploymentStatus
  deployed_checksum: string
  last_synced_at: string
}

export interface ChangeEvent {
  id: string
  skill_name: string
  project_name: string
  tool_name: ToolName
  event_type: ChangeEventType
  status: EventStatus
  detected_at: string
  file_path: string
}

export interface SyncHistory {
  id: string
  action_type: SyncActionType
  skill_name: string
  project_name?: string
  tool_name?: ToolName
  result: 'success' | 'failed'
  error_message?: string
  created_at: string
}

export interface SkillBackup {
  id: string
  skill_id: string
  version: string
  reason: string
  created_at: string
}

export interface GitConfig {
  platform: 'github' | 'gitee'
  repo_url: string
  auth_type: 'ssh' | 'token'
  branch: string
  connected: boolean
  last_export_at?: string
}

export interface AppSettings {
  language: 'zh-CN' | 'en'
  theme: 'light' | 'dark' | 'system'
  startup_page: 'last' | 'projects' | 'sync'
  notifications_enabled: boolean
  skill_library_path: string
  auto_export_frequency: 'manual' | 'daily' | 'on-change'
  file_watch_enabled: boolean
  update_check_frequency: 'startup' | 'hourly' | 'daily' | 'manual'
  auto_update: boolean
  history_retention_days: number
}

export interface StoreSkill {
  id: string
  name: string
  description: string
  version: string
  compatible_tools: ToolName[]
  install_count: number
  rating: number
  category: string
  installed_version?: string
  has_update?: boolean
}
