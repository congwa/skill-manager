import { create } from 'zustand'
import type { Skill, SkillDeployment, SkillBackup } from '@/types'
import { mockSkills, mockDeployments, mockBackups } from '@/mock/data'

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
  skills: mockSkills,
  deployments: mockDeployments,
  backups: mockBackups,
  selectedSkillId: null,
  isLoading: false,
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  selectSkill: (id) => set({ selectedSkillId: id }),
  fetchSkills: async () => {
    set({ isLoading: true })
    await new Promise((r) => setTimeout(r, 400))
    set({ skills: mockSkills, isLoading: false })
  },
  fetchDeployments: async () => {
    await new Promise((r) => setTimeout(r, 300))
    set({ deployments: mockDeployments })
  },
  fetchBackups: async () => {
    await new Promise((r) => setTimeout(r, 300))
    set({ backups: mockBackups })
  },
  getSkillById: (id) => get().skills.find((s) => s.id === id),
  getDeploymentsForSkill: (skillId) => get().deployments.filter((d) => d.skill_id === skillId),
  getDeploymentsForProject: (projectId) => get().deployments.filter((d) => d.project_id === projectId),
  getSkillForDeployment: (deployment) => get().skills.find((s) => s.id === deployment.skill_id),
}))
