import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Check, AlertTriangle, FileText, FilePlus, FileMinus,
  ChevronDown, ArrowLeft, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { skillsApi } from '@/lib/tauri-api'
import type { MergeResultData, MergeFileResultData, MergeResolutionData } from '@/lib/tauri-api'

interface MergeEditorProps {
  mergeResult: MergeResultData
  targetPath: string
  onComplete: () => void
  onCancel: () => void
}

const statusConfig: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  auto_merged: { icon: Check, label: '自动合并', color: 'text-mint-500 bg-mint-50' },
  conflict: { icon: AlertTriangle, label: '冲突', color: 'text-strawberry-500 bg-strawberry-50' },
  added_left: { icon: FilePlus, label: '本地新增', color: 'text-mint-500 bg-mint-50' },
  added_right: { icon: FilePlus, label: '部署新增', color: 'text-sky-500 bg-sky-50' },
  deleted_left: { icon: FileMinus, label: '本地删除', color: 'text-honey-500 bg-honey-50' },
  deleted_right: { icon: FileMinus, label: '部署删除', color: 'text-honey-500 bg-honey-50' },
  unchanged: { icon: Check, label: '无变化', color: 'text-cream-400 bg-cream-50' },
}

interface FileResolution {
  path: string
  choice: 'left' | 'right' | 'merged' | 'auto'
  content: string
}

