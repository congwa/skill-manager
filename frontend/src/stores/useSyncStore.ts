import { create } from 'zustand'
import type { ChangeEvent, SyncHistory, GitConfig } from '@/types'
import { syncApi, settingsApi, gitApi, deploymentsApi } from '@/lib/tauri-api'
import type { ChangeEventRow, SyncHistoryRow, GitExportConfigRow } from '@/lib/tauri-api'

function mapChangeEventRow(row: ChangeEventRow): ChangeEvent {
  return {
    id: row.id,
    skill_name: '',
    project_name: '',
    tool_name: 'windsurf',
    event_type: row.event_type as ChangeEvent['event_type'],
    status: (row.resolution === 'pending' ? 'pending' : row.resolution === 'ignored' ? 'ignored' : 'resolved') as ChangeEvent['status'],
    detected_at: row.created_at,
    file_path: row.deployment_id,
  }
}

function mapSyncHistoryRow(row: SyncHistoryRow): SyncHistory {
  return {
    id: row.id,
    action_type: row.action as SyncHistory['action_type'],
    skill_name: row.skill_id,
    result: row.status === 'success' ? 'success' : 'failed',
    error_message: row.error_message || undefined,
    created_at: row.created_at,
  }
}

function mapGitConfigRow(row: GitExportConfigRow): GitConfig {
  return {
    platform: row.provider as GitConfig['platform'],
    repo_url: row.remote_url,
    auth_type: row.auth_type as GitConfig['auth_type'],
    branch: row.branch,
    connected: true,
    last_export_at: row.last_push_at || undefined,
  }
}

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
  changeEvents: [],
  syncHistory: [],
  gitConfig: null,
  isChecking: false,
  isExporting: false,
  checkProgress: 0,
  fetchChangeEvents: async () => {
    console.log('[SyncStore] fetchChangeEvents 开始')
    try {
      const rows = await syncApi.getChangeEvents()
      console.log(`[SyncStore] fetchChangeEvents 完成: ${rows.length} 个事件`)
      set({ changeEvents: rows.map(mapChangeEventRow) })
    } catch (e) {
      console.error('[SyncStore] fetchChangeEvents 失败:', e)
      set({ changeEvents: [] })
    }
  },
  fetchSyncHistory: async () => {
    console.log('[SyncStore] fetchSyncHistory 开始')
    try {
      const rows = await syncApi.getHistory(50)
      console.log(`[SyncStore] fetchSyncHistory 完成: ${rows.length} 条记录`)
      set({ syncHistory: rows.map(mapSyncHistoryRow) })
    } catch (e) {
      console.error('[SyncStore] fetchSyncHistory 失败:', e)
      set({ syncHistory: [] })
    }
  },
  fetchGitConfig: async () => {
    console.log('[SyncStore] fetchGitConfig 开始')
    try {
      const configs = await settingsApi.getGitConfigs()
      console.log(`[SyncStore] fetchGitConfig 完成: ${configs.length} 个配置`)
      set({ gitConfig: configs.length > 0 ? mapGitConfigRow(configs[0]) : null })
    } catch (e) {
      console.error('[SyncStore] fetchGitConfig 失败:', e)
      set({ gitConfig: null })
    }
  },
  runConsistencyCheck: async () => {
    set({ isChecking: true, checkProgress: 0 })
    try {
      set({ checkProgress: 30 })
      const report = await deploymentsApi.checkConsistency()
      set({ checkProgress: 100, isChecking: false })
      console.log(`[SyncStore] 一致性检查完成: ${report.total_deployments} 个部署`)
    } catch (e) {
      console.error('[SyncStore] 一致性检查失败:', e)
      set({ isChecking: false })
    }
  },
  exportToGit: async () => {
    set({ isExporting: true })
    try {
      const configs = await settingsApi.getGitConfigs()
      if (configs.length === 0) {
        console.error('[SyncStore] 没有 Git 配置')
        set({ isExporting: false })
        return
      }
      console.log(`[SyncStore] 导出到 Git: config=${configs[0].id}`)
      const result = await gitApi.exportToGit(configs[0].id)
      console.log(`[SyncStore] 导出完成: ${result.message}`)
    } catch (e) {
      console.error('[SyncStore] 导出失败:', e)
    } finally {
      set({ isExporting: false })
    }
  },
  resolveEvent: (id) => {
    console.log(`[SyncStore] resolveEvent: ${id}`)
    syncApi.resolveEvent(id, 'conflict_resolved').catch((e) => console.error('[SyncStore] resolveEvent 失败:', e))
    set((s) => ({
      changeEvents: s.changeEvents.map((e) =>
        e.id === id ? { ...e, status: 'resolved' as const } : e
      ),
    }))
  },
  ignoreEvent: (id) => {
    console.log(`[SyncStore] ignoreEvent: ${id}`)
    syncApi.resolveEvent(id, 'ignored').catch((e) => console.error('[SyncStore] ignoreEvent 失败:', e))
    set((s) => ({
      changeEvents: s.changeEvents.map((e) =>
        e.id === id ? { ...e, status: 'ignored' as const } : e
      ),
    }))
  },
}))
