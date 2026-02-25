/** Agent 工具标识符（对应 tools.ts 中的 id 字段） */
export type ToolName = string

export type DeploymentStatus = 'synced' | 'diverged' | 'missing' | 'untracked' | 'pending'
export type SkillSource = 'local' | 'skills-sh' | 'github' | 'gitee'
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
  checksum: string
  tags: string[]
  last_modified_at: string
  created_at: string
  /** Watcher 检测到变更并写入 DB 的时间，null 表示无待处理变更 */
  watcher_modified_at: string | null
  /** 写入前自动备份的 backup ID，用于"放弃并还原" */
  watcher_backup_id: string | null
  /** 触发此次 watcher 变更的 deployment ID */
  watcher_trigger_dep_id: string | null
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
