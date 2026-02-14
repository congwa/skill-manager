import { X, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EditorTab {
  id: string
  fileName: string
  filePath: string
  isDirty: boolean
}

interface EditorTabsProps {
  tabs: EditorTab[]
  activeTabId: string | null
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const colors: Record<string, string> = {
    md: 'text-sky-400',
    json: 'text-honey-500',
    js: 'text-yellow-400',
    ts: 'text-blue-400',
    jsx: 'text-yellow-400',
    tsx: 'text-blue-400',
    sh: 'text-mint-500',
  }
  return colors[ext || ''] || 'text-cream-400'
}

export default function EditorTabs({ tabs, activeTabId, onSelect, onClose }: EditorTabsProps) {
  if (tabs.length === 0) return null

  return (
    <div className="flex items-center bg-[#1e1e2e] border-b border-[#2a2a3a] overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-[#2a2a3a] select-none group min-w-0',
              isActive
                ? 'bg-[#282840] text-cream-200 border-t-2 border-t-peach-500'
                : 'bg-[#1e1e2e] text-cream-500 hover:bg-[#252535] border-t-2 border-t-transparent'
            )}
            onClick={() => onSelect(tab.id)}
          >
            <FileText className={cn('h-3.5 w-3.5 shrink-0', getFileIcon(tab.fileName))} />
            <span className="truncate max-w-[120px]">
              {tab.isDirty && <span className="text-peach-400 mr-0.5">●</span>}
              {tab.fileName}
            </span>
            <button
              className="ml-1 p-0.5 rounded hover:bg-[#3a3a4a] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
