import type {
  Project, Skill, SkillDeployment, ChangeEvent, SyncHistory,
  SkillBackup, GitConfig, AppSettings, StoreSkill
} from '@/types'

export const mockProjects: Project[] = [
  {
    id: 'p1', name: 'GitPulse', path: '/Users/wang/code/my/GitPulse',
    detected_tools: ['windsurf', 'cursor'], skill_count: 5,
    last_scanned_at: '2025-01-20T10:30:00Z', sync_status: 'synced', created_at: '2025-01-10T08:00:00Z',
  },
  {
    id: 'p2', name: 'EmbedEase', path: '/Users/wang/code/my/embedease-ai',
    detected_tools: ['windsurf', 'cursor', 'claude-code'], skill_count: 8,
    last_scanned_at: '2025-01-20T09:00:00Z', sync_status: 'changed', created_at: '2025-01-05T08:00:00Z',
  },
  {
    id: 'p3', name: 'Skills Manager', path: '/Users/wang/code/my/skills-manager',
    detected_tools: ['windsurf'], skill_count: 3,
    last_scanned_at: '2025-01-20T11:00:00Z', sync_status: 'synced', created_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'p4', name: 'MediBot', path: '/Users/wang/code/my/medibot',
    detected_tools: ['cursor', 'claude-code', 'codex'], skill_count: 6,
    last_scanned_at: '2025-01-19T15:00:00Z', sync_status: 'unsynced', created_at: '2024-12-20T08:00:00Z',
  },
]

export const mockSkills: Skill[] = [
  {
    id: 's1', name: 'frontend-design', description: '创建独特的生产级前端界面，避免通用AI美学',
    version: '1.2.0', source: 'local', local_path: '~/.skills-manager/skills/frontend-design',
    checksum: 'abc123', tags: ['frontend', 'design', 'ui'], last_modified_at: '2025-01-18T10:00:00Z', created_at: '2025-01-01T08:00:00Z',
  },
  {
    id: 's2', name: 'tailwindcss', description: 'Tailwind CSS v4 开发指南与最佳实践',
    version: '2.0.0', source: 'skills-sh', source_url: 'https://skills.sh/tailwindcss', local_path: '~/.skills-manager/skills/tailwindcss',
    checksum: 'def456', tags: ['css', 'tailwind', 'styling'], last_modified_at: '2025-01-15T10:00:00Z', created_at: '2024-12-15T08:00:00Z',
  },
  {
    id: 's3', name: 'zustand-state-management', description: '使用 Zustand 构建类型安全的全局状态',
    version: '1.0.0', source: 'skills-sh', source_url: 'https://skills.sh/zustand', local_path: '~/.skills-manager/skills/zustand-state-management',
    checksum: 'ghi789', tags: ['react', 'state', 'zustand'], last_modified_at: '2025-01-10T10:00:00Z', created_at: '2024-12-20T08:00:00Z',
  },
  {
    id: 's4', name: 'gsap-react', description: 'GSAP 与 React 集成模式，包括 useGSAP hook',
    version: '1.1.0', source: 'github', source_url: 'https://github.com/user/gsap-react-skill', local_path: '~/.skills-manager/skills/gsap-react',
    checksum: 'jkl012', tags: ['animation', 'gsap', 'react'], last_modified_at: '2025-01-12T10:00:00Z', created_at: '2024-12-25T08:00:00Z',
  },
  {
    id: 's5', name: 'release', description: '发版流程自动化：CHANGELOG、双平台推送、打 tag',
    version: '1.3.0', source: 'local', local_path: '~/.skills-manager/skills/release',
    checksum: 'mno345', tags: ['release', 'git', 'automation'], last_modified_at: '2025-01-19T10:00:00Z', created_at: '2024-11-01T08:00:00Z',
  },
  {
    id: 's6', name: 'run-tests', description: '后端代码测试验证规则，修改后自动运行测试',
    version: '1.0.0', source: 'local', local_path: '~/.skills-manager/skills/run-tests',
    checksum: 'pqr678', tags: ['testing', 'backend', 'python'], last_modified_at: '2025-01-08T10:00:00Z', created_at: '2024-12-01T08:00:00Z',
  },
  {
    id: 's7', name: 'skill-creator', description: '创建高效 Skill 的指南和模板',
    version: '2.0.0', source: 'skills-sh', source_url: 'https://skills.sh/skill-creator', local_path: '~/.skills-manager/skills/skill-creator',
    checksum: 'stu901', tags: ['meta', 'skill', 'template'], last_modified_at: '2025-01-20T10:00:00Z', created_at: '2024-10-15T08:00:00Z',
  },
  {
    id: 's8', name: 'framer-motion-animator', description: '使用 Framer Motion 创建流畅动画和微交互',
    version: '1.0.0', source: 'skills-sh', source_url: 'https://skills.sh/framer-motion', local_path: '~/.skills-manager/skills/framer-motion-animator',
    checksum: 'vwx234', tags: ['animation', 'framer-motion', 'react'], last_modified_at: '2025-01-16T10:00:00Z', created_at: '2025-01-05T08:00:00Z',
  },
]

