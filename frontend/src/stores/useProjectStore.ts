import { create } from 'zustand'
import type { Project } from '@/types'
import { mockProjects } from '@/mock/data'

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
  removeProject: (id: string) => void
  scanProject: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectStore>()((set, get) => ({
  projects: mockProjects,
  selectedProjectId: null,
  isLoading: false,
  isScanning: false,
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  selectProject: (id) => set({ selectedProjectId: id }),
  fetchProjects: async () => {
    set({ isLoading: true })
    await new Promise((r) => setTimeout(r, 600))
    set({ projects: mockProjects, isLoading: false })
  },
  addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
  scanProject: async (id) => {
    set({ isScanning: true })
    await new Promise((r) => setTimeout(r, 2000))
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, last_scanned_at: new Date().toISOString() } : p
    )
    set({ projects, isScanning: false })
  },
}))
