import { create } from 'zustand'
import type { ChangeEvent, SyncHistory, GitConfig } from '@/types'
import { mockChangeEvents, mockSyncHistory, mockGitConfig } from '@/mock/data'

interface SyncStore {
  changeEvents: ChangeEvent[]
  syncHistory: SyncHistory[]
  gitConfig: GitConfig | null
  isChecking: boolean
  isExporting: boolean
  checkProgress: number
  fetchChangeEvents: () => Promise<void>
  fetchSyncHistory: () => Promise<void>
  fetchGitConfig: () => Promise<void>
  runConsistencyCheck: () => Promise<void>
  exportToGit: () => Promise<void>
  resolveEvent: (id: string) => void
  ignoreEvent: (id: string) => void
}

export const useSyncStore = create<SyncStore>()((set) => ({
  changeEvents: mockChangeEvents,
  syncHistory: mockSyncHistory,
  gitConfig: mockGitConfig,
  isChecking: false,
  isExporting: false,
  checkProgress: 0,
  fetchChangeEvents: async () => {
    await new Promise((r) => setTimeout(r, 300))
    set({ changeEvents: mockChangeEvents })
  },
  fetchSyncHistory: async () => {
    await new Promise((r) => setTimeout(r, 300))
    set({ syncHistory: mockSyncHistory })
  },
  fetchGitConfig: async () => {
    await new Promise((r) => setTimeout(r, 200))
    set({ gitConfig: mockGitConfig })
  },
  runConsistencyCheck: async () => {
    set({ isChecking: true, checkProgress: 0 })
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((r) => setTimeout(r, 300))
      set({ checkProgress: i })
    }
    set({ isChecking: false, checkProgress: 100 })
  },
  exportToGit: async () => {
    set({ isExporting: true })
    await new Promise((r) => setTimeout(r, 3000))
    set({ isExporting: false })
  },
  resolveEvent: (id) =>
    set((s) => ({
      changeEvents: s.changeEvents.map((e) =>
        e.id === id ? { ...e, status: 'resolved' as const } : e
      ),
    })),
  ignoreEvent: (id) =>
    set((s) => ({
      changeEvents: s.changeEvents.map((e) =>
        e.id === id ? { ...e, status: 'ignored' as const } : e
      ),
    })),
}))
