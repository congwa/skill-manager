import { create } from 'zustand'
import type { AppSettings } from '@/types'
import { mockSettings } from '@/mock/data'

interface SettingsStore {
  settings: AppSettings
  isLoading: boolean
  fetchSettings: () => Promise<void>
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateSettings: (partial: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  settings: mockSettings,
  isLoading: false,
  fetchSettings: async () => {
    set({ isLoading: true })
    await new Promise((r) => setTimeout(r, 200))
    set({ settings: mockSettings, isLoading: false })
  },
  updateSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),
  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),
}))
