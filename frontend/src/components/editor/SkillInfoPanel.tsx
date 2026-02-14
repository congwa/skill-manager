import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FolderOpen, Tag, FileText, MapPin } from 'lucide-react'

interface SkillInfo {
  id: string
  name: string
  description: string | null
  version: string | null
  local_path: string | null
  deploymentCount: number
}

interface SkillInfoPanelProps {
  skill: SkillInfo | null
}

export default function SkillInfoPanel({ skill }: SkillInfoPanelProps) {
  if (!skill) {
    return (
      <div className="p-3 text-xs text-cream-500 text-center">
        选择一个 Skill 查看详情
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2.5 text-xs">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-3.5 w-3.5 text-peach-500 shrink-0" />
        <span className="font-semibold text-cream-800 text-sm truncate">{skill.name}</span>
      </div>

      {skill.description && (
        <p className="text-cream-500 line-clamp-3 leading-relaxed">{skill.description}</p>
      )}

      <div className="space-y-1.5">
        {skill.version && (
          <div className="flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-cream-400" />
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{skill.version}</Badge>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-cream-400" />
          <span className="text-cream-500">{skill.deploymentCount} 个部署</span>
        </div>

        {skill.local_path && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-help">
                <FileText className="h-3 w-3 text-cream-400 shrink-0" />
                <span className="text-cream-400 truncate">{skill.local_path}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{skill.local_path}</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
