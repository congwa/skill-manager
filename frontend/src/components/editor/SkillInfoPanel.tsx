import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  FolderOpen, FileText, MapPin, Trash2, Plus, Globe, FolderClosed, Loader2,
} from 'lucide-react'
import { deploymentsApi } from '@/lib/tauri-api'
import type { SkillDeployment } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ProjectInfo {
  id: string
  name: string
  path: string
}

interface SkillInfo {
  id: string
  name: string
  description: string | null
  version: string | null
  local_path: string | null
}

interface SkillInfoPanelProps {
  skill: SkillInfo | null
  deployments: SkillDeployment[]
  projects: ProjectInfo[]
  onDeploymentChanged?: () => void
}

const TOOLS = ['windsurf', 'cursor', 'claude-code', 'codex', 'trae']
const toolLabels: Record<string, string> = {
  windsurf: 'Windsurf',
  cursor: 'Cursor',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  trae: 'Trae',
}

export default function SkillInfoPanel({ skill, deployments: allDeployments, projects, onDeploymentChanged }: SkillInfoPanelProps) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [deployTool, setDeployTool] = useState<string>('')
  const [deployTarget, setDeployTarget] = useState<string>('') // 'global' or project_id
  const [showDeployForm, setShowDeployForm] = useState(false)

  if (!skill) {
    return (
      <div className="p-3 text-xs text-cream-500 text-center">
        选择一个 Skill 查看详情
      </div>
    )
  }

  const skillDeployments = allDeployments.filter((d) => d.skill_id === skill.id)

  const handleDelete = async (deploymentId: string) => {
    setDeleting(deploymentId)
    try {
      await deploymentsApi.delete(deploymentId)
      toast.success('部署已删除')
      onDeploymentChanged?.()
    } catch (err) {
      toast.error('删除失败: ' + String(err))
    } finally {
      setDeleting(null)
    }
  }

  const handleDeploy = async () => {
    if (!deployTool || !deployTarget) return
    setDeploying(true)
    try {
      if (deployTarget === 'global') {
        const result = await deploymentsApi.deployGlobal(skill.id, deployTool)
        if (result.conflict?.status === 'exists_different') {
          toast.warning('目标已存在且内容不同，请使用强制覆盖')
        } else {
          toast.success(`已全局部署到 ${toolLabels[deployTool]}`)
        }
      } else {
        const result = await deploymentsApi.deployToProject(skill.id, deployTarget, deployTool)
        if (result.conflict?.status === 'exists_different') {
          toast.warning('目标已存在且内容不同，请使用强制覆盖')
        } else {
          const proj = projects.find((p) => p.id === deployTarget)
          toast.success(`已部署到 ${proj?.name ?? '项目'} (${toolLabels[deployTool]})`)
        }
      }
      onDeploymentChanged?.()
      setShowDeployForm(false)
      setDeployTool('')
      setDeployTarget('')
    } catch (err) {
      toast.error('部署失败: ' + String(err))
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="p-3 space-y-2.5 text-xs overflow-y-auto">
      {/* 基本信息 */}
      <div className="flex items-center gap-2">
        <FolderOpen className="h-3.5 w-3.5 text-peach-500 shrink-0" />
        <span className="font-semibold text-cream-800 text-sm truncate">{skill.name}</span>
        {skill.version && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">v{skill.version}</Badge>
        )}
      </div>

      {skill.description && (
        <p className="text-cream-500 line-clamp-2 leading-relaxed">{skill.description}</p>
      )}

      {skill.local_path && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-help">
              <FileText className="h-3 w-3 text-cream-400 shrink-0" />
              <span className="text-cream-400 truncate text-[10px]">{skill.local_path}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right"><p className="text-xs">{skill.local_path}</p></TooltipContent>
        </Tooltip>
      )}

      {/* 部署列表 */}
      <div className="pt-1.5 border-t border-cream-200">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-cream-400" />
            <span className="text-cream-600 font-medium">部署 ({skillDeployments.length})</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-peach-500 hover:text-peach-600"
            onClick={() => setShowDeployForm(!showDeployForm)}
          >
            <Plus className="h-3 w-3 mr-0.5" /> 部署
          </Button>
        </div>

        {skillDeployments.length === 0 ? (
          <p className="text-cream-400 text-[10px] pl-4">暂无部署</p>
        ) : (
          <div className="space-y-1">
            {skillDeployments.map((dep) => {
              const project = projects.find((p) => p.id === dep.project_id)
              const isGlobal = !dep.project_id
              return (
                <div
                  key={dep.id}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-cream-50 hover:bg-cream-100 transition-colors group"
                >
                  {isGlobal
                    ? <Globe className="h-3 w-3 text-lavender-400 shrink-0" />
                    : <FolderClosed className="h-3 w-3 text-sky-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-cream-700 truncate text-[10px]">
                        {isGlobal ? '全局' : (project?.name ?? '未知项目')}
                      </span>
                      <Badge variant="outline" className={cn(
                        'text-[9px] px-1 py-0 shrink-0',
                        dep.status === 'synced' ? 'bg-mint-50 text-mint-500' :
                        dep.status === 'diverged' ? 'bg-honey-50 text-honey-500' :
                        'bg-cream-100 text-cream-500'
                      )}>
                        {dep.tool_name}
                      </Badge>
                    </div>
                  </div>
                  <button
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-strawberry-100 transition-all shrink-0"
                    onClick={() => handleDelete(dep.id)}
                    disabled={deleting === dep.id}
                  >
                    {deleting === dep.id
                      ? <Loader2 className="h-3 w-3 animate-spin text-cream-400" />
                      : <Trash2 className="h-3 w-3 text-strawberry-400" />
                    }
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 部署表单 */}
      {showDeployForm && (
        <div className="pt-1.5 border-t border-cream-200 space-y-2">
          <p className="text-cream-600 font-medium text-[10px]">新建部署</p>

          <Select value={deployTool} onValueChange={setDeployTool}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="选择工具" /></SelectTrigger>
            <SelectContent>
              {TOOLS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{toolLabels[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={deployTarget} onValueChange={setDeployTarget}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="选择目标" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global" className="text-xs">
                <div className="flex items-center gap-1">
                  <Globe className="h-3 w-3" /> 全局
                </div>
              </SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  <div className="flex items-center gap-1">
                    <FolderClosed className="h-3 w-3" /> {p.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-6 text-[10px] flex-1 bg-peach-500 hover:bg-peach-600 text-white"
              disabled={!deployTool || !deployTarget || deploying}
              onClick={handleDeploy}
            >
              {deploying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-0.5" />}
              部署
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={() => { setShowDeployForm(false); setDeployTool(''); setDeployTarget('') }}
            >
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
