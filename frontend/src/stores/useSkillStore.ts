import { create } from 'zustand'
import type { Skill, SkillDeployment, SkillBackup } from '@/types'
import { skillsApi, deploymentsApi } from '@/lib/tauri-api'
import type { SkillRow, DeploymentRow, SkillBackupRow } from '@/lib/tauri-api'

function mapSkillRow(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    version: row.version || '',
    source: (row.source_type as Skill['source']) || 'local',
    local_path: row.local_path || '',
    checksum: row.checksum || '',
    tags: [],
    last_modified_at: row.last_modified || row.updated_at,
    created_at: row.created_at,
  }
}

function mapDeploymentRow(row: DeploymentRow): SkillDeployment {
  return {
    id: row.id,
    skill_id: row.skill_id,
    project_id: row.project_id,
    tool_name: row.tool as SkillDeployment['tool_name'],
    deploy_path: row.path,
    status: row.status as SkillDeployment['status'],
    deployed_checksum: row.checksum || '',
    last_synced_at: row.last_synced || row.created_at,
  }
}

function mapBackupRow(row: SkillBackupRow): SkillBackup {
  return {
    id: row.id,
    skill_id: row.skill_id,
    version: row.version_label || '',
    reason: row.reason,
    created_at: row.created_at,
  }
}

interface SkillStore {
  skills: Skill[]
  deployments: SkillDeployment[]
  backups: SkillBackup[]
  selectedSkillId: string | null
  isLoading: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectSkill: (id: string | null) => void
  fetchSkills: () => Promise<void>
  fetchDeployments: () => Promise<void>
  fetchBackups: (skillId: string) => Promise<void>
  getSkillById: (id: string) => Skill | undefined
  getDeploymentsForSkill: (skillId: string) => SkillDeployment[]
  getDeploymentsForProject: (projectId: string) => SkillDeployment[]
  getSkillForDeployment: (deployment: SkillDeployment) => Skill | undefined
}

export const useSkillStore = create<SkillStore>()((set, get) => ({
  skills: [],
  deployments: [],
  backups: [],
  selectedSkillId: null,
  isLoading: false,
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  selectSkill: (id) => set({ selectedSkillId: id }),
  fetchSkills: async () => {
    console.log('[SkillStore] fetchSkills 开始')
    set({ isLoading: true })
    try {
      const rows = await skillsApi.getAll()
      console.log(`[SkillStore] fetchSkills 完成: ${rows.length} 个 Skill`)
      set({ skills: rows.map(mapSkillRow), isLoading: false })
    } catch (e) {
      console.error('[SkillStore] fetchSkills 失败:', e)
      set({ skills: [], isLoading: false })
    }
  },
  fetchDeployments: async () => {
    console.log('[SkillStore] fetchDeployments 开始')
    try {
      const rows = await deploymentsApi.getAll()
      console.log(`[SkillStore] fetchDeployments 完成: ${rows.length} 个部署`)
      set({ deployments: rows.map(mapDeploymentRow) })
    } catch (e) {
      console.error('[SkillStore] fetchDeployments 失败:', e)
      set({ deployments: [] })
    }
  },
  fetchBackups: async (skillId) => {
    console.log(`[SkillStore] fetchBackups: ${skillId}`)
    try {
      const rows = await skillsApi.getBackups(skillId)
      console.log(`[SkillStore] fetchBackups 完成: ${rows.length} 个备份`)
      set({ backups: rows.map(mapBackupRow) })
    } catch (e) {
      console.error('[SkillStore] fetchBackups 失败:', e)
      set({ backups: [] })
    }
  },
  getSkillById: (id) => get().skills.find((s) => s.id === id),
  getDeploymentsForSkill: (skillId) => get().deployments.filter((d) => d.skill_id === skillId),
  getDeploymentsForProject: (projectId) => get().deployments.filter((d) => d.project_id === projectId),
  getSkillForDeployment: (deployment) => get().skills.find((s) => s.id === deployment.skill_id),
}))
