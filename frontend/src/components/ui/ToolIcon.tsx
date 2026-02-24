import { useState } from 'react'
import { toolColors, toolNames } from '@/lib/utils'
import { cn } from '@/lib/utils'

// SimpleIcons CDN（只含已确认存在的 slug）
const SIMPLE_ICON_SLUGS: Record<string, string> = {
  'claude-code':    'anthropic',
  'cortex':         'snowflake',
  'cursor':         'cursor',
  'gemini-cli':     'googlegemini',
  'github-copilot': 'github',
  'junie':          'jetbrains',
  'mistral-vibe':   'mistral',
  'codex':          'openai',
  'opencode':       'openai',
  'replit':         'replit',
  'trae':           'bytedance',
  'trae-cn':        'bytedance',
  'windsurf':       'windsurf',
}

// Google Favicon 服务的工具官网域名
const TOOL_DOMAINS: Record<string, string> = {
  'amp':            'ampcode.com',
  'antigravity':    'deepmind.google.com',
  'augment':        'augmentcode.com',
  'claude-code':    'anthropic.com',
  'cline':          'cline.bot',
  'codebuddy':      'code.tencent.com',
  'codex':          'openai.com',
  'command-code':   'commandcode.dev',
  'continue':       'continue.dev',
  'cortex':         'snowflake.com',
  'crush':          'charm.sh',
  'cursor':         'cursor.com',
  'droid':          'factory.ai',
  'gemini-cli':     'gemini.google.com',
  'github-copilot': 'github.com',
  'goose':          'block.xyz',
  'junie':          'jetbrains.com',
  'kilo':           'kilocode.ai',
  'kimi-cli':       'moonshot.cn',
  'kiro-cli':       'kiro.dev',
  'mistral-vibe':   'mistral.ai',
  'mux':            'mux.com',
  'opencode':       'opencode.ai',
  'openhands':      'all-hands.dev',
  'pi':             'pi.ai',
  'qwen-code':      'qwen.ai',
  'replit':         'replit.com',
  'roo':            'roocode.com',
  'trae':           'trae.ai',
  'trae-cn':        'trae.ai',
  'windsurf':       'windsurf.com',
  'zencoder':       'zencoder.ai',
}

function buildIconSrcs(id: string): string[] {
  const srcs: string[] = []
  const slug = SIMPLE_ICON_SLUGS[id]
  if (slug) srcs.push(`https://cdn.simpleicons.org/${slug}`)
  const domain = TOOL_DOMAINS[id]
  if (domain) srcs.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`)
  return srcs
}

// ── 单个工具图标 ──────────────────────────────────────────────────────────────

interface ToolIconProps {
  tool: string
  size?: number
  className?: string
  showLabel?: boolean
  /** 覆盖 rounded-lg（如需圆形传 'rounded-full'） */
  rounded?: string
}

export function ToolIcon({
  tool,
  size = 20,
  className,
  showLabel,
  rounded = 'rounded-lg',
}: ToolIconProps) {
  const color  = toolColors[tool] ?? '#94A3B8'
  const label  = toolNames[tool]  ?? tool
  const srcs   = buildIconSrcs(tool)
  const [idx, setIdx] = useState(0)

  const iconEl =
    idx < srcs.length ? (
      <div
        className={cn('flex items-center justify-center bg-white border border-cream-100 shrink-0', rounded)}
        style={{ width: size, height: size, padding: size * 0.15 }}
      >
        <img
          key={srcs[idx]}
          src={srcs[idx]}
          alt={label}
          className="w-full h-full object-contain"
          onError={() => setIdx((i) => i + 1)}
        />
      </div>
    ) : (
      <div
        className={cn('flex items-center justify-center text-white font-bold shrink-0', rounded)}
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          fontSize: size * 0.42,
        }}
      >
        {label.charAt(0).toUpperCase()}
      </div>
    )

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      {iconEl}
      {showLabel && <span className="text-xs text-cream-700">{label}</span>}
    </div>
  )
}

// ── 工具图标横排（部署徽标等）────────────────────────────────────────────────

interface ToolIconRowProps {
  tools: string[]
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
