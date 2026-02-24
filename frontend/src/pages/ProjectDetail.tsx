import { useParams, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Scan, Plus, ShieldCheck, ChevronDown,
  RefreshCw, Eye, Trash2, Copy, Search, Loader2,
  UploadCloud, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSkillStore } from '@/stores/useSkillStore'
import { cn, toolNames, statusColors, relativeTime } from '@/lib/utils'
import { ToolIcon } from '@/components/ui/ToolIcon'
import { ALL_TOOLS } from '@/lib/tools'
import { toast } from 'sonner'
import { deploymentsApi } from '@/lib/tauri-api'

export default function ProjectDetail() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  const { skills, deployments, fetchDeployments } = useSkillStore()

  const [openTools, setOpenTools] = useState<Record<string, boolean>>({})
  const [scanning, setScanning] = useState(false)
  const [checking, setChecking] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // 部署对话框
  const [deployOpen, setDeployOpen] = useState(false)
  const [deploySkillId, setDeploySkillId] = useState('')
  const [deployTool, setDeployTool] = useState(ALL_TOOLS[0]?.id ?? '')
  const [deploying, setDeploying] = useState(false)
  const [skillSearch, setSkillSearch] = useState('')

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-cream-500">项目不存在</p>
        <Button variant="ghost" onClick={() => navigate('/projects')} className="mt-4">返回项目列表</Button>
      </div>
    )
  }

  // ── 从部署记录派生工具分组（不依赖 detected_tools）─────────────────────────
  const projectDeployments = deployments.filter((d) => d.project_id === projectId)

  const toolGroups = useMemo(() => {
    const map: Record<string, Array<typeof projectDeployments[0] & { skill: typeof skills[0] | undefined }>> = {}
    for (const dep of projectDeployments) {
      if (!map[dep.tool_name]) map[dep.tool_name] = []
      map[dep.tool_name].push({ ...dep, skill: skills.find((s) => s.id === dep.skill_id) })
    }
    return map
  }, [projectDeployments, skills])

  const toolList = Object.keys(toolGroups)

  const toggleTool = (tool: string) =>
    setOpenTools((prev) => ({ ...prev, [tool]: !prev[tool] }))

  // ── 操作：重新扫描 ────────────────────────────────────────────────────────
  const handleScan = async () => {
    setScanning(true)
    try {
      await useProjectStore.getState().scanProject(projectId!)
      await fetchDeployments()
      toast.success('扫描完成')
    } catch (e) {
      toast.error('扫描失败: ' + String(e))
    } finally {
      setScanning(false)
    }
  }

  // ── 操作：一致性检查 ──────────────────────────────────────────────────────
  const handleConsistencyCheck = async () => {
    if (checking) return
    setChecking(true)
    const id = toast.loading('正在检查一致性...')
    try {
      const report = await deploymentsApi.checkConsistency()
      await fetchDeployments()
      const projectDetails = report.details.filter((d) =>
        projectDeployments.some((pd) => pd.id === d.deployment_id)
      )
      const diverged = projectDetails.filter((d) => d.status !== 'synced')
      if (diverged.length === 0) {
        toast.success(`所有 Skill 状态正常 ✓ (${projectDetails.length} 个部署已检查)`, { id })
      } else {
        toast.warning(`发现 ${diverged.length} 个偏离部署 (共 ${projectDetails.length} 个)`, { id })
      }
    } catch (e) {
      toast.error('检查失败: ' + String(e), { id })
    } finally {
      setChecking(false)
    }
  }

  // ── 操作：同步单个部署 ────────────────────────────────────────────────────
  const handleSync = async (depId: string) => {
    setSyncing(depId)
    const id = toast.loading('同步中...')
    try {
      await deploymentsApi.syncDeployment(depId)
      await fetchDeployments()
      toast.success('同步完成', { id })
    } catch (e) {
      toast.error('同步失败: ' + String(e), { id })
    } finally {
      setSyncing(null)
    }
  }

  // ── 操作：删除部署 ────────────────────────────────────────────────────────
  const handleDelete = async (depId: string, depPath: string) => {
    const ok = window.confirm(
      `确认删除此部署？\n\n将同时删除磁盘上的文件：\n${depPath}\n\n此操作不可恢复。`
    )
    if (!ok) return
    setDeleting(depId)
    const id = toast.loading('删除中...')
    try {
      await deploymentsApi.delete(depId)
      await fetchDeployments()
      toast.success('部署已删除', { id })
    } catch (e) {
      toast.error('删除失败: ' + String(e), { id })
    } finally {
      setDeleting(null)
    }
  }

  // ── 操作：部署新 Skill ────────────────────────────────────────────────────
  const handleDeploy = async () => {
    if (!deploySkillId || !deployTool) return
    setDeploying(true)
    const id = toast.loading('部署中...')
    try {
      await deploymentsApi.deployToProject(deploySkillId, projectId!, deployTool, false)
      await fetchDeployments()
      toast.success('部署成功', { id })
      setDeployOpen(false)
      setDeploySkillId('')
    } catch (e) {
      toast.error('部署失败: ' + String(e), { id })
    } finally {
      setDeploying(false)
    }
  }

  const filteredSkills = useMemo(() =>
    skills.filter((s) =>
      s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
      s.description?.toLowerCase().includes(skillSearch.toLowerCase())
    ), [skills, skillSearch])

  return (
    <div className="space-y-6">
      {/* ── 顶部 ── */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/projects')} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/projects">项目列表</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
                <BreadcrumbItem><BreadcrumbLink>{project.name}</BreadcrumbLink></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <h1 className="text-3xl font-display font-bold text-cream-800">{project.name}</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="text-sm text-cream-500 cursor-pointer hover:text-cream-700 flex items-center gap-1"
                onClick={() => { navigator.clipboard.writeText(project.path); toast.success('路径已复制') }}
              >
                {project.path} <Copy className="h-3 w-3" />
              </p>
            </TooltipTrigger>
            <TooltipContent>点击复制路径</TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-3 text-xs text-cream-400">
            <span>最后扫描：{relativeTime(project.last_scanned_at)}</span>
            {toolList.length > 0 && (
              <>
                <span>·</span>
                <span>{toolList.length} 个工具</span>
                <span>·</span>
                <span>{projectDeployments.length} 个部署</span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleScan} disabled={scanning} className="rounded-xl">
            {scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Scan className="h-4 w-4 mr-1" />}
            {scanning ? '扫描中...' : '重新扫描'}
          </Button>
          <Button
            className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl"
            onClick={() => setDeployOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" /> 部署 Skill
          </Button>
          <Button variant="ghost" onClick={handleConsistencyCheck} disabled={checking} className="rounded-xl">
            {checking
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />检查中...</>
              : <><ShieldCheck className="h-4 w-4 mr-1" />一致性检查</>}
          </Button>
        </div>
      </div>

      {/* ── 工具分组列表 ── */}
      <div className="space-y-4">
        {toolList.map((tool) => {
          const items = toolGroups[tool]
          const isOpen = openTools[tool] !== false
          const syncedCount  = items.filter((i) => i.status === 'synced').length
          const divergedCount = items.filter((i) => i.status === 'diverged').length
          const missingCount  = items.filter((i) => i.status === 'missing').length

          return (
            <Collapsible key={tool} open={isOpen} onOpenChange={() => toggleTool(tool)}>
              <Card className="border border-cream-200">
                <CollapsibleTrigger asChild>
                  <CardContent className="flex items-center justify-between p-4 cursor-pointer hover:bg-cream-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <ToolIcon tool={tool} size={32} />
                      <h2 className="font-display font-semibold text-cream-800">
                        {toolNames[tool] ?? tool}
                      </h2>
                      <Badge variant="secondary" className="bg-peach-100 text-peach-700 text-xs">
                        {items.length} Skills
                      </Badge>
                      <span className="text-xs flex gap-2">
                        {syncedCount > 0 && <span className="text-mint-500">{syncedCount} 已同步</span>}
                        {divergedCount > 0 && <span className="text-honey-500">{divergedCount} 已偏离</span>}
                        {missingCount > 0 && <span className="text-strawberry-400">{missingCount} 缺失</span>}
                      </span>
                    </div>
                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="h-4 w-4 text-cream-400" />
                    </motion.div>
                  </CardContent>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t border-cream-200">
                    <AnimatePresence>
                      {items.map((item, i) => {
                        const stat = statusColors[item.status] ?? statusColors['synced']
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                            className="flex items-center gap-4 px-5 py-3 hover:bg-peach-50/50 transition-colors border-b border-cream-100 last:border-b-0"
                          >
                            {/* Skill 名称 */}
                            <h3
                              className="font-semibold text-cream-800 min-w-[140px] cursor-pointer hover:text-peach-600 truncate"
                              onClick={() => item.skill && navigate(`/skills/${item.skill.id}`)}
                            >
                              {item.skill?.name ?? 'Unknown'}
                            </h3>

                            {/* 版本 */}
                            <Badge variant="outline" className="bg-lavender-50 text-lavender-400 text-xs shrink-0">
                              v{item.skill?.version ?? '?'}
                            </Badge>

                            {/* 状态 */}
                            <Badge variant="outline" className={cn('text-xs shrink-0', stat.bg, stat.text)}>
                              {stat.label}
                            </Badge>

                            {/* 路径 */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-cream-400 truncate max-w-[200px] flex-1 block">
                                  {item.deploy_path}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent><p className="text-xs font-mono">{item.deploy_path}</p></TooltipContent>
                            </Tooltip>

                            {/* 最后同步时间 */}
                            <span className="text-xs text-cream-400 shrink-0 ml-auto">
                              {relativeTime(item.last_synced_at)}
                            </span>

                            {/* 操作按钮 */}
                            <div className="flex gap-1 shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    disabled={syncing === item.id}
                                    onClick={() => handleSync(item.id)}
                                  >
                                    {syncing === item.id
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <RefreshCw className="h-3 w-3" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>同步（数据库 → 磁盘）</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => item.skill && navigate(`/skills/${item.skill.id}`)}
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>查看 Skill 详情</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7 text-strawberry-400 hover:text-strawberry-600"
                                    disabled={deleting === item.id}
                                    onClick={() => handleDelete(item.id, item.deploy_path)}
                                  >
                                    {deleting === item.id
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Trash2 className="h-3 w-3" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>删除部署（同时删除磁盘文件）</TooltipContent>
                              </Tooltip>
                            </div>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>

                    {items.length === 0 && (
                      <p className="text-center text-cream-400 py-6 text-sm">此工具下暂无 Skill</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )
        })}
      </div>

      {/* ── 空状态 ── */}
      {projectDeployments.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <div className="text-5xl mb-4">📁</div>
          <h2 className="text-lg font-display font-bold text-cream-700 mb-1">这个项目还没有部署任何 Skill</h2>
          <p className="text-sm text-cream-400 mb-4">
            先"重新扫描"导入已有 Skill，或点击"部署 Skill"手动添加
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl"
              onClick={() => setDeployOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" /> 部署 Skill
            </Button>
            <Button variant="outline" onClick={handleScan} className="rounded-xl">
              <Scan className="h-4 w-4 mr-1" /> 重新扫描
            </Button>
          </div>
        </motion.div>
      )}

      {/* ── 部署 Skill 对话框 ── */}
      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5" /> 部署 Skill 到项目
            </DialogTitle>
            <DialogDescription>
              将技能库中的 Skill 部署到 <strong>{project.name}</strong> 的指定工具目录。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 选择工具 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-cream-700">目标工具</p>
              <Select value={deployTool} onValueChange={setDeployTool}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="选择工具" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_TOOLS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <ToolIcon tool={t.id} size={18} />
                        <span>{t.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 选择 Skill */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-cream-700">选择 Skill</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cream-400" />
                <Input
                  className="pl-8 rounded-xl text-sm"
                  placeholder="搜索技能库..."
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                />
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1 border border-cream-200 rounded-xl p-1.5">
                {filteredSkills.length === 0 ? (
                  <div className="flex items-center gap-2 justify-center py-6 text-sm text-cream-400">
                    <Info className="h-4 w-4" />
                    没有匹配的 Skill
                  </div>
                ) : (
                  filteredSkills.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setDeploySkillId(s.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                        deploySkillId === s.id
                          ? 'bg-peach-100 text-peach-700'
                          : 'hover:bg-cream-50 text-cream-700'
                      )}
                    >
                      <span className="font-medium flex-1 truncate">{s.name}</span>
                      <Badge variant="outline" className="text-xs text-cream-400 shrink-0">v{s.version}</Badge>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployOpen(false)}>取消</Button>
            <Button
              className="bg-peach-500 hover:bg-peach-600 text-white"
              disabled={!deploySkillId || !deployTool || deploying}
              onClick={handleDeploy}
            >
              {deploying
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />部署中...</>
                : <><UploadCloud className="h-4 w-4 mr-1" />确认部署</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
