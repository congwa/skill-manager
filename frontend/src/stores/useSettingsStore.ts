import { create } from 'zustand'
import type { AppSettings } from '@/types'
import { settingsApi } from '@/lib/tauri-api'

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

const defaultSettings: AppSettings = {
  language: 'zh-CN', theme: 'light', startup_page: 'projects', notifications_enabled: true,
  skill_library_path: '~/.skills-manager/skills/', auto_export_frequency: 'daily',
  file_watch_enabled: true, update_check_frequency: 'daily', auto_update: false, history_retention_days: 90,
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  settings: defaultSettings,
  isLoading: false,
  fetchSettings: async () => {
    console.log('[SettingsStore] fetchSettings 开始')
    set({ isLoading: true })
    try {
      const rows = await settingsApi.getAll()
      console.log(`[SettingsStore] fetchSettings 完成: ${rows.length} 个设置项`)
      const parsed = parseSettingsFromRows(rows)
      set((s) => ({ settings: { ...s.settings, ...parsed }, isLoading: false }))
    } catch (e) {
      console.error('[SettingsStore] fetchSettings 失败:', e)
      set({ isLoading: false })
    }
  },
  updateSetting: (key, value) => {
    console.log(`[SettingsStore] updateSetting: ${key} =`, value)
    settingsApi.set(key, JSON.stringify(value)).catch((e) => console.error('[SettingsStore] updateSetting 失败:', e))
    set((s) => ({ settings: { ...s.settings, [key]: value } }))
  },
  updateSettings: (partial) => {
    console.log('[SettingsStore] updateSettings:', Object.keys(partial))
    Object.entries(partial).forEach(([key, value]) => {
      settingsApi.set(key, JSON.stringify(value)).catch((e) => console.error(`[SettingsStore] updateSettings ${key} 失败:`, e))
    })
    set((s) => ({ settings: { ...s.settings, ...partial } }))
  },
}))
