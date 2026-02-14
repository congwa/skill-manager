import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EditorStatusBarProps {
  fileName: string | null
  language: string
  line: number
  col: number
  isDirty: boolean
  onSave: () => void
}

function getLanguageLabel(fileName: string | null): string {
  if (!fileName) return ''
  const ext = fileName.split('.').pop()?.toLowerCase()
  const labels: Record<string, string> = {
    md: 'Markdown',
    json: 'JSON',
    js: 'JavaScript',
    jsx: 'JavaScript (JSX)',
    ts: 'TypeScript',
    tsx: 'TypeScript (TSX)',
    sh: 'Shell',
    yaml: 'YAML',
    yml: 'YAML',
    txt: 'Plain Text',
  }
  return labels[ext || ''] || 'Plain Text'
}

export default function EditorStatusBar({ fileName, line, col, isDirty, onSave }: EditorStatusBarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1 bg-[#1e1e2e] border-t border-[#2a2a3a] text-[11px] text-cream-500 shrink-0">
      <div className="flex items-center gap-4">
        <span>{getLanguageLabel(fileName)}</span>
        <span>UTF-8</span>
        {fileName && <span>Ln {line}, Col {col}</span>}
      </div>
      <div className="flex items-center gap-2">
        {isDirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-2 text-[11px] text-peach-400 hover:text-peach-300 hover:bg-[#2a2a3a]"
            onClick={onSave}
          >
            <Save className="h-3 w-3 mr-1" /> 保存 (⌘S)
          </Button>
        )}
      </div>
    </div>
  )
}
