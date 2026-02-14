import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen, Sparkles, BellRing, AlertTriangle, Plus,
  Search, MoreHorizontal, RefreshCw, Trash2, LayoutGrid, List, Upload, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSkillStore } from '@/stores/useSkillStore'
import { cn, toolColors, toolNames, relativeTime } from '@/lib/utils'
import { projectsApi } from '@/lib/tauri-api'
import { toast } from 'sonner'
import type { ToolName } from '@/types'

const statLabels: Record<string, { bg: string; text: string; label: string }> = {
  synced: { bg: 'bg-mint-100', text: 'text-mint-500', label: '已同步' },
  changed: { bg: 'bg-honey-100', text: 'text-honey-500', label: '有变更' },
  unsynced: { bg: 'bg-cream-200', text: 'text-cream-600', label: '未同步' },
}

export default function ProjectList() {
  const { projects, isLoading: loading, searchQuery, setSearchQuery, removeProject } = useProjectStore()
  const deployments = useSkillStore((s) => s.deployments)
  const skills = useSkillStore((s) => s.skills)
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState('name')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const totalSkills = skills.length
  const pendingChanges = deployments.filter((d) => d.status === 'diverged' || d.status === 'missing').length
  const divergedDeploys = deployments.filter((d) => d.status === 'diverged').length

  const filtered = projects
    .filter((p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.path.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'modified') return new Date(b.last_scanned_at).getTime() - new Date(a.last_scanned_at).getTime()
      return b.skill_count - a.skill_count
    })

  const handleDelete = () => {
    if (deleteId) {
      removeProject(deleteId)
      setDeleteId(null)
    }
  }

  const handleRescan = async (projectId: string) => {
    await useProjectStore.getState().scanProject(projectId)
  }

  const [isDragging, setIsDragging] = useState(false)

  const handleAddScan = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: true, title: '选择项目目录（可多选）' })
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected]
        setScanning(true); setScanProgress(20)
        if (paths.length === 1) {
          await useProjectStore.getState().addProjectByPath(paths[0])
          setScanProgress(60)
          const lastProject = useProjectStore.getState().projects[useProjectStore.getState().projects.length - 1]
          if (lastProject) await useProjectStore.getState().scanProject(lastProject.id)
          setScanProgress(100)
          toast.success(`项目 ${paths[0].split('/').pop()} 添加成功`)
        } else {
          setScanProgress(40)
          const result = await projectsApi.batchAdd(paths)
          setScanProgress(70)
          await useProjectStore.getState().fetchProjects()
          setScanProgress(100)
          if (result.skipped.length > 0) {
            toast.warning(`添加 ${result.added.length} 个，跳过 ${result.skipped.length} 个`)
          } else {
            toast.success(`成功添加 ${result.added.length} 个项目`)
          }
        }
        setScanning(false); setAddOpen(false)
      }
    } catch (e) {
      console.error('add project error:', e)
      toast.error('添加项目失败: ' + String(e))
      setScanning(false)
    }
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const items = Array.from(e.dataTransfer.items)
    const paths: string[] = []
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        paths.push(entry.fullPath || entry.name)
      }
    }
    if (paths.length === 0) {
      // Tauri 环境下可能无法通过 webkitGetAsEntry 获取路径，改用对话框
      toast.info('请使用上方按钮选择目录')
      return
    }
    setScanning(true); setScanProgress(30)
    try {
      const result = await projectsApi.batchAdd(paths)
      await useProjectStore.getState().fetchProjects()
      setScanProgress(100)
      toast.success(`添加 ${result.added.length} 个项目`)
    } catch (err) {
      toast.error('批量添加失败: ' + String(err))
    } finally {
      setScanning(false); setAddOpen(false)
    }
  }, [])

  const statCards = [
    { label: '项目总数', value: projects.length, icon: FolderOpen, bg: 'bg-peach-50', color: 'text-peach-600' },
    { label: 'Skill 总数', value: totalSkills, icon: Sparkles, bg: 'bg-lavender-50', color: 'text-lavender-400' },
    { label: '待处理变更', value: pendingChanges, icon: BellRing, bg: 'bg-honey-50', color: pendingChanges > 0 ? 'text-honey-500' : 'text-cream-500' },
    { label: '偏离部署数', value: divergedDeploys, icon: AlertTriangle, bg: 'bg-strawberry-50', color: divergedDeploys > 0 ? 'text-strawberry-500' : 'text-cream-500' },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="grid grid-cols-3 gap-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className={cn('border-0 rounded-2xl overflow-hidden', stat.bg)} style={{ boxShadow: 'var(--shadow-card)' }}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={cn('p-3 rounded-2xl bg-card/60 backdrop-blur-sm')}>
                <stat.icon className={cn('h-6 w-6', stat.color)} />
              </div>
              <div>
                <p className="text-xs text-cream-500 font-medium">{stat.label}</p>
                <p className={cn('text-2xl font-bold font-display', stat.color)}>{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 操作栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => setAddOpen(true)} className="bg-peach-500 hover:bg-peach-600 text-white rounded-full px-6" style={{ boxShadow: 'var(--shadow-clay)' }}>
          <Plus className="h-4 w-4 mr-1" /> 添加项目
        </Button>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-400" />
          <Input placeholder="搜索项目..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-full border-cream-300" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-36 rounded-lg border-cream-300"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">按名称</SelectItem>
              <SelectItem value="modified">按最近修改</SelectItem>
              <SelectItem value="skills">按 Skill 数量</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border border-cream-300 overflow-hidden">
            <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" className="h-9 w-9 rounded-none" onClick={() => setViewMode('grid')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-9 w-9 rounded-none" onClick={() => setViewMode('list')}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 项目卡片 */}
      {filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20">
          <div className="text-6xl mb-4">🐱</div>
          <h2 className="text-xl font-display font-bold text-cream-700 mb-2">
            {searchQuery ? '没有找到匹配的项目' : '还没有项目呢～'}
          </h2>
          <p className="text-cream-500 mb-6">添加一个项目，开始管理你的 Skill 吧</p>
          {!searchQuery && (
            <Button onClick={() => setAddOpen(true)} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> 添加项目
            </Button>
          )}
        </motion.div>
      ) : (
        <motion.div layout className={cn(
          viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6' : 'space-y-3'
        )}>
          <AnimatePresence>
            {filtered.map((project, i) => {
              const stat = statLabels[project.sync_status]
              return (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Card className="cursor-pointer border border-cream-200 rounded-2xl bg-card overflow-hidden transition-all duration-300 group"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-card)')}
                    onClick={() => navigate(`/projects/${project.id}`)}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <h3 className="font-display font-bold text-cream-800 text-lg truncate">{project.name}</h3>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRescan(project.id) }}><RefreshCw className="h-4 w-4 mr-2" /> 重新扫描</DropdownMenuItem>
                            <DropdownMenuItem className="text-strawberry-500" onClick={(e) => { e.stopPropagation(); setDeleteId(project.id) }}>
                              <Trash2 className="h-4 w-4 mr-2" /> 删除项目
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-cream-500 truncate">{project.path}</p>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">{project.path}</p></TooltipContent>
                      </Tooltip>
                      <div className="flex gap-2">
                        {project.detected_tools.map((tool: ToolName) => (
                          <Tooltip key={tool}>
                            <TooltipTrigger>
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition-transform hover:scale-110"
                                style={{ backgroundColor: toolColors[tool] }}>
                                {toolNames[tool][0]}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent><p>{toolNames[tool]}</p></TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary" className="bg-peach-100 text-peach-700 text-xs rounded-full px-3 py-0.5 shrink-0">
                          {project.skill_count} Skills
                        </Badge>
                        <Badge variant="outline" className={cn('text-xs rounded-full px-3 py-0.5 shrink-0 border-0', stat.bg, stat.text)}>
                          {stat.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-cream-400">{relativeTime(project.last_scanned_at)}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* 添加项目弹窗 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>添加项目</DialogTitle></DialogHeader>
          {!scanning ? (
            <div className="space-y-4">
              <div
                className={cn(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
                  isDragging ? 'border-peach-500 bg-peach-50' : 'border-cream-300 hover:border-peach-300 hover:bg-peach-50/50'
                )}
                onClick={handleAddScan}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                {isDragging ? (
                  <>
                    <Upload className="h-10 w-10 text-peach-500 mx-auto mb-3" />
                    <p className="text-peach-600 text-sm font-medium">松开即可添加</p>
                  </>
                ) : (
                  <>
                    <FolderOpen className="h-10 w-10 text-cream-400 mx-auto mb-3" />
                    <p className="text-cream-600 text-sm">拖拽文件夹或点击选择（支持多选）</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <Loader2 className="h-6 w-6 text-peach-400 animate-spin mx-auto" />
              <p className="text-sm text-cream-600 text-center">正在添加项目...</p>
              <Progress value={scanProgress} className="h-2" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要移除这个项目吗？</AlertDialogTitle>
            <AlertDialogDescription>仅从 Skills Manager 中移除，不会删除项目文件</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-strawberry-500 hover:bg-strawberry-400">确认移除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
