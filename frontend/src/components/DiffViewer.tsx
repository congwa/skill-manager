import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Plus, Minus, FileText, FilePlus, FileMinus, FileEdit, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SkillDiffResult, FileDiffItem } from '@/lib/tauri-api'

interface DiffViewerProps {
  diff: SkillDiffResult
}

const statusConfig: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  added: { icon: FilePlus, label: '新增', color: 'text-mint-500 bg-mint-50' },
  removed: { icon: FileMinus, label: '删除', color: 'text-strawberry-500 bg-strawberry-50' },
  modified: { icon: FileEdit, label: '修改', color: 'text-honey-500 bg-honey-50' },
}

function DiffFileCard({ file }: { file: FileDiffItem }) {
  const [expanded, setExpanded] = useState(file.status === 'modified')
  const config = statusConfig[file.status]
  const Icon = config?.icon ?? FileText

  return (
    <Card className={cn('border', config?.color.includes('mint') ? 'border-mint-200' : config?.color.includes('strawberry') ? 'border-strawberry-200' : 'border-honey-200')}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-cream-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon className={cn('h-4 w-4', config?.color.split(' ')[0])} />
        <span className="font-mono text-sm text-cream-800 flex-1">{file.path}</span>
        <Badge variant="outline" className={cn('text-[10px]', config?.color)}>{config?.label}</Badge>
        {file.hunks.length > 0 && (
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-cream-400" />
          </motion.div>
        )}
      </div>
      <AnimatePresence>
        {expanded && file.hunks.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-cream-200 bg-cream-50/50 p-0 overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {file.hunks.map((hunk, hi) => (
                    <tr key={`hunk-header-${hi}`}>
                      <td colSpan={3} className="px-3 py-1 bg-lavender-50 text-lavender-500 text-[10px]">
                        @@ -{hunk.old_start},{hunk.old_count} +{hunk.new_start},{hunk.new_count} @@
                      </td>
                    </tr>
                  ))}
                  {file.hunks.flatMap((hunk, hi) =>
                    hunk.lines.map((line, li) => {
                      const bgColor = line.tag === '+' ? 'bg-mint-50/70' : line.tag === '-' ? 'bg-strawberry-50/70' : ''
                      const textColor = line.tag === '+' ? 'text-mint-600' : line.tag === '-' ? 'text-strawberry-600' : 'text-cream-600'
                      return (
                        <tr key={`${hi}-${li}`} className={bgColor}>
                          <td className="w-5 px-1 text-right select-none text-cream-400">
                            {line.tag === '+' ? <Plus className="h-3 w-3 inline text-mint-400" /> : line.tag === '-' ? <Minus className="h-3 w-3 inline text-strawberry-400" /> : null}
                          </td>
                          <td className={cn('px-3 py-0.5 whitespace-pre', textColor)}>
                            {line.content}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  const { summary, files } = diff

  const skillMdStatus = useMemo(() => {
    const skillMd = files.find((f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'))
    if (!skillMd) return 'missing'
    return skillMd.status // 'modified' | 'added' | 'removed' | 'unchanged'
  }, [files])

  const hasOnlySupportingChanges = skillMdStatus === 'unchanged' && (summary.added + summary.removed + summary.modified) > 0

  return (
    <div className="space-y-3">
      {/* 智能提示 */}
      {hasOnlySupportingChanges && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-sky-50 border border-sky-200 text-sm">
          <Info className="h-4 w-4 text-sky-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sky-700">主指令文件 SKILL.md 无变化</p>
            <p className="text-sky-600 text-xs mt-0.5">差异仅在支撑文件（脚本、参考文档、资源等），Skill 核心行为未改变</p>
          </div>
        </div>
      )}
      {skillMdStatus === 'modified' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-honey-50 border border-honey-200 text-sm">
          <Info className="h-4 w-4 text-honey-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-honey-700">主指令文件 SKILL.md 已修改</p>
            <p className="text-honey-600 text-xs mt-0.5">Skill 核心行为可能已改变，建议仔细检查差异</p>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="flex gap-3 text-sm">
        {summary.added > 0 && <Badge variant="outline" className="bg-mint-50 text-mint-500"><Plus className="h-3 w-3 mr-1" />{summary.added} 新增</Badge>}
        {summary.removed > 0 && <Badge variant="outline" className="bg-strawberry-50 text-strawberry-500"><Minus className="h-3 w-3 mr-1" />{summary.removed} 删除</Badge>}
        {summary.modified > 0 && <Badge variant="outline" className="bg-honey-50 text-honey-500"><FileEdit className="h-3 w-3 mr-1" />{summary.modified} 修改</Badge>}
        {summary.unchanged > 0 && <span className="text-cream-400 text-xs self-center">{summary.unchanged} 文件无变化</span>}
      </div>

      {/* File list */}
      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file) => (
            <DiffFileCard key={file.path} file={file} />
          ))}
        </div>
      ) : (
        <CardContent className="text-center py-8 text-cream-400 text-sm">
          两个版本完全一致，没有差异
        </CardContent>
      )}
    </div>
  )
}
