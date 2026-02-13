import { create } from 'zustand'
import type { AppSettings } from '@/types'
import { mockSettings } from '@/mock/data'
import { isTauri, settingsApi } from '@/lib/tauri-api'

interface SettingsStore {
  settings: AppSettings
  isLoading: boolean
  fetchSettings: () => Promise<void>
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateSettings: (partial: Partial<AppSettings>) => void
}

function parseSettingsFromRows(rows: { key: string; value: string | null }[]): Partial<AppSettings> {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    if (row.value === null) continue
    try {
      result[row.key] = JSON.parse(row.value)
    } catch {
      result[row.key] = row.value
    }
  }
  const mapped: Partial<AppSettings> = {}
  if (result.theme) mapped.theme = result.theme as AppSettings['theme']
  if (result.language) mapped.language = result.language as AppSettings['language']
  if (result.notification_enabled !== undefined) mapped.notifications_enabled = result.notification_enabled as boolean
  if (result.skills_lib_path) mapped.skill_library_path = result.skills_lib_path as string
  if (result.update_check_interval) mapped.update_check_frequency = result.update_check_interval as AppSettings['update_check_frequency']
  return mapped
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  settings: mockSettings,
  isLoading: false,
  fetchSettings: async () => {
    set({ isLoading: true })
    try {
      if (isTauri()) {
        const rows = await settingsApi.getAll()
        const parsed = parseSettingsFromRows(rows)
        set((s) => ({ settings: { ...s.settings, ...parsed }, isLoading: false }))
      } else {
        await new Promise((r) => setTimeout(r, 200))
        set({ settings: mockSettings, isLoading: false })
      }
    } catch (e) {
      console.error('fetchSettings error:', e)
      set({ settings: mockSettings, isLoading: false })
    }
  },
  updateSetting: (key, value) => {
    if (isTauri()) {
      settingsApi.set(key, JSON.stringify(value)).catch(console.error)
    }
    set((s) => ({ settings: { ...s.settings, [key]: value } }))
  },
  updateSettings: (partial) => {
    if (isTauri()) {
      Object.entries(partial).forEach(([key, value]) => {
        settingsApi.set(key, JSON.stringify(value)).catch(console.error)
      })
    }
    set((s) => ({ settings: { ...s.settings, ...partial } }))
  },
}))
