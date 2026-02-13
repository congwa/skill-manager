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

function App() {
  const onboardingCompleted = useUIStore((s) => s.onboardingCompleted)

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