export const mockDeployments: SkillDeployment[] = [
  { id: 'd1', skill_id: 's1', project_id: 'p1', tool_name: 'windsurf', deploy_path: '/Users/wang/code/my/GitPulse/.windsurf/skills/frontend-design', status: 'synced', deployed_checksum: 'abc123', last_synced_at: '2025-01-18T10:00:00Z' },
  { id: 'd2', skill_id: 's2', project_id: 'p1', tool_name: 'windsurf', deploy_path: '/Users/wang/code/my/GitPulse/.windsurf/skills/tailwindcss', status: 'synced', deployed_checksum: 'def456', last_synced_at: '2025-01-15T10:00:00Z' },
  { id: 'd3', skill_id: 's1', project_id: 'p2', tool_name: 'windsurf', deploy_path: '/Users/wang/code/my/embedease-ai/.windsurf/skills/frontend-design', status: 'diverged', deployed_checksum: 'abc000', last_synced_at: '2025-01-17T10:00:00Z' },
  { id: 'd4', skill_id: 's3', project_id: 'p2', tool_name: 'cursor', deploy_path: '/Users/wang/code/my/embedease-ai/.cursor/skills/zustand-state-management', status: 'synced', deployed_checksum: 'ghi789', last_synced_at: '2025-01-10T10:00:00Z' },
  { id: 'd5', skill_id: 's4', project_id: 'p2', tool_name: 'windsurf', deploy_path: '/Users/wang/code/my/embedease-ai/.windsurf/skills/gsap-react', status: 'missing', deployed_checksum: '', last_synced_at: '2025-01-12T10:00:00Z' },
  { id: 'd6', skill_id: 's5', project_id: null, tool_name: 'windsurf', deploy_path: '~/.windsurf/skills/release', status: 'synced', deployed_checksum: 'mno345', last_synced_at: '2025-01-19T10:00:00Z' },
  { id: 'd7', skill_id: 's6', project_id: 'p4', tool_name: 'claude-code', deploy_path: '/Users/wang/code/my/medibot/.claude/skills/run-tests', status: 'synced', deployed_checksum: 'pqr678', last_synced_at: '2025-01-08T10:00:00Z' },
  { id: 'd8', skill_id: 's7', project_id: null, tool_name: 'cursor', deploy_path: '~/.cursor/skills/skill-creator', status: 'diverged', deployed_checksum: 'stu000', last_synced_at: '2025-01-19T10:00:00Z' },
]

export const mockChangeEvents: ChangeEvent[] = [
  { id: 'ce1', skill_name: 'frontend-design', project_name: 'EmbedEase', tool_name: 'windsurf', event_type: 'modified', status: 'pending', detected_at: '2025-01-20T08:30:00Z', file_path: '.windsurf/skills/frontend-design/SKILL.md' },
  { id: 'ce2', skill_name: 'skill-creator', project_name: '全局', tool_name: 'cursor', event_type: 'modified', status: 'pending', detected_at: '2025-01-20T07:00:00Z', file_path: '~/.cursor/skills/skill-creator/SKILL.md' },
  { id: 'ce3', skill_name: 'gsap-react', project_name: 'EmbedEase', tool_name: 'windsurf', event_type: 'deleted', status: 'pending', detected_at: '2025-01-19T22:00:00Z', file_path: '.windsurf/skills/gsap-react/' },
  { id: 'ce4', skill_name: 'tailwindcss', project_name: 'GitPulse', tool_name: 'windsurf', event_type: 'modified', status: 'resolved', detected_at: '2025-01-18T15:00:00Z', file_path: '.windsurf/skills/tailwindcss/SKILL.md' },
]

