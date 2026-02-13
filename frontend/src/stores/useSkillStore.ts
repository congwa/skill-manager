import { create } from 'zustand'
import type { Skill, SkillDeployment, SkillBackup } from '@/types'
import { mockSkills, mockDeployments, mockBackups } from '@/mock/data'
import { isTauri, skillsApi, deploymentsApi } from '@/lib/tauri-api'
import type { SkillRow, DeploymentRow, SkillBackupRow } from '@/lib/tauri-api'

function mapSkillRow(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    version: row.version || '',
    source: 'local',
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
    set({ isLoading: true })
    try {
      if (isTauri()) {
        const rows = await skillsApi.getAll()
        set({ skills: rows.map(mapSkillRow), isLoading: false })
      } else {
        await new Promise((r) => setTimeout(r, 400))
        set({ skills: mockSkills, isLoading: false })
      }
    } catch (e) {
      console.error('fetchSkills error:', e)
      set({ skills: mockSkills, isLoading: false })
    }
  },
  fetchDeployments: async () => {
    try {
      if (isTauri()) {
        const rows = await deploymentsApi.getAll()
        set({ deployments: rows.map(mapDeploymentRow) })
      } else {
        await new Promise((r) => setTimeout(r, 300))
        set({ deployments: mockDeployments })
      }
    } catch (e) {
      console.error('fetchDeployments error:', e)
      set({ deployments: mockDeployments })
    }
  },
  fetchBackups: async (skillId) => {
    try {
      if (isTauri()) {
        const rows = await skillsApi.getBackups(skillId)
        set({ backups: rows.map(mapBackupRow) })
      } else {
        await new Promise((r) => setTimeout(r, 300))
        set({ backups: mockBackups })
      }
    } catch (e) {
      console.error('fetchBackups error:', e)
      set({ backups: mockBackups })
    }
  },
  getSkillById: (id) => get().skills.find((s) => s.id === id),
  getDeploymentsForSkill: (skillId) => get().deployments.filter((d) => d.skill_id === skillId),
  getDeploymentsForProject: (projectId) => get().deployments.filter((d) => d.project_id === projectId),
  getSkillForDeployment: (deployment) => get().skills.find((s) => s.id === deployment.skill_id),
}))
