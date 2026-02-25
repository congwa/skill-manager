import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Edit, Eye, GitBranch, Store, RefreshCw,
  ChevronRight, Download, AlertCircle, CheckCircle2,
  Plus, Loader2, UploadCloud, RotateCcw, Check, Database, Zap, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSkillStore } from '@/stores/useSkillStore'
import { cn, toolNames, sourceLabels } from '@/lib/utils'
import { ToolIcon } from '@/components/ui/ToolIcon'
import { gitApi, deploymentsApi, catalogApi, skillsApi } from '@/lib/tauri-api'
import type { SkillDeployment } from '@/types'
import type { RemoteUpdateInfo } from '@/lib/tauri-api'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'

type FilterTab = 'all' | 'has-update' | 'locally-modified' | 'deploy-issue'

export default function SkillList() {
  const { skills, deployments, fetchSkills, fetchDeployments, checkSkillUpdates, getUpdateInfo } = useSkillStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  // Watcher 决策状态
  const [watcherActionId, setWatcherActionId] = useState<string | null>(null)
  const [selectivePushSkillId, setSelectivePushSkillId] = useState<string | null>(null)
  const [selectivePushDeps, setSelectivePushDeps] = useState<string[]>([])

  // Git 导入对话框
  const [gitDialogOpen, setGitDialogOpen] = useState(false)
  const [gitUrl, setGitUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('main')
  const [gitCloning, setGitCloning] = useState(false)
  const [gitCloneResult, setGitCloneResult] = useState<Awaited<ReturnType<typeof gitApi.cloneRepo>> | null>(null)
  const [gitImporting, setGitImporting] = useState(false)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])

  // 部署到全局对话框
  const [globalDeployDialog, setGlobalDeployDialog] = useState<{ skillId: string; skillName: string } | null>(null)
  const [globalDeployTool, setGlobalDeployTool] = useState<string>('cursor')
  const [globalDeploying, setGlobalDeploying] = useState(false)
  const [syncingFS, setSyncingFS] = useState(false)

  useEffect(() => {
    fetchSkills()
    fetchDeployments()
    handleCheckUpdates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true)
    try {
      await checkSkillUpdates()
    } catch {
      // 静默失败
    } finally {
      setCheckingUpdates(false)
    }
  }

  const handleSyncFromFS = async () => {
    setSyncingFS(true)
    const id = toast.loading('正在扫描文件系统技能...')
    try {
      const result = await invoke<{ tools_found: string[]; skills_imported: number; deployments_created: number }>(
        'scan_global_skills'
      )
      await fetchSkills()
      await fetchDeployments()
      toast.success(
        `同步完成：新增 ${result.skills_imported} 个 Skill，${result.deployments_created} 条部署记录`,
        { id }
      )
    } catch (e) {
      toast.error('文件系统同步失败: ' + String(e), { id })
    } finally {
      setSyncingFS(false)
    }
  }

  const getSkillDeployments = (skillId: string) =>
    deployments.filter((d) => d.skill_id === skillId)

  const hasDivergeDeploys = (skillId: string) =>
    getSkillDeployments(skillId).some((d) => d.status === 'diverged' || d.status === 'missing')

  const locallyModifiedCount = skills.filter((s) => !!s.watcher_modified_at).length

  const filtered = skills
    .filter((s) => {
      const matchSearch =
        !searchQuery ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())

      if (!matchSearch) return false

      const updateInfo = getUpdateInfo(s.id)
      if (tab === 'has-update') return !!updateInfo?.has_update
      if (tab === 'locally-modified') return !!s.watcher_modified_at
      if (tab === 'deploy-issue') return hasDivergeDeploys(s.id)
      return true
    })

  const hasUpdateCount = skills.filter((s) => !!getUpdateInfo(s.id)?.has_update).length
  const deployIssueCount = skills.filter((s) => hasDivergeDeploys(s.id)).length

  // Git 导入流程
  const handleGitClone = async () => {
    if (!gitUrl.trim()) return
    setGitCloning(true)
    setGitCloneResult(null)
    setSelectedSkills([])
    try {
      const result = await gitApi.cloneRepo(gitUrl.trim(), gitBranch || undefined)
      setGitCloneResult(result)
      setSelectedSkills(result.skills_found.filter((s) => s.status !== 'exists_same').map((s) => s.name))
    } catch (e) {
      toast.error('克隆失败: ' + String(e))
    } finally {
      setGitCloning(false)
    }
  }

  const handleGitImport = async () => {
    if (!gitCloneResult || selectedSkills.length === 0) return
    setGitImporting(true)
    try {
      const result = await gitApi.importFromRepo(
        gitCloneResult.clone_path,
        selectedSkills,
        false,
        gitUrl,
      )
      await fetchSkills()
      await fetchDeployments()
      toast.success(`导入完成：${result.skills_imported} 新增，${result.skills_updated} 更新，${result.skills_skipped} 跳过`)
      setGitDialogOpen(false)
      setGitCloneResult(null)
      setGitUrl('')
    } catch (e) {
      toast.error('导入失败: ' + String(e))
    } finally {
      setGitImporting(false)
    }
  }

  const toggleSelectSkill = (name: string) => {
    setSelectedSkills((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  // 快速同步所有部署（DB → 磁盘）
  const handleSyncAll = async (skillId: string, skillName: string) => {
    const deps = getSkillDeployments(skillId)
    if (deps.length === 0) { toast.info('此 Skill 无部署'); return }
    const id = toast.loading(`正在同步 ${skillName}...`)
    try {
      for (const dep of deps) {
        await deploymentsApi.syncDeployment(dep.id)
      }
      await fetchDeployments()
      toast.success(`${skillName} 所有部署已同步`, { id })
    } catch (e) {
      toast.error('同步失败: ' + String(e), { id })
    }
  }

  // 应用商城更新（商城 → DB）
  const handleApplyUpdate = async (_skillId: string, updateInfo: RemoteUpdateInfo) => {
    const id = toast.loading(`正在应用更新: ${updateInfo.skill_name}`)
    try {
      const catalog = await catalogApi.fetch()
      const catalogSkill = catalog.find(
        s => s.name.toLowerCase() === updateInfo.skill_name.toLowerCase()
          || s.source_repo === updateInfo.owner_repo
      )
      if (!catalogSkill) {
        toast.error(`商城中找不到 ${updateInfo.skill_name} 的最新版本`, { id })
        return
      }
      await catalogApi.install({
        sourceRepo: catalogSkill.source_repo,
        sourcePath: catalogSkill.source_path,
        skillName: catalogSkill.name,
        commitSha: catalogSkill.commit_sha,
        deployTargets: [],
        forceOverwrite: true,
      })
      await fetchSkills()
      await fetchDeployments()
      await checkSkillUpdates()
      toast.success(`${updateInfo.skill_name} 已更新到数据库`, { id })
    } catch (e) {
      toast.error('更新失败: ' + String(e), { id })
    }
  }

  // 全量同步：清 watcher 标记 + 推送到所有部署目录
  const handleFullSync = async (skillId: string, skillName: string) => {
    setWatcherActionId(skillId)
    const tid = toast.loading(`全量同步 ${skillName}...`)
    try {
      await skillsApi.dismissWatcherChange(skillId)
      const deps = getSkillDeployments(skillId)
      for (const dep of deps) {
        await deploymentsApi.syncDeployment(dep.id)
      }
      await fetchSkills()
      await fetchDeployments()
      toast.success(`${skillName} 已入库并同步到所有 ${deps.length} 个部署`, { id: tid })
    } catch (e) {
      toast.error('全量同步失败: ' + String(e), { id: tid })
    } finally {
      setWatcherActionId(null)
    }
  }

  // 仅入库：清 watcher 标记，不推送到其他部署
  const handleDbOnly = async (skillId: string, skillName: string) => {
    setWatcherActionId(skillId)
    const tid = toast.loading(`入库 ${skillName}...`)
    try {
      await skillsApi.dismissWatcherChange(skillId)
      await fetchSkills()
      await fetchDeployments()
      toast.success(`${skillName} 已确认入库，其他工具部署保持旧版本`, { id: tid })
    } catch (e) {
      toast.error('操作失败: ' + String(e), { id: tid })
    } finally {
      setWatcherActionId(null)
    }
  }

  // 放弃并还原：恢复备份 → 推回触发工具目录 → 清标记
  const handleDiscardWatcher = async (skillId: string, skillName: string) => {
    setWatcherActionId(skillId)
    const tid = toast.loading(`放弃修改并还原 ${skillName}...`)
    try {
      await skillsApi.discardWatcherChange(skillId)
      await fetchSkills()
      await fetchDeployments()
      toast.success(`${skillName} 已还原到修改前版本`, { id: tid })
    } catch (e) {
      toast.error('还原失败: ' + String(e), { id: tid })
    } finally {
      setWatcherActionId(null)
    }
  }

  // 选择性推送：推送到选中的部署
  const handleSelectivePush = async (skillId: string, skillName: string, depIds: string[]) => {
    if (depIds.length === 0) { toast.info('请至少选择一个目标'); return }
    setWatcherActionId(skillId)
    const tid = toast.loading(`推送 ${skillName} 到选中工具...`)
    try {
      for (const depId of depIds) {
        await deploymentsApi.syncDeployment(depId)
      }
      await fetchDeployments()
      toast.success(`已推送到 ${depIds.length} 个目标`, { id: tid })
      setSelectivePushSkillId(null)
      setSelectivePushDeps([])
    } catch (e) {
      toast.error('推送失败: ' + String(e), { id: tid })
    } finally {
      setWatcherActionId(null)
    }
  }

  const handleGlobalDeploy = async () => {
    if (!globalDeployDialog) return
    setGlobalDeploying(true)
    try {
      await deploymentsApi.deployGlobal(globalDeployDialog.skillId, globalDeployTool, false)
      await fetchDeployments()
      toast.success(`${globalDeployDialog.skillName} 已部署到 ${toolNames[globalDeployTool as keyof typeof toolNames] ?? globalDeployTool} 全局目录`)
      setGlobalDeployDialog(null)
    } catch (e) {
      toast.error('部署失败: ' + String(e))
    } finally {
      setGlobalDeploying(false)
    }
  }

  const tools = ['windsurf', 'cursor', 'claude-code', 'codex', 'trae'] as const

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-cream-800">技能库</h1>
          <p className="text-sm text-cream-500 mt-0.5">{skills.length} 个 Skill 存储在数据库中</p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={handleSyncFromFS}
                disabled={syncingFS}
              >
                {syncingFS
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                扫描 & 导入
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>扫描磁盘上未被记录的 Skill 并导入到库</p>
              <p className="text-xs opacity-70 mt-0.5">不会修改已有 Skill 的内容</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={handleCheckUpdates}
                disabled={checkingUpdates}
              >
                {checkingUpdates
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                检查远程更新
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>联网查询商城，检查是否有新版本</p>
              <p className="text-xs opacity-70 mt-0.5">只读查询，不会修改本地文件</p>
            </TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={() => setGitDialogOpen(true)}
          >
            <GitBranch className="h-4 w-4" />
            从 Git 导入
          </Button>
          <Button
            size="sm"
            className="rounded-xl gap-1.5 bg-peach-500 hover:bg-peach-600 text-white"
            onClick={() => navigate('/store')}
          >
            <Store className="h-4 w-4" />
            去商城安装
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-400" />
          <Input
            placeholder="搜索技能名称或描述..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-full border-cream-300 h-9"
          />
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
          <TabsList className="bg-cream-100 h-9">
            <TabsTrigger value="all" className="text-xs">
              全部 <span className="ml-1 text-cream-400">{skills.length}</span>
            </TabsTrigger>
            <TabsTrigger value="has-update" className="text-xs gap-1">
              {hasUpdateCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />}
              商城更新 <span className="ml-1 text-cream-400">{hasUpdateCount}</span>
            </TabsTrigger>
            <TabsTrigger value="locally-modified" className="text-xs gap-1 relative">
              {locallyModifiedCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-pulse" />
              )}
              本地修改 <span className="ml-1 text-cream-400">{locallyModifiedCount}</span>
            </TabsTrigger>
            <TabsTrigger value="deploy-issue" className="text-xs gap-1">
              {deployIssueCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
              部署异常 <span className="ml-1 text-cream-400">{deployIssueCount}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 技能列表 */}
      <Card className="border border-cream-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">✨</div>
            <p className="text-cream-500">
              {searchQuery
                ? '没有找到匹配的 Skill'
                : tab === 'has-update' ? '没有待更新的 Skill'
                : tab === 'locally-modified' ? '没有本地修改的 Skill'
                : '没有部署异常的 Skill'}
            </p>
            {!searchQuery && tab === 'all' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 rounded-xl"
                onClick={() => navigate('/store')}
              >
                <Plus className="h-4 w-4 mr-1" /> 去商城安装第一个 Skill
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-cream-100">
            {filtered.map((skill, i) => {
              const skillDeps = getSkillDeployments(skill.id)
              const updateInfo = getUpdateInfo(skill.id)
              const hasUpdate = updateInfo?.has_update
              const locallyModified = !!skill.watcher_modified_at
              const hasDivergeDep = hasDivergeDeploys(skill.id)
              const src = sourceLabels[skill.source as keyof typeof sourceLabels]
              const deployedTools = [...new Set(skillDeps.map((d) => d.tool_name))]
              const isWatcherActing = watcherActionId === skill.id
              // 触发工具信息
              const triggerDep = skill.watcher_trigger_dep_id
                ? skillDeps.find((d) => d.id === skill.watcher_trigger_dep_id) ?? null
                : null
              const otherDeps = skillDeps.filter((d) => d.id !== skill.watcher_trigger_dep_id)
              const isSelectivePushOpen = selectivePushSkillId === skill.id

              return (
                <motion.div
                  key={skill.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.025 } }}
                  className={cn(
                    'relative flex flex-col gap-0 transition-colors cursor-pointer group',
                    locallyModified
                      ? 'bg-red-50/60 hover:bg-red-50/80 border-l-[3px] border-l-red-400'
                      : 'hover:bg-peach-50/40 border-l-[3px] border-l-transparent',
                  )}
                  onClick={() => navigate(`/skills/${skill.id}`)}
                >
                  {/* 主行 */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* 红点指示器（watcher 变更时） */}
                    {locallyModified && (
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
                    )}

                    {/* 名称 + 描述 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-cream-800 text-sm group-hover:text-peach-600 transition-colors truncate">
                          {skill.name}
                        </h3>
                        {src && (
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 shrink-0', src.bg, src.text)}>
                            {src.label}
                          </Badge>
                        )}
                        {/* 商城有更新 */}
                        {hasUpdate && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 bg-orange-50 text-orange-500 border-orange-200 shrink-0"
                              >
                                ↑ 商城有更新
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="font-medium">商城版本比本地新</p>
                              {updateInfo?.locally_modified && (
                                <p className="text-xs text-orange-300 mt-0.5">⚠ 本地也有修改，应用更新会覆盖</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* 本地已修改（watcher 检测到的） */}
                        {locallyModified && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 bg-red-50 text-red-600 border-red-300 shrink-0 font-medium"
                              >
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1" />
                                {triggerDep
                                  ? `在 ${toolNames[triggerDep.tool_name as keyof typeof toolNames] ?? triggerDep.tool_name} 中变更`
                                  : 'Watcher 检测到变更'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-medium text-red-300">文件变更已同步到数据库，需要决策</p>
                              {triggerDep && (
                                <p className="text-xs opacity-80 mt-0.5">
                                  触发工具：{toolNames[triggerDep.tool_name as keyof typeof toolNames] ?? triggerDep.tool_name}
                                  （{triggerDep.deploy_path}）
                                </p>
                              )}
                              <p className="text-xs opacity-80 mt-0.5">变更时间：{skill.watcher_modified_at}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* 部署偏离 */}
                        {hasDivergeDep && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-red-50 text-red-500 border-red-200 shrink-0">
                                ⚠ 部署偏离
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>有部署目录的文件与数据库不一致</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <p className="text-xs text-cream-400 truncate mt-0.5">{skill.description}</p>
                    </div>

                    {/* 已部署工具小圆点 */}
                    <div className="flex items-center gap-1 shrink-0">
                      {deployedTools.length === 0 ? (
                        <span className="text-xs text-cream-300">未部署</span>
                      ) : (
                        deployedTools.map((tool) => (
                          <Tooltip key={tool}>
                            <TooltipTrigger asChild>
                              <span>
                                <ToolIcon tool={tool} size={20} rounded="rounded-full" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {toolNames[tool as keyof typeof toolNames] ?? tool}：{skillDeps.filter((d) => d.tool_name === tool).length} 个部署
                            </TooltipContent>
                          </Tooltip>
                        ))
                      )}
                    </div>

                    {/* 部署数量 */}
                    <span className="text-xs text-cream-400 shrink-0 w-12 text-right">
                      {skillDeps.length > 0 ? `${skillDeps.length} 部署` : ''}
                    </span>

                    {/* 常规操作按钮（hover 显示） */}
                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {hasUpdate && updateInfo && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                              onClick={() => handleApplyUpdate(skill.id, updateInfo)}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>商城 → 数据库：应用商城最新版本</TooltipContent>
                        </Tooltip>
                      )}
                      {skillDeps.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleSyncAll(skill.id, skill.name)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>数据库 → 磁盘：推送到所有部署位置</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setGlobalDeployDialog({ skillId: skill.id, skillName: skill.name })}
                          >
                            <UploadCloud className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>数据库 → 工具全局目录：部署到新位置</TooltipContent>
                      </Tooltip>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => navigate(`/skills/${skill.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => navigate(`/skills/${skill.id}/edit`)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <ChevronRight className="h-4 w-4 text-cream-300 shrink-0" />
                  </div>

                  {/* Watcher 变更决策面板 */}
                  <AnimatePresence>
                    {locallyModified && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="px-4 pb-3 space-y-2 border-t border-red-100 bg-red-50/40">
                          {/* 头部：触发工具 + 各部署状态 */}
                          <div className="flex items-center gap-2 pt-2">
                            <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            <span className="text-[11px] text-red-700 font-semibold">
                              {triggerDep
                                ? `在 ${toolNames[triggerDep.tool_name as keyof typeof toolNames] ?? triggerDep.tool_name} 中检测到文件变更，已同步入库。请选择处理方式：`
                                : 'Watcher 检测到部署目录变更，已同步入库。请选择处理方式：'}
                            </span>
                          </div>

                          {/* 各部署工具状态展示 */}
                          {skillDeps.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {skillDeps.map((dep: SkillDeployment) => {
                                const isTrigger = dep.id === skill.watcher_trigger_dep_id
                                const toolLabel = toolNames[dep.tool_name as keyof typeof toolNames] ?? dep.tool_name
                                return (
                                  <Tooltip key={dep.id}>
                                    <TooltipTrigger asChild>
                                      <span className={cn(
                                        'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium',
                                        isTrigger
                                          ? 'bg-red-100 border-red-300 text-red-700'
                                          : 'bg-white border-cream-200 text-cream-600'
                                      )}>
                                        <ToolIcon tool={dep.tool_name} size={12} rounded="rounded-full" />
                                        {toolLabel}
                                        {isTrigger && <span className="text-red-500 font-bold"> ✎</span>}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                      <p className="font-medium">{toolLabel}</p>
                                      <p className="text-xs opacity-80">{dep.deploy_path}</p>
                                      {isTrigger
                                        ? <p className="text-xs text-red-300 mt-0.5">⚡ 变更触发来源（已有新版）</p>
                                        : <p className="text-xs text-cream-400 mt-0.5">部署尚未更新（旧版本）</p>}
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              })}
                              {otherDeps.length > 0 && (
                                <span className="text-[10px] text-cream-400">
                                  → {otherDeps.length} 个部署待决策
                                </span>
                              )}
                            </div>
                          )}

                          {/* 三个主操作按钮 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* 全量同步 */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] px-2.5 gap-1 border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 shrink-0"
                                  disabled={isWatcherActing}
                                  onClick={() => handleFullSync(skill.id, skill.name)}
                                >
                                  {isWatcherActing
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Zap className="h-3 w-3" />}
                                  全量同步
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="font-medium text-blue-300">新版本 → DB → 所有工具</p>
                                <p className="text-xs opacity-80 mt-0.5">清除 watcher 标记并将新版本推送到全部 {skillDeps.length} 个部署目录。</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* 仅入库 */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] px-2.5 gap-1 border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 shrink-0"
                                  disabled={isWatcherActing}
                                  onClick={() => handleDbOnly(skill.id, skill.name)}
                                >
                                  {isWatcherActing
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Database className="h-3 w-3" />}
                                  仅入库
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="font-medium text-emerald-300">新版本 → DB，工具暂不同步</p>
                                <p className="text-xs opacity-80 mt-0.5">确认入库但不推送，{otherDeps.length} 个其他部署保持旧版本。可之后选择性推送。</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* 放弃并还原 */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] px-2.5 gap-1 border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-400 shrink-0"
                                  disabled={isWatcherActing}
                                  onClick={() => handleDiscardWatcher(skill.id, skill.name)}
                                >
                                  {isWatcherActing
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <RotateCcw className="h-3 w-3" />}
                                  放弃并还原
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="font-medium text-orange-300">丢弃修改，DB + 触发工具 → 恢复旧版</p>
                                <p className="text-xs opacity-80 mt-0.5">从自动备份恢复 DB，并将旧版本推回触发工具目录。此操作不可逆（备份已自动保存）。</p>
                                {!skill.watcher_backup_id && (
                                  <p className="text-xs text-orange-300 mt-0.5">⚠ 无自动备份，DB 将无法恢复</p>
                                )}
                              </TooltipContent>
                            </Tooltip>

                            {/* 选择性推送入口 */}
                            {skillDeps.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[11px] px-2.5 gap-1 text-cream-500 hover:text-cream-700 shrink-0"
                                    disabled={isWatcherActing}
                                    onClick={() => {
                                      setSelectivePushSkillId(isSelectivePushOpen ? null : skill.id)
                                      setSelectivePushDeps([])
                                    }}
                                  >
                                    <UploadCloud className="h-3 w-3" />
                                    选择性推送
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  <p>选择特定工具同步最新版本</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>

                          {/* 选择性推送展开面板 */}
                          <AnimatePresence>
                            {isSelectivePushOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <div className="border border-cream-200 rounded-lg p-2.5 bg-white space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] text-cream-600 font-medium">选择要推送到的工具：</span>
                                    <button
                                      className="text-cream-300 hover:text-cream-500"
                                      onClick={() => setSelectivePushSkillId(null)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {skillDeps.map((dep: SkillDeployment) => {
                                      const checked = selectivePushDeps.includes(dep.id)
                                      const toolLabel = toolNames[dep.tool_name as keyof typeof toolNames] ?? dep.tool_name
                                      return (
                                        <button
                                          key={dep.id}
                                          onClick={() => setSelectivePushDeps(prev =>
                                            checked ? prev.filter(id => id !== dep.id) : [...prev, dep.id]
                                          )}
                                          className={cn(
                                            'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors',
                                            checked
                                              ? 'bg-blue-100 border-blue-300 text-blue-700'
                                              : 'bg-white border-cream-200 text-cream-500 hover:border-cream-300'
                                          )}
                                        >
                                          {checked && <Check className="h-2.5 w-2.5" />}
                                          <ToolIcon tool={dep.tool_name} size={12} rounded="rounded-full" />
                                          {toolLabel}
                                        </button>
                                      )
                                    })}
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      className="h-6 text-[11px] px-3 bg-blue-500 hover:bg-blue-600 text-white"
                                      disabled={selectivePushDeps.length === 0 || isWatcherActing}
                                      onClick={() => handleSelectivePush(skill.id, skill.name, selectivePushDeps)}
                                    >
                                      推送到 {selectivePushDeps.length} 个工具
                                    </Button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Git 导入对话框 */}
      <Dialog open={gitDialogOpen} onOpenChange={(open) => { setGitDialogOpen(open); if (!open) { setGitCloneResult(null); setGitUrl(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" /> 从 Git 仓库导入
            </DialogTitle>
            <DialogDescription>
              输入 GitHub / Gitee 仓库地址，克隆后选择要导入到数据库的 Skill。
            </DialogDescription>
          </DialogHeader>

          {!gitCloneResult ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-cream-700">仓库地址</label>
                <Input
                  placeholder="https://github.com/user/skills-repo"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGitClone()}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-cream-700">分支（可选）</label>
                <Input
                  placeholder="main"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  className="w-40"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGitDialogOpen(false)}>取消</Button>
                <Button
                  className="bg-peach-500 hover:bg-peach-600 text-white"
                  disabled={!gitUrl.trim() || gitCloning}
                  onClick={handleGitClone}
                >
                  {gitCloning ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 克隆中...</> : '克隆并扫描'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-cream-600">
                在仓库中发现 <strong>{gitCloneResult.skills_found.length}</strong> 个 Skill，选择要导入到数据库的：
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {gitCloneResult.skills_found.map((s) => (
                  <div
                    key={s.name}
                    className={cn(
                      'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors',
                      selectedSkills.includes(s.name)
                        ? 'border-peach-300 bg-peach-50'
                        : 'border-cream-200 hover:bg-cream-50'
                    )}
                    onClick={() => toggleSelectSkill(s.name)}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                      selectedSkills.includes(s.name) ? 'border-peach-500 bg-peach-500' : 'border-cream-300'
                    )}>
                      {selectedSkills.includes(s.name) && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cream-800">{s.name}</p>
                      {s.description && <p className="text-xs text-cream-400 truncate">{s.description}</p>}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] shrink-0',
                        s.status === 'new' ? 'bg-mint-50 text-mint-500' :
                        s.status === 'exists_conflict' ? 'bg-red-50 text-red-500' :
                        'bg-cream-100 text-cream-400'
                      )}
                    >
                      {s.status === 'new' ? '新增' : s.status === 'exists_conflict' ? '有冲突' : '已存在'}
                    </Badge>
                  </div>
                ))}
              </div>
              {gitCloneResult.skills_found.some((s) => s.status === 'exists_conflict') && (
                <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg text-xs text-orange-600">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  冲突的 Skill 导入时将保留现有版本，如需覆盖请先删除本地版本。
                </div>
              )}
              <DialogFooter className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setGitCloneResult(null) }}
                >
                  重新选择仓库
                </Button>
                <Button
                  className="bg-peach-500 hover:bg-peach-600 text-white"
                  disabled={selectedSkills.length === 0 || gitImporting}
                  onClick={handleGitImport}
                >
                  {gitImporting
                    ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 导入中...</>
                    : `导入 ${selectedSkills.length} 个到数据库`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 部署到全局对话框 */}
      <Dialog open={!!globalDeployDialog} onOpenChange={(open) => !open && setGlobalDeployDialog(null)}>
        <DialogContent className="max-w-sm flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5" /> 部署到工具全局目录
            </DialogTitle>
            <DialogDescription>
              将 <strong>{globalDeployDialog?.skillName}</strong> 部署到所选工具的全局 Skill 目录（不绑定任何项目）。
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <p className="text-sm text-cream-700">选择目标工具：</p>
            <div className="grid grid-cols-3 gap-2">
              {tools.map((tool) => (
                <button
                  key={tool}
                  onClick={() => setGlobalDeployTool(tool)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-medium',
                    globalDeployTool === tool
                      ? 'border-peach-400 bg-peach-50 text-peach-700'
                      : 'border-cream-200 text-cream-600 hover:border-peach-200'
                  )}
                >
                  <ToolIcon tool={tool} size={28} />
                  {toolNames[tool]}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="pt-2 border-t border-cream-100">
            <Button variant="outline" onClick={() => setGlobalDeployDialog(null)}>取消</Button>
            <Button
              className="bg-peach-500 hover:bg-peach-600 text-white"
              disabled={globalDeploying}
              onClick={handleGlobalDeploy}
            >
              {globalDeploying ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 部署中...</> : '确认部署'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
