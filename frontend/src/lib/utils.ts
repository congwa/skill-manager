import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ToolName, DeploymentStatus, SkillSource } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function relativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 30) return `${days} 天前`
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

export const toolColors: Record<ToolName, string> = {
  windsurf: '#0EA5E9',
  cursor: '#8B5CF6',
  'claude-code': '#D97706',
  codex: '#059669',
  trae: '#EC4899',
}

export const toolNames: Record<ToolName, string> = {
  windsurf: 'Windsurf',
  cursor: 'Cursor',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  trae: 'Trae',
}

export const statusColors: Record<DeploymentStatus, { bg: string; text: string; label: string }> = {
  synced: { bg: 'bg-mint-100', text: 'text-mint-500', label: '已同步' },
  diverged: { bg: 'bg-honey-100', text: 'text-honey-500', label: '已偏离' },
  missing: { bg: 'bg-strawberry-100', text: 'text-strawberry-500', label: '文件丢失' },
  untracked: { bg: 'bg-sky-100', text: 'text-sky-500', label: '未追踪' },
  pending: { bg: 'bg-cream-200', text: 'text-cream-600', label: '待处理' },
}

export const sourceLabels: Record<SkillSource, { bg: string; text: string; label: string }> = {
  local: { bg: 'bg-cream-200', text: 'text-cream-700', label: '本地' },
  'skills-sh': { bg: 'bg-lavender-100', text: 'text-lavender-400', label: 'skills.sh' },
  github: { bg: 'bg-cream-800', text: 'text-white', label: 'GitHub' },
  gitee: { bg: 'bg-strawberry-400', text: 'text-white', label: 'Gitee' },
}
