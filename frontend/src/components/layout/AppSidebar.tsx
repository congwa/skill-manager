import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FolderOpen, Sparkles, Code2, Store, GitBranch, RefreshCw,
  Download, Settings, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const menuItems = [
  { label: '项目', icon: FolderOpen, path: '/projects' },
  { label: 'Skills', icon: Sparkles, path: '/skills' },
  { label: 'Explorer', icon: Code2, path: '/explorer' },
  { label: '仓库', icon: Store, path: '/store' },
  { label: 'Git 导入', icon: GitBranch, path: '/import' },
  { label: '同步中心', icon: RefreshCw, path: '/sync' },
  { label: '更新管理', icon: Download, path: '/updates' },
  { label: '设置', icon: Settings, path: '/settings' },
]

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === 'collapsed'

  return (
    <Sidebar collapsible="icon" className="border-r border-cream-300 bg-cream-50">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <motion.div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-peach-400 to-peach-600 text-white font-bold text-sm"
            whileHover={{ scale: 1.05 }}
          >
            SM
          </motion.div>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-display text-lg font-bold text-cream-800 truncate"
            >
              Skills Manager
            </motion.span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path)
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.path)}
                      tooltip={item.label}
                      className={cn(
                        'relative overflow-visible rounded-xl transition-all duration-200',
                        isActive
                          ? 'bg-peach-100 text-peach-700 font-semibold border border-peach-200/60'
                          : 'text-cream-600 hover:bg-peach-50 hover:text-cream-800'
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute -left-1 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-peach-500 rounded-full"
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      )}
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-mint-400 animate-pulse" />
          {!collapsed && <span className="text-xs text-cream-500">数据库正常</span>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-7 w-7 text-cream-500 hover:text-cream-700"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
