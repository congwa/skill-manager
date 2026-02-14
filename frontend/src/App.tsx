import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { listen } from '@tauri-apps/api/event'
import { AppLayout } from '@/components/layout/AppLayout'
import Onboarding from '@/pages/Onboarding'
import ProjectList from '@/pages/ProjectList'
import ProjectDetail from '@/pages/ProjectDetail'
import SkillList from '@/pages/SkillList'
import SkillDetail from '@/pages/SkillDetail'
import SkillEditor from '@/pages/SkillEditor'
import SkillsStore from '@/pages/SkillsStore'
import GitImport from '@/pages/GitImport'
import SyncCenter from '@/pages/SyncCenter'
import UpdateManager from '@/pages/UpdateManager'
import Settings from '@/pages/Settings'
import { useUIStore } from '@/stores/useUIStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSkillStore } from '@/stores/useSkillStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSyncStore } from '@/stores/useSyncStore'
import { settingsApi, scannerApi, deploymentsApi } from '@/lib/tauri-api'
import { toast } from 'sonner'

function App() {
  const onboardingCompleted = useUIStore((s) => s.onboardingCompleted)
  const initOnboarding = useUIStore((s) => s.initOnboardingState)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const fetchSkills = useSkillStore((s) => s.fetchSkills)
  const fetchDeployments = useSkillStore((s) => s.fetchDeployments)
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)
  const fetchChangeEvents = useSyncStore((s) => s.fetchChangeEvents)
  const fetchSyncHistory = useSyncStore((s) => s.fetchSyncHistory)
  const fetchGitConfig = useSyncStore((s) => s.fetchGitConfig)
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    const bootstrap = async () => {
      console.log('[App] === Skills Manager 前端启动 ===')
      const t0 = performance.now()

      try {
        console.log('[App] 1/5 检查应用初始化状态...')
        const status = await settingsApi.getInitStatus()
        console.log('[App] 初始化状态:', JSON.stringify(status, null, 2))

        if (!status.initialized) {
          console.log('[App] 2/5 首次运行，执行应用初始化...')
          const initResult = await settingsApi.initializeApp()
          console.log('[App] 初始化完成:', JSON.stringify(initResult, null, 2))
        } else {
          console.log('[App] 2/5 应用已初始化，跳过')
        }

        console.log('[App] 3/5 扫描全局工具目录 Skill...')
        const scanResult = await scannerApi.scanGlobalSkills().catch((e) => {
          console.error('[App] 全局扫描失败:', e)
          return null
        })
        if (scanResult) {
          console.log(`[App] 全局扫描完成: 发现工具 [${scanResult.tools_found.join(', ')}], 新导入 ${scanResult.skills_imported} 个 Skill, 新建 ${scanResult.deployments_created} 个部署`)
        }

        console.log('[App] 4/5 全量对账: 检测磁盘与数据库一致性...')
        const reconcileResult = await deploymentsApi.reconcile().catch((e) => {
          console.error('[App] 对账失败:', e)
          return null
        })
        if (reconcileResult) {
          console.log(`[App] 对账完成: ${reconcileResult.deployments_checked} 已检查, ${reconcileResult.missing_detected} 缺失, ${reconcileResult.diverged_detected} 偏离, ${reconcileResult.untracked_found} 未跟踪, ${reconcileResult.change_events_created} 事件`)
        }
      } catch (e) {
        console.error('[App] 初始化出错:', e)
      }

      console.log('[App] 5/5 拉取所有 Store 数据...')
      const results = await Promise.allSettled([
        initOnboarding(),
        fetchProjects(),
        fetchSkills(),
        fetchDeployments(),
        fetchSettings(),
        fetchChangeEvents(),
        fetchSyncHistory(),
        fetchGitConfig(),
      ])

      const names = ['onboarding', 'projects', 'skills', 'deployments', 'settings', 'changeEvents', 'syncHistory', 'gitConfig']
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          console.log(`[App]   ✓ ${names[i]} 加载成功`)
        } else {
          console.error(`[App]   ✗ ${names[i]} 加载失败:`, r.reason)
        }
      })

      const elapsed = (performance.now() - t0).toFixed(0)
      console.log(`[App] === 启动完成 (${elapsed}ms) ===`)
      setAppReady(true)
    }
    bootstrap()
  }, [])

  // 监听后端 skill-change 事件，自动刷新数据
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<{ event_id: string; event_type: string; path: string; deployment_id: string }>(
      'skill-change',
      (event) => {
        console.log('[App] 收到 skill-change 事件:', event.payload)
        // 自动刷新变更事件和部署数据
        fetchChangeEvents()
        fetchDeployments()
        toast.info(`检测到文件变更: ${event.payload.event_type}`, {
          description: event.payload.path.split('/').slice(-3).join('/'),
          duration: 4000,
        })
      }
    ).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [fetchChangeEvents, fetchDeployments])

  if (!appReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-3 border-peach-300 border-t-peach-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-cream-500">正在初始化应用...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<AppLayout />}>
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/skills" element={<SkillList />} />
          <Route path="/skills/:skillId" element={<SkillDetail />} />
          <Route path="/skills/:skillId/edit" element={<SkillEditor />} />
          <Route path="/store" element={<SkillsStore />} />
          <Route path="/import" element={<GitImport />} />
          <Route path="/sync" element={<SyncCenter />} />
          <Route path="/updates" element={<UpdateManager />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/" element={<Navigate to={onboardingCompleted ? '/projects' : '/onboarding'} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
