import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import { isTauri, settingsApi } from '@/lib/tauri-api'

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
      try {
        if (isTauri()) {
          const status = await settingsApi.getInitStatus()
          if (!status.initialized) {
            await settingsApi.initializeApp()
          }
        }
      } catch (e) {
        console.error('App init error:', e)
      }

      await Promise.allSettled([
        initOnboarding(),
        fetchProjects(),
        fetchSkills(),
        fetchDeployments(),
        fetchSettings(),
        fetchChangeEvents(),
        fetchSyncHistory(),
        fetchGitConfig(),
      ])
      setAppReady(true)
    }
    bootstrap()
  }, [])

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
