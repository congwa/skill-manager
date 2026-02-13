import { create } from 'zustand'
import type { Project } from '@/types'
import { projectsApi, scannerApi } from '@/lib/tauri-api'

interface ProjectStore {
  projects: Project[]
  selectedProjectId: string | null
  isLoading: boolean
  isScanning: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectProject: (id: string | null) => void
  fetchProjects: () => Promise<void>
  addProject: (project: Project) => void
  addProjectByPath: (path: string) => Promise<void>
  removeProject: (id: string) => void
  scanProject: (id: string) => Promise<void>
}

function mapRowToProject(row: { id: string; name: string; path: string; status: string; last_scanned: string | null; skill_count: number; tool_count: number; created_at: string }): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    detected_tools: [],
    skill_count: row.skill_count,
    last_scanned_at: row.last_scanned || row.created_at,
    sync_status: row.status as Project['sync_status'],
    created_at: row.created_at,
  }
}

export const useProjectStore = create<ProjectStore>()((set, get) => ({
  projects: [],
  selectedProjectId: null,
  isLoading: false,
  isScanning: false,
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  selectProject: (id) => set({ selectedProjectId: id }),
  fetchProjects: async () => {
    console.log('[ProjectStore] fetchProjects 开始')
    set({ isLoading: true })
    try {
      const rows = await projectsApi.getAll()
      console.log(`[ProjectStore] fetchProjects 完成: ${rows.length} 个项目`)
      set({ projects: rows.map(mapRowToProject), isLoading: false })
    } catch (e) {
      console.error('[ProjectStore] fetchProjects 失败:', e)
      set({ projects: [], isLoading: false })
    }
  },
  addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),
  addProjectByPath: async (path) => {
    console.log(`[ProjectStore] addProjectByPath: ${path}`)
    try {
      const row = await projectsApi.add(path)
      console.log(`[ProjectStore] addProjectByPath 成功: ${row.name} (${row.id})`)
      set((s) => ({ projects: [...s.projects, mapRowToProject(row)] }))
    } catch (e) {
      console.error('[ProjectStore] addProjectByPath 失败:', e)
      throw e
    }
  },
  removeProject: (id) => {
    console.log(`[ProjectStore] removeProject: ${id}`)
    projectsApi.remove(id).catch((e) => console.error('[ProjectStore] removeProject 失败:', e))
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
  },
  scanProject: async (id) => {
    console.log(`[ProjectStore] scanProject: ${id}`)
    set({ isScanning: true })
    try {
      const project = get().projects.find((p) => p.id === id)
      if (project) {
        console.log(`[ProjectStore] scanProject: 扫描 ${project.path}`)
        const result = await scannerApi.scanAndImport(project.path)
        console.log(`[ProjectStore] scanProject 完成: 发现 ${result.skills.length} 个 Skill`)
        const rows = await projectsApi.getAll()
        set({ projects: rows.map(mapRowToProject), isScanning: false })
      }
    } catch (e) {
      console.error('[ProjectStore] scanProject 失败:', e)
      set({ isScanning: false })
    }
  },
}))
