import { useLocation, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useSyncStore } from '@/stores/useSyncStore'

const pathMap: Record<string, string> = {
  '/projects': '项目',
  '/skills': 'Skills',
  '/explorer': 'Explorer',
  '/store': '仓库',
  '/import': 'Git 导入',
  '/sync': '同步中心',
  '/updates': '更新管理',
  '/settings': '设置',
}

export function TopNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const pendingCount = useSyncStore((s) => s.changeEvents.filter((e) => e.status === 'pending').length)

  const segments = location.pathname.split('/').filter(Boolean)
  const crumbs = segments.map((_, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/')
    return { path, label: pathMap[path] || segments[i] }
  })

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-cream-300 bg-card/80 backdrop-blur-md px-6 shadow-soft">
      <SidebarTrigger className="text-cream-500 hover:text-cream-700" />

      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => (
            <BreadcrumbItem key={crumb.path}>
              {i > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
              <BreadcrumbLink href={crumb.path} className="text-cream-600 hover:text-cream-800">
                {crumb.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="relative text-cream-500 hover:text-cream-700"
          onClick={() => navigate('/sync')}
          title="同步中心"
        >
          <Bell className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-strawberry-500 text-[10px] text-white font-bold">
              {pendingCount}
            </span>
          )}
        </Button>

        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-mint-400" />
          <span className="text-xs text-cream-500">正常</span>
        </div>
      </div>
    </header>
  )
}
