import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Download, Package, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn, toolNames, sourceLabels } from '@/lib/utils'
import { useSkillStore } from '@/stores/useSkillStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { deploymentsApi } from '@/lib/tauri-api'
import { toast } from 'sonner'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type { ToolName } from '@/types'

const sourceFilters = ['全部', 'local', 'skills-sh', 'github', 'gitee']
const TOOLS: ToolName[] = ['windsurf', 'cursor', 'claude-code', 'codex', 'trae']

export default function SkillsStore() {
  const skills = useSkillStore((s) => s.skills)
  const deployments = useSkillStore((s) => s.deployments)
  const projects = useProjectStore((s) => s.projects)
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('全部')
  const [deploying, setDeploying] = useState<string | null>(null)
  const [deployDialog, setDeployDialog] = useState<{ skillId: string; skillName: string } | null>(null)
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTool, setSelectedTool] = useState<ToolName>('windsurf')

  const topSkills = [...skills]
    .map((s) => ({ ...s, deployCount: deployments.filter((d) => d.skill_id === s.id).length }))
    .sort((a, b) => b.deployCount - a.deployCount)
    .slice(0, 5)

  const filtered = skills.filter((s) => {
    const matchSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchSource = sourceFilter === '全部' || s.source === sourceFilter
    return matchSearch && matchSource
  })

  const getDeployCount = (skillId: string) => deployments.filter((d) => d.skill_id === skillId).length

  const handleDeployConfirm = async () => {
    if (!deployDialog || !selectedProject) return
    setDeploying(deployDialog.skillId)
    try {
      console.log(`[SkillsStore] 部署 ${deployDialog.skillName} -> project=${selectedProject}, tool=${selectedTool}`)
      const result = await deploymentsApi.deployToProject(deployDialog.skillId, selectedProject, selectedTool)
      console.log(`[SkillsStore] 部署完成: ${result.files_copied} 个文件`)
      await useSkillStore.getState().fetchDeployments()
      toast.success(`${deployDialog.skillName} 已部署到项目，共 ${result.files_copied} 个文件`)
      setDeployDialog(null)
    } catch (e) {
      console.error('[SkillsStore] 部署失败:', e)
      toast.error('部署失败: ' + String(e))
    } finally {
      setDeploying(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* 大搜索框 */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-display font-bold text-cream-800">Skill 库</h1>
        <p className="text-cream-500">浏览和部署本地 Skill 到项目</p>
        <div className="relative max-w-lg mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-cream-400" />
          <Input
            placeholder="搜索 Skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 rounded-full border-cream-300 shadow-card text-base"
          />
        </div>
      </div>

      {/* 高部署量排行 */}
      {!searchQuery && topSkills.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-bold text-cream-800 mb-4">� 部署最多的 Skill</h2>
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4">
              {topSkills.map((skill, i) => {
                const src = sourceLabels[skill.source]
                return (
                  <motion.div
                    key={skill.id}
                    className="store-card shrink-0 w-64"
                    whileHover={{ scale: 1.03, y: -4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <Card className="border border-cream-200 shadow-card hover:shadow-card-hover transition-shadow h-full">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="bg-peach-100 text-peach-700 text-xs">#{i + 1}</Badge>
                          <Badge variant="outline" className={cn('text-xs', src.bg, src.text)}>{src.label}</Badge>
                        </div>
                        <h3 className="font-semibold text-cream-800">{skill.name}</h3>
                        <p className="text-xs text-cream-500 line-clamp-2">{skill.description}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-cream-400">
                            <Package className="h-3 w-3 inline mr-1" />{skill.deployCount} 个部署
                          </span>
                          <Button size="sm" className="text-xs h-7 bg-peach-500 hover:bg-peach-600 text-white"
                            onClick={() => setDeployDialog({ skillId: skill.id, skillName: skill.name })}>
                            <FolderOpen className="h-3 w-3 mr-1" /> 部署
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* 来源筛选 */}
      <div className="flex gap-2 flex-wrap">
        {sourceFilters.map((f) => (
          <Button
            key={f}
            variant={sourceFilter === f ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'rounded-full text-xs',
              sourceFilter === f ? 'bg-peach-500 hover:bg-peach-600 text-white' : 'border-cream-300'
            )}
            onClick={() => setSourceFilter(f)}
          >
            {f === '全部' ? '全部' : (sourceLabels as Record<string, { label: string }>)[f]?.label ?? f}
          </Button>
        ))}
      </div>

      {/* Skill 列表网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((skill) => {
          const src = sourceLabels[skill.source]
          const depCount = getDeployCount(skill.id)
          return (
            <motion.div key={skill.id} className="category-card" whileHover={{ scale: 1.02 }}>
              <Card className="border border-cream-200 shadow-card hover:shadow-card-hover transition-shadow h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-cream-800">{skill.name}</h3>
                      <p className="text-xs text-cream-500 mt-1">{skill.description}</p>
                    </div>
                    {skill.version && (
                      <Badge variant="outline" className="bg-lavender-50 text-lavender-400 text-xs shrink-0">
                        v{skill.version}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={cn('text-xs', src?.bg, src?.text)}>{src?.label ?? skill.source}</Badge>
                      <span className="text-xs text-cream-400"><Package className="h-3 w-3 inline mr-1" />{depCount} 个部署</span>
                    </div>
                    <Button size="sm" className="text-xs h-7 bg-peach-500 hover:bg-peach-600 text-white"
                      onClick={() => setDeployDialog({ skillId: skill.id, skillName: skill.name })}
                      disabled={deploying === skill.id}>
                      <Download className="h-3 w-3 mr-1" /> {deploying === skill.id ? '部署中...' : '部署到项目'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-lg font-display font-bold text-cream-700 mb-2">没有找到匹配的 Skill</h2>
          <p className="text-cream-500">试试其他关键词或来源筛选</p>
        </div>
      )}

      {/* 部署对话框 */}
      <Dialog open={!!deployDialog} onOpenChange={() => setDeployDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>部署 {deployDialog?.skillName} 到项目</DialogTitle>
            <DialogDescription>选择目标项目和工具，将 Skill 文件复制到项目目录中。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-cream-700">目标项目</label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="border-cream-300"><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} <span className="text-cream-400 text-xs ml-2">{p.path}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-cream-700">目标工具</label>
              <Select value={selectedTool} onValueChange={(v) => setSelectedTool(v as ToolName)}>
                <SelectTrigger className="border-cream-300"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TOOLS.map((t) => (
                    <SelectItem key={t} value={t}>{toolNames[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployDialog(null)}>取消</Button>
            <Button
              className="bg-peach-500 hover:bg-peach-600 text-white"
              disabled={!selectedProject || deploying === deployDialog?.skillId}
              onClick={handleDeployConfirm}
            >
              {deploying ? '部署中...' : '确认部署'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
