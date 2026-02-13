import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, ChevronDown, Edit, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useSkillStore } from '@/stores/useSkillStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { cn, toolColors, toolNames, sourceLabels } from '@/lib/utils'
import type { ToolName } from '@/types'

export default function SkillList() {
  const { skills, deployments } = useSkillStore()
  const projects = useProjectStore((s) => s.projects)
  const navigate = useNavigate()
  const [tab, setTab] = useState('tool')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const toggleGroup = (key: string) => setOpenGroups((p) => ({ ...p, [key]: p[key] === undefined ? false : !p[key] }))

  const filtered = skills.filter((s) =>
    (!searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  ).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'modified') return new Date(b.last_modified_at).getTime() - new Date(a.last_modified_at).getTime()
    return deployments.filter((d) => d.skill_id === b.id).length - deployments.filter((d) => d.skill_id === a.id).length
  })

  const tools: ToolName[] = ['windsurf', 'cursor', 'claude-code', 'codex', 'trae']

  const renderSkillRow = (skill: typeof skills[0], i: number) => {
    const skillDeps = deployments.filter((d) => d.skill_id === skill.id)
    const src = sourceLabels[skill.source]
    return (
      <motion.div
        key={skill.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
        className="flex items-center gap-4 px-5 py-3 hover:bg-peach-50/50 transition-colors border-b border-cream-100 last:border-b-0 cursor-pointer"
        onClick={() => navigate(`/skills/${skill.id}`)}
      >
        <h3 className="font-semibold text-cream-800 min-w-[180px] hover:text-peach-600">{skill.name}</h3>
        <p className="text-xs text-cream-500 flex-1 truncate">{skill.description}</p>
        <Badge variant="outline" className="bg-lavender-50 text-lavender-400 text-xs">v{skill.version}</Badge>
        <Badge variant="outline" className={cn('text-xs', src.bg, src.text)}>{src.label}</Badge>
        <span className="text-xs text-cream-400">{skillDeps.length} 部署</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); navigate(`/skills/${skill.id}`) }}>
            <Eye className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); navigate(`/skills/${skill.id}/edit`) }}>
            <Edit className="h-3 w-3" />
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display font-bold text-cream-800">Skills</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-cream-100">
          <TabsTrigger value="tool">按工具</TabsTrigger>
          <TabsTrigger value="project">按项目</TabsTrigger>
          <TabsTrigger value="all">全局汇总</TabsTrigger>
          <TabsTrigger value="global">仅全局</TabsTrigger>
        </TabsList>

        {/* 通用操作栏 */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-400" />
            <Input placeholder="搜索 Skill..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-full border-cream-300" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 rounded-lg border-cream-300"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="synced">已同步</SelectItem>
              <SelectItem value="diverged">已偏离</SelectItem>
              <SelectItem value="missing">文件丢失</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32 rounded-lg border-cream-300"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">名称</SelectItem>
              <SelectItem value="modified">最近修改</SelectItem>
              <SelectItem value="deploys">部署数量</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4">
          {/* 按工具分组 */}
          <TabsContent value="tool" className="space-y-4">
            {tools.map((tool) => {
              const toolDeps = deployments.filter((d) => d.tool_name === tool)
              const toolSkills = filtered.filter((s) => toolDeps.some((d) => d.skill_id === s.id))
              if (toolSkills.length === 0) return null
              const isOpen = openGroups[tool] !== false
              return (
                <Collapsible key={tool} open={isOpen} onOpenChange={() => toggleGroup(tool)} className="skill-group">
                  <Card className="border border-cream-200">
                    <CollapsibleTrigger asChild>
                      <CardContent className="flex items-center justify-between p-4 cursor-pointer hover:bg-cream-50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: toolColors[tool] }}>
                            {toolNames[tool][0]}
                          </div>
                          <h2 className="font-display font-semibold">{toolNames[tool]}</h2>
                          <Badge variant="secondary" className="bg-peach-100 text-peach-700 text-xs">{toolSkills.length}</Badge>
                        </div>
                        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}><ChevronDown className="h-4 w-4 text-cream-400" /></motion.div>
                      </CardContent>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-cream-200">
                        {toolSkills.map((skill, i) => renderSkillRow(skill, i))}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )
            })}
          </TabsContent>

          {/* 按项目分组 */}
          <TabsContent value="project" className="space-y-4">
            {projects.map((project) => {
              const projDeps = deployments.filter((d) => d.project_id === project.id)
              const projSkills = filtered.filter((s) => projDeps.some((d) => d.skill_id === s.id))
              if (projSkills.length === 0) return null
              const isOpen = openGroups[project.id] !== false
              return (
                <Collapsible key={project.id} open={isOpen} onOpenChange={() => toggleGroup(project.id)} className="skill-group">
                  <Card className="border border-cream-200">
                    <CollapsibleTrigger asChild>
                      <CardContent className="flex items-center justify-between p-4 cursor-pointer hover:bg-cream-50">
                        <div className="flex items-center gap-3">
                          <h2 className="font-display font-semibold">{project.name}</h2>
                          <Badge variant="secondary" className="bg-peach-100 text-peach-700 text-xs">{projSkills.length}</Badge>
                        </div>
                        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}><ChevronDown className="h-4 w-4 text-cream-400" /></motion.div>
                      </CardContent>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-cream-200">
                        {projSkills.map((skill, i) => renderSkillRow(skill, i))}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )
            })}
          </TabsContent>

          {/* 全局汇总 */}
          <TabsContent value="all">
            <Card className="border border-cream-200">
              <div>
                {filtered.map((skill, i) => renderSkillRow(skill, i))}
              </div>
            </Card>
          </TabsContent>

          {/* 仅全局部署 */}
          <TabsContent value="global">
            <Card className="border border-cream-200">
              <div>
                {filtered.filter((s) => deployments.some((d) => d.skill_id === s.id && d.project_id === null))
                  .map((skill, i) => renderSkillRow(skill, i))}
              </div>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
