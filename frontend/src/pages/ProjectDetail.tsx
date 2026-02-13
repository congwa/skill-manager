import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Scan, Plus, ShieldCheck, ChevronDown,
  RefreshCw, Eye, Trash2, Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSkillStore } from '@/stores/useSkillStore'
import { cn, toolColors, toolNames, statusColors, relativeTime } from '@/lib/utils'
import type { ToolName } from '@/types'
import { toast } from 'sonner'
import { deploymentsApi } from '@/lib/tauri-api'

export default function ProjectDetail() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  const { skills, deployments } = useSkillStore()
  const [openTools, setOpenTools] = useState<Record<string, boolean>>({})
  const [scanning, setScanning] = useState(false)

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-cream-500">项目不存在</p>
        <Button variant="ghost" onClick={() => navigate('/projects')} className="mt-4">返回项目列表</Button>
      </div>
    )
  }

  const projectDeployments = deployments.filter((d) => d.project_id === projectId)
  const toolGroups = project.detected_tools.reduce((acc, tool) => {
    acc[tool] = projectDeployments.filter((d) => d.tool_name === tool).map((d) => ({
      ...d,
      skill: skills.find((s) => s.id === d.skill_id),
    }))
    return acc
  }, {} as Record<ToolName, Array<typeof projectDeployments[0] & { skill: typeof skills[0] | undefined }>>)

  const toggleTool = (tool: string) => setOpenTools((prev) => ({ ...prev, [tool]: !prev[tool] }))

  const handleScan = async () => {
    setScanning(true)
    try {
      await useProjectStore.getState().scanProject(projectId!)
      await useSkillStore.getState().fetchDeployments()
      toast.success('扫描完成')
    } catch (e) {
      console.error('scan error:', e)
      toast.error('扫描失败')
    } finally {
      setScanning(false)
    }
  }

  const handleConsistencyCheck = async () => {
    try {
      toast.loading('正在检查一致性...')
      console.log('[ProjectDetail] 开始一致性检查...')
      const report = await deploymentsApi.checkConsistency()
      console.log('[ProjectDetail] 一致性检查结果:', JSON.stringify(report, null, 2))
      await useSkillStore.getState().fetchDeployments()
      const projectDetails = report.details.filter((d) =>
        projectDeployments.some((pd) => pd.id === d.deployment_id)
      )
      const projectDiverged = projectDetails.filter((d) => d.status !== 'synced')
      if (projectDiverged.length === 0) {
        toast.success(`所有 Skill 状态正常 ✓ (${projectDetails.length} 个部署已检查)`)
      } else {
        toast.warning(`发现 ${projectDiverged.length} 个偏离部署 (共 ${projectDetails.length} 个)`)
      }
    } catch (e) {
      console.error('[ProjectDetail] consistency check error:', e)
      toast.error('检查失败')
    }
  }

  return (
    <div className="space-y-6">
      {/* 顶部 */}
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
              <p className="text-sm text-cream-500 cursor-pointer hover:text-cream-700 flex items-center gap-1"
                onClick={() => { navigator.clipboard.writeText(project.path); toast.success('路径已复制') }}>
                {project.path} <Copy className="h-3 w-3" />
              </p>
            </TooltipTrigger>
            <TooltipContent>点击复制路径</TooltipContent>
          </Tooltip>
          <p className="text-xs text-cream-400">最后扫描：{relativeTime(project.last_scanned_at)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleScan} disabled={scanning} className="rounded-xl">
            <Scan className="h-4 w-4 mr-1" /> {scanning ? '扫描中...' : '重新扫描'}
          </Button>
          <Button className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
            <Plus className="h-4 w-4 mr-1" /> 部署 Skill
          </Button>
          <Button variant="ghost" onClick={handleConsistencyCheck} className="rounded-xl">
            <ShieldCheck className="h-4 w-4 mr-1" /> 一致性检查
          </Button>
        </div>
      </div>

      {/* 工具分组区 */}
      <div className="space-y-4">
        {Object.entries(toolGroups).map(([tool, items]) => {
          const isOpen = openTools[tool] !== false
          const syncedCount = items.filter((i) => i.status === 'synced').length
          const divergedCount = items.filter((i) => i.status === 'diverged').length

          return (
            <Collapsible key={tool} open={isOpen} onOpenChange={() => toggleTool(tool)} className="tool-group">
              <Card className="border border-cream-200">
                <CollapsibleTrigger asChild>
                  <CardContent className="flex items-center justify-between p-4 cursor-pointer hover:bg-cream-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: toolColors[tool as ToolName] }}>
                        {toolNames[tool as ToolName][0]}
                      </div>
                      <h2 className="font-display font-semibold text-cream-800">{toolNames[tool as ToolName]}</h2>
                      <Badge variant="secondary" className="bg-peach-100 text-peach-700 text-xs">{items.length} Skills</Badge>
                      <span className="text-xs text-cream-500">
                        {syncedCount > 0 && <span className="text-mint-500">{syncedCount} synced</span>}
                        {divergedCount > 0 && <span className="text-honey-500 ml-2">{divergedCount} diverged</span>}
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
                        const stat = statusColors[item.status]
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                            className="flex items-center gap-4 px-5 py-3 hover:bg-peach-50/50 transition-colors border-b border-cream-100 last:border-b-0"
                          >
                            <h3 className="font-semibold text-cream-800 min-w-[160px] cursor-pointer hover:text-peach-600"
                              onClick={() => item.skill && navigate(`/skills/${item.skill.id}`)}>
                              {item.skill?.name || 'Unknown'}
                            </h3>
                            <Badge variant="outline" className="bg-lavender-50 text-lavender-400 text-xs">
                              v{item.skill?.version || '?'}
                            </Badge>
                            <Badge variant="outline" className={cn('text-xs', stat.bg, stat.text)}>{stat.label}</Badge>
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="text-xs text-cream-400 truncate max-w-[200px] block">{item.deploy_path}</span>
                              </TooltipTrigger>
                              <TooltipContent><p className="text-xs">{item.deploy_path}</p></TooltipContent>
                            </Tooltip>
                            <span className="text-xs text-cream-400 ml-auto">{relativeTime(item.last_synced_at)}</span>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7"><RefreshCw className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-strawberry-400"><Trash2 className="h-3 w-3" /></Button>
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

      {/* 空状态 */}
      {projectDeployments.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <div className="text-5xl mb-4">📁</div>
          <h2 className="text-lg font-display font-bold text-cream-700 mb-2">这个项目还没有 Skill 呢～</h2>
          <div className="flex gap-2 justify-center mt-4">
            <Button className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> 部署 Skill
            </Button>
            <Button variant="ghost" onClick={handleScan}>重新扫描</Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
