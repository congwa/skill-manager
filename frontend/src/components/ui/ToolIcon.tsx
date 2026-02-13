import type { ToolName } from '@/types'
import { toolColors, toolNames } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ToolIconProps {
  tool: ToolName
  size?: number
  className?: string
  showLabel?: boolean
}

export function ToolIcon({ tool, size = 20, className, showLabel }: ToolIconProps) {
  const color = toolColors[tool]
  const label = toolNames[tool]
  const initial = label.charAt(0).toUpperCase()

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <div
        className="rounded-lg flex items-center justify-center font-bold text-white"
        style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.45 }}
      >
        {initial}
      </div>
      {showLabel && <span className="text-xs text-cream-700">{label}</span>}
    </div>
  )
}

interface ToolIconRowProps {
  tools: ToolName[]
  size?: number
}

export function ToolIconRow({ tools, size = 20 }: ToolIconRowProps) {
  return (
    <div className="flex items-center gap-1">
      {tools.map((tool) => (
        <ToolIcon key={tool} tool={tool} size={size} />
      ))}
    </div>
  )
}