function ConflictFileEditor({
  file,
  resolution,
  onResolve,
}: {
  file: MergeFileResultData
  resolution: FileResolution | undefined
  onResolve: (r: FileResolution) => void
}) {
  const [expanded, setExpanded] = useState(file.status === 'conflict')
  const [editContent, setEditContent] = useState(file.merged_content ?? '')
  const config = statusConfig[file.status] ?? statusConfig.unchanged
  const Icon = config.icon
  const isConflict = file.status === 'conflict'
  const isDeleteConflict = file.status === 'deleted_left' || file.status === 'deleted_right'
  const needsResolution = isConflict || isDeleteConflict
  const isResolved = !!resolution

  return (
    <Card className={cn('border', isConflict ? 'border-strawberry-200' : isDeleteConflict ? 'border-honey-200' : 'border-cream-200')}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-cream-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon className={cn('h-4 w-4', config.color.split(' ')[0])} />
        <span className="font-mono text-sm text-cream-800 flex-1">{file.path}</span>
        <Badge variant="outline" className={cn('text-[10px]', config.color)}>{config.label}</Badge>
        {isResolved && <Badge variant="outline" className="text-[10px] bg-mint-50 text-mint-500">已解决</Badge>}
        {needsResolution && (
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-cream-400" />
          </motion.div>
        )}
      </div>

      {expanded && needsResolution && (
        <div className="border-t border-cream-200 p-4 space-y-3">
          {isConflict && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-cream-600 mb-1">本地版本 (LOCAL)</p>
                  <pre className="text-xs bg-mint-50/50 p-3 rounded-lg border border-mint-200 max-h-40 overflow-auto whitespace-pre-wrap">
                    {file.left_content}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-cream-600 mb-1">部署版本 (DEPLOYMENT)</p>
                  <pre className="text-xs bg-sky-50/50 p-3 rounded-lg border border-sky-200 max-h-40 overflow-auto whitespace-pre-wrap">
                    {file.right_content}
                  </pre>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  className={cn('text-xs', resolution?.choice === 'left' && 'bg-mint-100 border-mint-300')}
                  onClick={() => onResolve({ path: file.path, choice: 'left', content: file.left_content ?? '' })}
                >
                  <ArrowLeft className="h-3 w-3 mr-1" /> 使用本地
                </Button>
                <Button
                  size="sm" variant="outline"
                  className={cn('text-xs', resolution?.choice === 'right' && 'bg-sky-100 border-sky-300')}
                  onClick={() => onResolve({ path: file.path, choice: 'right', content: file.right_content ?? '' })}
                >
                  <ArrowRight className="h-3 w-3 mr-1" /> 使用部署
                </Button>
                <Button
                  size="sm" variant="outline"
                  className={cn('text-xs', resolution?.choice === 'merged' && 'bg-lavender-100 border-lavender-300')}
                  onClick={() => onResolve({ path: file.path, choice: 'merged', content: editContent })}
                >
                  手动编辑
                </Button>
              </div>
              {resolution?.choice === 'merged' && (
                <Textarea
                  className="font-mono text-xs min-h-[120px]"
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value)
                    onResolve({ path: file.path, choice: 'merged', content: e.target.value })
                  }}
                />
              )}
            </>
          )}

          {isDeleteConflict && (
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline"
                className={cn('text-xs', resolution?.choice === 'left' && 'bg-mint-100 border-mint-300')}
                onClick={() => onResolve({ path: file.path, choice: 'left', content: file.left_content ?? file.merged_content ?? '' })}
              >
                保留文件
              </Button>
              <Button
                size="sm" variant="outline"
                className={cn('text-xs', resolution?.choice === 'right' && 'bg-strawberry-100 border-strawberry-300')}
                onClick={() => onResolve({ path: file.path, choice: 'right', content: '' })}
              >
                删除文件
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default function MergeEditor({ mergeResult, targetPath, onComplete, onCancel }: MergeEditorProps) {
  const [resolutions, setResolutions] = useState<Map<string, FileResolution>>(new Map())
  const [applying, setApplying] = useState(false)

  const conflictFiles = mergeResult.files.filter((f) =>
    f.status === 'conflict' || f.status === 'deleted_left' || f.status === 'deleted_right'
  )
  const autoFiles = mergeResult.files.filter((f) =>
    f.status === 'auto_merged' || f.status === 'added_left' || f.status === 'added_right' || f.status === 'unchanged'
  )

  const allConflictsResolved = conflictFiles.every((f) => resolutions.has(f.path))

  const handleResolve = (r: FileResolution) => {
    setResolutions((prev) => {
      const next = new Map(prev)
      next.set(r.path, r)
      return next
    })
  }

  const handleApply = async () => {
    if (!allConflictsResolved) {
      toast.error('请先解决所有冲突')
      return
    }

    setApplying(true)
    try {
      const allResolutions: MergeResolutionData[] = []

      // Auto-merged files
      for (const file of autoFiles) {
        if (file.merged_content != null) {
          allResolutions.push({ path: file.path, content: file.merged_content })
        }
      }

      // Manually resolved files
      for (const file of conflictFiles) {
        const r = resolutions.get(file.path)
        if (r && r.content !== '') {
          allResolutions.push({ path: file.path, content: r.content })
        }
      }

      await skillsApi.applyMerge(targetPath, allResolutions)
      toast.success(`合并完成: ${allResolutions.length} 个文件已写入`)
      onComplete()
    } catch (e) {
      toast.error('应用合并失败: ' + String(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="bg-mint-50 text-mint-500">
          <Check className="h-3 w-3 mr-1" /> {mergeResult.auto_merged_count} 自动合并
        </Badge>
        {mergeResult.conflict_count > 0 && (
          <Badge variant="outline" className="bg-strawberry-50 text-strawberry-500">
            <AlertTriangle className="h-3 w-3 mr-1" /> {mergeResult.conflict_count} 冲突
          </Badge>
        )}
        <span className="text-xs text-cream-400 ml-auto">
          已解决 {resolutions.size}/{conflictFiles.length} 个冲突
        </span>
      </div>

      {/* Conflict files */}
      {conflictFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-cream-700">需要手动解决的冲突</p>
          {conflictFiles.map((file) => (
            <ConflictFileEditor
              key={file.path}
              file={file}
              resolution={resolutions.get(file.path)}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}

      {/* Auto-merged files */}
      {autoFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-cream-700">自动合并的文件</p>
          {autoFiles.map((file) => {
            const config = statusConfig[file.status] ?? statusConfig.unchanged
            const Icon = config.icon
            return (
              <div key={file.path} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-cream-50/50">
                <Icon className={cn('h-3.5 w-3.5', config.color.split(' ')[0])} />
                <span className="font-mono text-xs text-cream-700">{file.path}</span>
                <Badge variant="outline" className={cn('text-[10px] ml-auto', config.color)}>{config.label}</Badge>
              </div>
            )
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-cream-200">
        <Button variant="ghost" onClick={onCancel}>取消</Button>
        <Button
          onClick={handleApply}
          disabled={!allConflictsResolved || applying}
          className="bg-peach-500 hover:bg-peach-600 text-white"
        >
          {applying ? '应用中...' : `应用合并 (${mergeResult.total_files} 个文件)`}
        </Button>
      </div>
    </div>
  )
}
