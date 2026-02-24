import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, Edit, Eye, GitBranch, Store, RefreshCw,
  ChevronRight, Download, AlertCircle, CheckCircle2,
  Plus, Loader2, UploadCloud,
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
import { skillsShApi, gitApi, deploymentsApi } from '@/lib/tauri-api'
import type { RemoteUpdateInfo } from '@/lib/tauri-api'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'

type FilterTab = 'all' | 'has-update' | 'deploy-issue'

export default function SkillList() {
  const { skills, deployments, fetchSkills, fetchDeployments } = useSkillStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [remoteUpdates, setRemoteUpdates] = useState<RemoteUpdateInfo[]>([])
  const [checkingUpdates, setCheckingUpdates] = useState(false)

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
    checkRemoteUpdates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkRemoteUpdates = async () => {
    setCheckingUpdates(true)
    try {
      const updates = await skillsShApi.checkRemoteUpdates()
      setRemoteUpdates(updates)
    } catch {
      // 静默失败，不影响主流程
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

  const getUpdateInfo = (skillId: string) =>
    remoteUpdates.find((u) => u.skill_id === skillId)

  const getSkillDeployments = (skillId: string) =>
    deployments.filter((d) => d.skill_id === skillId)

  const hasDivergeDeploys = (skillId: string) =>
    getSkillDeployments(skillId).some((d) => d.status === 'diverged' || d.status === 'missing')

  const filtered = skills
    .filter((s) => {
      const matchSearch =
        !searchQuery ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())

      if (!matchSearch) return false

      if (tab === 'has-update') return !!getUpdateInfo(s.id)?.has_update
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

  // 快速同步所有部署
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

  // 应用商城更新
  const handleApplyUpdate = async (_skillId: string, updateInfo: RemoteUpdateInfo) => {
    const id = toast.loading(`正在应用更新: ${updateInfo.skill_name}`)
    try {
      await skillsShApi.install({
        ownerRepo: updateInfo.owner_repo,
        skillPath: updateInfo.skill_path,
        skillName: updateInfo.skill_name,
        folderSha: updateInfo.remote_sha,
        files: [],
        deployTargets: [],
        forceOverwrite: true,
      })
      await fetchSkills()
      await fetchDeployments()
      const newUpdates = await skillsShApi.checkRemoteUpdates()
      setRemoteUpdates(newUpdates)
      toast.success(`${updateInfo.skill_name} 已更新到数据库`, { id })
    } catch (e) {
      toast.error('更新失败: ' + String(e), { id })
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
                onClick={checkRemoteUpdates}
                disabled={checkingUpdates}
              >
                {checkingUpdates
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                检查远程更新
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>联网查询 skills.sh，检查是否有新版本</p>
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
            <TabsTrigger value="all" className="text-xs">全部 <span className="ml-1 text-cream-400">{skills.length}</span></TabsTrigger>
            <TabsTrigger value="has-update" className="text-xs gap-1">
              {hasUpdateCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />}
              有更新 <span className="ml-1 text-cream-400">{hasUpdateCount}</span>
            </TabsTrigger>
            <TabsTrigger value="deploy-issue" className="text-xs gap-1">
              {deployIssueCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
              部署异常 <span className="ml-1 text-cream-400">{deployIssueCount}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 技能列表 */}
      <Card className="border border-cream-200">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">✨</div>
            <p className="text-cream-500">
              {searchQuery ? '没有找到匹配的 Skill' : tab === 'has-update' ? '没有待更新的 Skill' : '没有部署异常的 Skill'}
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
              const locallyModified = updateInfo?.locally_modified
              const hasDivergeDep = hasDivergeDeploys(skill.id)
              const src = sourceLabels[skill.source as keyof typeof sourceLabels]
              const deployedTools = [...new Set(skillDeps.map((d) => d.tool_name))]

              return (
                <motion.div
                  key={skill.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.025 } }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-peach-50/40 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/skills/${skill.id}`)}
                >
                  {/* 名称 + 描述 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-cream-800 text-sm group-hover:text-peach-600 transition-colors truncate">
                        {skill.name}
                      </h3>
                      {/* 来源 */}
                      {src && (
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 shrink-0', src.bg, src.text)}>
                          {src.label}
                        </Badge>
                      )}
                      {/* 状态徽章 */}
                      {hasUpdate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4 bg-orange-50 text-orange-500 border-orange-200 shrink-0"
                            >
                              商城有更新
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {locallyModified ? '本地已修改，应用更新会覆盖本地改动' : '商城版本比数据库版本新'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {locallyModified && !hasUpdate && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-yellow-50 text-yellow-600 border-yellow-200 shrink-0">
                          本地已修改
                        </Badge>
                      )}
                      {hasDivergeDep && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-red-50 text-red-500 border-red-200 shrink-0">
                          部署偏离
                        </Badge>
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

                  {/* 操作按钮区 */}
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 应用商城更新 */}
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
                        <TooltipContent>应用商城更新到数据库</TooltipContent>
                      </Tooltip>
                    )}
                    {/* 同步所有部署 */}
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
                        <TooltipContent>推送到所有部署位置（用库中最新版本覆盖磁盘）</TooltipContent>
                      </Tooltip>
                    )}
                    {/* 部署到全局 */}
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
                      <TooltipContent>部署到工具全局</TooltipContent>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5" /> 部署到工具全局目录
            </DialogTitle>
            <DialogDescription>
              将 <strong>{globalDeployDialog?.skillName}</strong> 部署到所选工具的全局 Skill 目录（不绑定任何项目）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
          <DialogFooter>
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