export const mockSyncHistory: SyncHistory[] = [
  { id: 'sh1', action_type: 'deploy', skill_name: 'frontend-design', project_name: 'GitPulse', tool_name: 'windsurf', result: 'success', created_at: '2025-01-18T10:00:00Z' },
  { id: 'sh2', action_type: 'update', skill_name: 'tailwindcss', project_name: 'GitPulse', tool_name: 'windsurf', result: 'success', created_at: '2025-01-15T10:00:00Z' },
  { id: 'sh3', action_type: 'export', skill_name: '全部', result: 'success', created_at: '2025-01-14T20:00:00Z' },
  { id: 'sh4', action_type: 'deploy', skill_name: 'run-tests', project_name: 'MediBot', tool_name: 'claude-code', result: 'failed', error_message: '目标路径不可写', created_at: '2025-01-13T10:00:00Z' },
  { id: 'sh5', action_type: 'import', skill_name: 'framer-motion-animator', result: 'success', created_at: '2025-01-05T08:00:00Z' },
]

export const mockBackups: SkillBackup[] = [
  { id: 'b1', skill_id: 's1', version: '1.1.0', reason: '更新前自动备份', created_at: '2025-01-18T09:59:00Z' },
  { id: 'b2', skill_id: 's1', version: '1.0.0', reason: '手动备份', created_at: '2025-01-10T08:00:00Z' },
  { id: 'b3', skill_id: 's2', version: '1.9.0', reason: '更新前自动备份', created_at: '2025-01-15T09:59:00Z' },
]

export const mockGitConfig: GitConfig = {
  platform: 'github', repo_url: 'https://github.com/congwa/cong_wa_skills',
  auth_type: 'ssh', branch: 'main', connected: true, last_export_at: '2025-01-14T20:00:00Z',
}

export const mockSettings: AppSettings = {
  language: 'zh-CN', theme: 'light', startup_page: 'projects', notifications_enabled: true,
  skill_library_path: '~/.skills-manager/skills/', auto_export_frequency: 'daily',
  file_watch_enabled: true, update_check_frequency: 'daily', auto_update: false, history_retention_days: 90,
}

export const mockStoreSkills: StoreSkill[] = [
  { id: 'ss1', name: 'react-best-practices', description: 'React 和 Next.js 性能优化指南', version: '3.0.0', compatible_tools: ['windsurf', 'cursor', 'claude-code'], install_count: 12500, rating: 4.8, category: 'Frontend' },
  { id: 'ss2', name: 'python-testing', description: 'Python 单元测试和集成测试最佳实践', version: '2.1.0', compatible_tools: ['windsurf', 'cursor', 'codex'], install_count: 8900, rating: 4.6, category: 'Testing' },
  { id: 'ss3', name: 'docker-deploy', description: 'Docker 容器化部署和 CI/CD 自动化', version: '1.5.0', compatible_tools: ['windsurf', 'cursor', 'claude-code', 'codex', 'trae'], install_count: 15200, rating: 4.9, category: 'DevOps' },
  { id: 'ss4', name: 'sqlite-expert', description: 'SQLite 嵌入式数据库开发专家', version: '1.0.0', compatible_tools: ['windsurf', 'cursor'], install_count: 3400, rating: 4.5, category: 'Database' },
  { id: 'ss5', name: 'api-design', description: 'RESTful API 设计规范与 OpenAPI 生成', version: '2.0.0', compatible_tools: ['windsurf', 'cursor', 'claude-code'], install_count: 9800, rating: 4.7, category: 'Backend' },
  { id: 'ss6', name: 'tailwindcss', description: 'Tailwind CSS v4 开发指南', version: '2.1.0', compatible_tools: ['windsurf', 'cursor', 'claude-code'], install_count: 18000, rating: 4.9, category: 'Frontend', installed_version: '2.0.0', has_update: true },
]
