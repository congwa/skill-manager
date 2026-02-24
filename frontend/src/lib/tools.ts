/**
 * Agent/工具配置中心（前端镜像）
 *
 * 与后端 src-tauri/src/tools.rs 保持同步，字段含义相同：
 *   id         — 命令行 --agent 标识符，也是数据库 tool 字段的值
 *   name       — 显示名称
 *   projectDir — 项目级 Skills 目录（相对于项目根目录）
 *   globalDir  — 全局 Skills 目录（相对于 $HOME）
 *   color      — UI 配色（Hex）
 */
export interface ToolConfig {
  id: string
  name: string
  projectDir: string
  globalDir: string
  color: string
}

export const ALL_TOOLS: ToolConfig[] = [
  { id: 'amp',            name: 'Amp',             projectDir: '.agents/skills',      globalDir: '.config/agents/skills',       color: '#6366F1' },
  { id: 'antigravity',    name: 'Antigravity',     projectDir: '.agent/skills',       globalDir: '.gemini/antigravity/skills',  color: '#8B5CF6' },
  { id: 'augment',        name: 'Augment',         projectDir: '.augment/skills',     globalDir: '.augment/skills',             color: '#06B6D4' },
  { id: 'claude-code',    name: 'Claude Code',     projectDir: '.claude/skills',      globalDir: '.claude/skills',              color: '#D97706' },
  { id: 'cline',          name: 'Cline',           projectDir: '.cline/skills',       globalDir: '.cline/skills',               color: '#7C3AED' },
  { id: 'codebuddy',      name: 'CodeBuddy',       projectDir: '.codebuddy/skills',   globalDir: '.codebuddy/skills',           color: '#0284C7' },
  { id: 'codex',          name: 'Codex',           projectDir: '.agents/skills',      globalDir: '.codex/skills',               color: '#059669' },
  { id: 'command-code',   name: 'Command Code',    projectDir: '.commandcode/skills', globalDir: '.commandcode/skills',         color: '#B45309' },
  { id: 'continue',       name: 'Continue',        projectDir: '.continue/skills',    globalDir: '.continue/skills',            color: '#0891B2' },
  { id: 'cortex',         name: 'Cortex Code',     projectDir: '.cortex/skills',      globalDir: '.snowflake/cortex/skills',    color: '#29B5E8' },
  { id: 'crush',          name: 'Crush',           projectDir: '.crush/skills',       globalDir: '.config/crush/skills',        color: '#DB2777' },
  { id: 'cursor',         name: 'Cursor',          projectDir: '.agents/skills',      globalDir: '.cursor/skills',              color: '#8B5CF6' },
  { id: 'droid',          name: 'Droid',           projectDir: '.factory/skills',     globalDir: '.factory/skills',             color: '#475569' },
  { id: 'gemini-cli',     name: 'Gemini CLI',      projectDir: '.agents/skills',      globalDir: '.gemini/skills',              color: '#4285F4' },
  { id: 'github-copilot', name: 'GitHub Copilot',  projectDir: '.agents/skills',      globalDir: '.copilot/skills',             color: '#24292F' },
  { id: 'goose',          name: 'Goose',           projectDir: '.goose/skills',       globalDir: '.config/goose/skills',        color: '#2563EB' },
  { id: 'iflow-cli',      name: 'iFlow CLI',       projectDir: '.iflow/skills',       globalDir: '.iflow/skills',               color: '#7C3AED' },
  { id: 'junie',          name: 'Junie',           projectDir: '.junie/skills',       globalDir: '.junie/skills',               color: '#E11D48' },
  { id: 'kilo',           name: 'Kilo Code',       projectDir: '.kilocode/skills',    globalDir: '.kilocode/skills',            color: '#0E7490' },
  { id: 'kimi-cli',       name: 'Kimi Code CLI',   projectDir: '.agents/skills',      globalDir: '.config/agents/skills',       color: '#2563EB' },
  { id: 'kiro-cli',       name: 'Kiro CLI',        projectDir: '.kiro/skills',        globalDir: '.kiro/skills',                color: '#0284C7' },
  { id: 'kode',           name: 'Kode',            projectDir: '.kode/skills',        globalDir: '.kode/skills',                color: '#9333EA' },
  { id: 'mcpjam',         name: 'MCPJam',          projectDir: '.mcpjam/skills',      globalDir: '.mcpjam/skills',              color: '#64748B' },
  { id: 'mistral-vibe',   name: 'Mistral Vibe',    projectDir: '.vibe/skills',        globalDir: '.vibe/skills',                color: '#F97316' },
  { id: 'mux',            name: 'Mux',             projectDir: '.mux/skills',         globalDir: '.mux/skills',                 color: '#6B7280' },
  { id: 'openclaw',       name: 'OpenClaw',        projectDir: 'skills',              globalDir: '.openclaw/skills',            color: '#DC2626' },
  { id: 'opencode',       name: 'OpenCode',        projectDir: '.agents/skills',      globalDir: '.config/opencode/skills',     color: '#16A34A' },
  { id: 'openhands',      name: 'OpenHands',       projectDir: '.openhands/skills',   globalDir: '.openhands/skills',           color: '#7C3AED' },
  { id: 'pi',             name: 'Pi',              projectDir: '.pi/skills',          globalDir: '.pi/agent/skills',            color: '#0F766E' },
  { id: 'qoder',          name: 'Qoder',           projectDir: '.qoder/skills',       globalDir: '.qoder/skills',               color: '#0369A1' },
  { id: 'qwen-code',      name: 'Qwen Code',       projectDir: '.qwen/skills',        globalDir: '.qwen/skills',                color: '#7C2D12' },
  { id: 'replit',         name: 'Replit',          projectDir: '.agents/skills',      globalDir: '.config/agents/skills',       color: '#F97316' },
  { id: 'roo',            name: 'Roo Code',        projectDir: '.roo/skills',         globalDir: '.roo/skills',                 color: '#4F46E5' },
  { id: 'trae',           name: 'Trae',            projectDir: '.trae/skills',        globalDir: '.trae/skills',                color: '#EC4899' },
  { id: 'trae-cn',        name: 'Trae CN',         projectDir: '.trae/skills',        globalDir: '.trae-cn/skills',             color: '#F43F5E' },
  { id: 'universal',      name: 'Universal',       projectDir: '.agents/skills',      globalDir: '.config/agents/skills',       color: '#6B7280' },
  { id: 'windsurf',       name: 'Windsurf',        projectDir: '.windsurf/skills',    globalDir: '.codeium/windsurf/skills',    color: '#0EA5E9' },
  { id: 'zencoder',       name: 'Zencoder',        projectDir: '.zencoder/skills',    globalDir: '.zencoder/skills',            color: '#7C3AED' },
  { id: 'neovate',        name: 'Neovate',         projectDir: '.neovate/skills',     globalDir: '.neovate/skills',             color: '#16A34A' },
  { id: 'pochi',          name: 'Pochi',           projectDir: '.pochi/skills',       globalDir: '.pochi/skills',               color: '#E11D48' },
  { id: 'adal',           name: 'AdaL',            projectDir: '.adal/skills',        globalDir: '.adal/skills',                color: '#0284C7' },
]

/** 快速查找 Map */
export const toolMap = new Map(ALL_TOOLS.map((t) => [t.id, t]))

/** tool id → 显示名称（向后兼容 utils.ts 的 toolNames） */
export const toolNames: Record<string, string> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.id, t.name])
)

/** tool id → 配色（向后兼容 utils.ts 的 toolColors） */
export const toolColors: Record<string, string> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.id, t.color])
)

/** 所有工具 ID 组成的列表（用于下拉选择等） */
export const toolIds = ALL_TOOLS.map((t) => t.id)
