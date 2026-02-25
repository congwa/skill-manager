import { useLocation } from 'react-router-dom'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'

const pathMap: Record<string, string> = {
  '/projects': '项目',
  '/skills': 'Skills',
  '/store': '仓库',
  '/settings': '设置',
}

export function TopNav() {
  const location = useLocation()

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
            <span key={crumb.path} className="contents">
              {i > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
              <BreadcrumbItem>
                <BreadcrumbLink href={crumb.path} className="text-cream-600 hover:text-cream-800">
                  {crumb.label}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-mint-400" />
        <span className="text-xs text-cream-500">正常</span>
      </div>
    </header>
  )
}
