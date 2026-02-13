import { create } from 'zustand'
import type { Project } from '@/types'
import { mockProjects } from '@/mock/data'
import { isTauri, projectsApi, scannerApi } from '@/lib/tauri-api'

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
    set({ isLoading: true })
    try {
      if (isTauri()) {
        const rows = await projectsApi.getAll()
        set({ projects: rows.map(mapRowToProject), isLoading: false })
      } else {
        await new Promise((r) => setTimeout(r, 600))
        set({ projects: mockProjects, isLoading: false })
      }
    } catch (e) {
      console.error('fetchProjects error:', e)
      set({ projects: mockProjects, isLoading: false })
    }
  },
  addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),
  addProjectByPath: async (path) => {
    try {
      if (isTauri()) {
        const row = await projectsApi.add(path)
        set((s) => ({ projects: [...s.projects, mapRowToProject(row)] }))
      }
    } catch (e) {
      console.error('addProjectByPath error:', e)
      throw e
    }
  },
  removeProject: (id) => {
    if (isTauri()) {
      projectsApi.remove(id).catch(console.error)
    }
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
  },
  scanProject: async (id) => {
    set({ isScanning: true })
    try {
      const project = get().projects.find((p) => p.id === id)
      if (isTauri() && project) {
        await scannerApi.scanAndImport(project.path)
        const rows = await projectsApi.getAll()
        set({ projects: rows.map(mapRowToProject), isScanning: false })
      } else {
        await new Promise((r) => setTimeout(r, 2000))
        const projects = get().projects.map((p) =>
          p.id === id ? { ...p, last_scanned_at: new Date().toISOString() } : p
        )
        set({ projects, isScanning: false })
      }
    } catch (e) {
      console.error('scanProject error:', e)
      set({ isScanning: false })
    }
  },
}))
