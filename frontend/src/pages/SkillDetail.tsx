import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Edit, RefreshCw, MoreHorizontal,
  Trash2, FileText, MapPin, GitBranch, Folder, FolderOpen,
  Plus, Clock, Loader2, Download,
  UploadCloud, CheckCircle2, AlertTriangle, Info, ChevronRight, ChevronDown, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useSkillStore } from '@/stores/useSkillStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { cn, toolNames, statusColors, sourceLabels, relativeTime } from '@/lib/utils'
import { ToolIcon } from '@/components/ui/ToolIcon'
import { ALL_TOOLS } from '@/lib/tools'
import { toast } from 'sonner'
import { skillsApi, deploymentsApi, gitApi, catalogApi } from '@/lib/tauri-api'
import type { RemoteUpdateInfo, GitRepoUpdateInfo } from '@/lib/tauri-api'
import type { ToolName } from '@/types'

const TOOLS: ToolName[] = ALL_TOOLS.map((t) => t.id)

export default function SkillDetail() {
  const { skillId } = useParams()
  const navigate = useNavigate()
  const { skills, deployments, backups, fetchDeployments, fetchSkills } = useSkillStore()
  const projects = useProjectStore((s) => s.projects)
  const skill = skills.find((s) => s.id === skillId)
  const skillDeployments = deployments.filter((d) => d.skill_id === skillId)
  const skillBackups = backups.filter((b) => b.skill_id === skillId)
  const [activeTab, setActiveTab] = useState('overview')
  const [skillContent, setSkillContent] = useState<string | null>(null)
  const [skillFiles, setSkillFiles] = useState<string[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 新增部署
  const [deployDialogOpen, setDeployDialogOpen] = useState(false)
  const [deployType, setDeployType] = useState<'project' | 'global'>('project')
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTool, setSelectedTool] = useState<ToolName>('cursor')
  const [deploying, setDeploying] = useState(false)

  // 同步 Tab
  const [remoteUpdateInfo, setRemoteUpdateInfo] = useState<RemoteUpdateInfo | null>(null)
  const [hasCheckedStore, setHasCheckedStore] = useState(false)   // 区分"未检查"和"检查后未在商城中"
  const [gitUpdateInfo, setGitUpdateInfo] = useState<GitRepoUpdateInfo[]>([])
  const [hasCheckedGit, setHasCheckedGit] = useState(false)
  const [checkingSync, setCheckingSync] = useState(false)
  const [applyingUpdate, setApplyingUpdate] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (skill?.id) {
      skillsApi.readFile(skill.id, 'SKILL.md').then(setSkillContent).catch(() => {})
      skillsApi.listFiles(skill.id).then(setSkillFiles).catch(() => {})
    }
  }, [skill?.id])

  if (!skill) {
    return (
      <div className="text-center py-20">
        <p className="text-cream-500">Skill 不存在</p>
        <Button variant="ghost" onClick={() => navigate('/skills')} className="mt-4">返回列表</Button>
      </div>
    )
  }

  const src = sourceLabels[skill.source as keyof typeof sourceLabels]

  const handleSyncAll = async () => {
    const id = toast.loading('正在同步所有部署...')
    try {
      let totalFiles = 0
      for (const dep of skillDeployments) {
        const result = await deploymentsApi.syncDeployment(dep.id)
        totalFiles += result.files_copied
      }
      await fetchDeployments()
      toast.success(`已同步 ${skillDeployments.length} 个部署，共 ${totalFiles} 个文件`, { id })
    } catch (e) {
      toast.error('同步失败: ' + String(e), { id })
    }
  }

  const handleSyncOne = async (depId: string) => {
    try {
      const result = await deploymentsApi.syncDeployment(depId)
      await fetchDeployments()
      toast.success(`同步完成，${result.files_copied} 个文件`)
    } catch (e) {
      toast.error('同步失败: ' + String(e))
    }
  }

  const handleDeleteDeployment = async (depId: string, deployPath: string) => {
    const confirmed = window.confirm(
      `确认删除此部署？\n\n将同时删除磁盘上的文件：\n${deployPath}\n\n此操作不可恢复。`
    )
    if (!confirmed) return
    try {
      await deploymentsApi.delete(depId)
      await fetchDeployments()
      toast.success('部署已删除（磁盘文件和记录均已移除）')
    } catch (e) {
      toast.error('删除失败: ' + String(e))
    }
  }

  const handleBatchDelete = async () => {
    setDeleting(true)
    try {
      const result = await skillsApi.batchDelete(skillId!)
      await fetchSkills()
      await fetchDeployments()
      toast.success(`${result.skill_name} 已删除: ${result.deployments_deleted} 个部署`)
      navigate('/skills')
    } catch (e) {
      toast.error('删除失败: ' + String(e))
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  const handleDeploy = async (force = false) => {
    setDeploying(true)
    try {
      if (deployType === 'global') {
        await deploymentsApi.deployGlobal(skillId!, selectedTool, force)
        toast.success(`已部署到 ${toolNames[selectedTool]} 全局目录`)
      } else {
        if (!selectedProject) { toast.error('请选择目标项目'); return }
        const result = await deploymentsApi.deployToProject(skillId!, selectedProject, selectedTool, force)
        if (result.conflict?.status === 'exists_different') {
          toast.warning('目标位置已有不同内容，请选择是否强制覆盖', {
            action: { label: '强制覆盖', onClick: () => handleDeploy(true) },
            duration: 10000,
          })
          setDeploying(false)
          return
        }
        toast.success(`已部署到项目，${result.files_copied} 个文件`)
      }
      await fetchDeployments()
      setDeployDialogOpen(false)
    } catch (e) {
      toast.error('部署失败: ' + String(e))
    } finally {
      setDeploying(false)
    }
  }

  const handleCheckSync = async () => {
    setCheckingSync(true)
    try {
      const [updates, gitUpdates] = await Promise.allSettled([
        catalogApi.checkUpdates(),
        gitApi.checkRepoUpdates(),
      ])
      if (updates.status === 'fulfilled') {
        const info = updates.value.find((u) => u.skill_id === skillId)
        setRemoteUpdateInfo(info ?? null)
        setHasCheckedStore(true)
      }
      if (gitUpdates.status === 'fulfilled') {
        setGitUpdateInfo(gitUpdates.value)
        setHasCheckedGit(true)
      }
    } catch (e) {
      toast.error('检查失败: ' + String(e))
    } finally {
      setCheckingSync(false)
    }
  }

  const handleApplyStoreUpdate = async () => {
    if (!remoteUpdateInfo) return
    setApplyingUpdate(true)
    try {
      // 从 catalog 查找最新版本，获取正确的 source_path 和 commit_sha
      const catalog = await catalogApi.fetch()
      const catalogSkill = catalog.find(
        s => s.name.toLowerCase() === remoteUpdateInfo.skill_name.toLowerCase()
          || s.source_repo === remoteUpdateInfo.owner_repo
      )
      if (!catalogSkill) {
        toast.error(`商城中找不到 ${remoteUpdateInfo.skill_name} 的最新版本`)
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
      setRemoteUpdateInfo((prev) => prev ? { ...prev, has_update: false } : null)
      toast.success('已从商城更新到数据库')
    } catch (e) {
      toast.error('更新失败: ' + String(e))
    } finally {
      setApplyingUpdate(false)
    }
  }

  const handleExportToGit = async (configId: string) => {
    setExporting(true)
    try {
      const result = await gitApi.exportToGit(configId)
      toast.success(`已推送到 Git：${result.skills_exported} 个 Skill，commit: ${result.commit_hash?.slice(0, 7) ?? 'N/A'}`)
    } catch (e) {
      toast.error('推送失败: ' + String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 顶部 */}
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Button variant="ghost" size="sm" onClick={() => navigate('/skills')} className="h-8 -ml-2 gap-1 text-cream-500">
            <ArrowLeft className="h-4 w-4" /> 技能库
          </Button>
          <h1 className="text-2xl font-display font-bold text-cream-800">{skill.name}</h1>
          <p className="text-cream-500 text-sm">{skill.description}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {skill.version && (
              <Badge variant="outline" className="bg-lavender-50 text-lavender-400 text-xs">v{skill.version}</Badge>
            )}
            {src && <Badge variant="outline" className={cn('text-xs', src.bg, src.text)}>{src.label}</Badge>}
            {skill.tags?.map((tag) => (
              <Badge key={tag} variant="secondary" className="bg-cream-100 text-cream-600 text-xs">{tag}</Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => navigate(`/skills/${skillId}/edit`)} className="rounded-xl" size="sm">
            <Edit className="h-4 w-4 mr-1" /> 编辑
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleSyncAll} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl" size="sm">
                <RefreshCw className="h-4 w-4 mr-1" /> 推送到所有部署
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>将库中最新版本推送覆盖到所有已部署位置</p>
              <p className="text-xs opacity-70 mt-0.5">方向：数据库 → 磁盘</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem className="text-red-500" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> 删除 Skill
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tab 区 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-cream-100">
          <TabsTrigger value="overview"><FileText className="h-4 w-4 mr-1" /> 概览</TabsTrigger>
          <TabsTrigger value="deployments">
            <MapPin className="h-4 w-4 mr-1" /> 部署
            <Badge variant="secondary" className="ml-1 bg-peach-100 text-peach-600 text-[10px] h-4 px-1">
              {skillDeployments.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="sync"><GitBranch className="h-4 w-4 mr-1" /> 同步</TabsTrigger>
          <TabsTrigger value="files"><Folder className="h-4 w-4 mr-1" /> 文件</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          {/* ── 概览 Tab ── */}
          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle className="text-base">基本信息</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: '来源', value: src?.label ?? skill.source },
                    { label: '版本', value: skill.version ? `v${skill.version}` : '—' },
                    { label: '校验和', value: skill.checksum ? skill.checksum.slice(0, 16) + '...' : '—' },
                    { label: 'Skill ID', value: skill.id.slice(0, 8) + '...' },
                    { label: '最后修改', value: relativeTime(skill.last_modified_at) },
                    { label: '部署数量', value: `${skillDeployments.length} 个` },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs text-cream-400">{item.label}</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm text-cream-800 truncate">{item.value}</p>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs max-w-xs">{item.value}</p></TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
                {skill.source_url && (
                  <div>
                    <p className="text-xs text-cream-400">来源 URL</p>
                    <a href={skill.source_url} target="_blank" rel="noreferrer" className="text-sm text-peach-600 hover:underline truncate block">
                      {skill.source_url}
                    </a>
                  </div>
                )}
                {/* SKILL.md 预览 */}
                <div>
                  <p className="text-xs text-cream-400 mb-2">SKILL.md 内容</p>
                  <div className="bg-cream-50 rounded-xl p-4 font-mono text-xs text-cream-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {skillContent || `---\nname: ${skill.name}\ndescription: ${skill.description}\nversion: ${skill.version}\n---\n\n# ${skill.name}\n\n${skill.description}`}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 部署 Tab ── */}
          <TabsContent value="deployments" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-cream-500">管理此 Skill 在各项目和工具全局目录的部署</p>
              <Button
                size="sm"
                className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl gap-1"
                onClick={() => setDeployDialogOpen(true)}
              >
                <Plus className="h-4 w-4" /> 新增部署
              </Button>
            </div>
            <Card className="border border-cream-200">
              {skillDeployments.length === 0 ? (
                <div className="text-center py-12">
                  <MapPin className="h-8 w-8 text-cream-300 mx-auto mb-2" />
                  <p className="text-cream-400 text-sm">此 Skill 尚未部署到任何位置</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 rounded-xl"
                    onClick={() => setDeployDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> 添加第一个部署
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-cream-100">
                  {skillDeployments.map((dep, i) => {
                    const project = projects.find((p) => p.id === dep.project_id)
                    const stat = statusColors[dep.status as keyof typeof statusColors] ?? { bg: '', text: '', label: dep.status }
                    return (
                      <motion.div
                        key={dep.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0, transition: { delay: i * 0.04 } }}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        {/* 工具徽标 */}
                        <ToolIcon tool={dep.tool_name} size={32} />
                        {/* 路径信息 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-cream-800">
                            {project?.name ?? '全局'} · {toolNames[dep.tool_name as keyof typeof toolNames] ?? dep.tool_name}
                          </p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs text-cream-400 truncate">{dep.deploy_path}</p>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">{dep.deploy_path}</p></TooltipContent>
                          </Tooltip>
                        </div>
                        {/* 状态 */}
                        <Badge variant="outline" className={cn('text-xs shrink-0', stat.bg, stat.text)}>
                          {stat.label}
                        </Badge>
                        <span className="text-xs text-cream-400 shrink-0">{relativeTime(dep.last_synced_at)}</span>
                        {/* 操作 */}
                        <div className="flex gap-1 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSyncOne(dep.id)}>
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>数据库 → 此部署</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-cream-400 hover:text-red-500"
                                onClick={() => handleDeleteDeployment(dep.id, dep.deploy_path)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>删除部署</p>
                              <p className="text-xs opacity-70 mt-0.5">同时删除磁盘文件和部署记录</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* 备份历史 */}
            {skillBackups.length > 0 && (
              <Card className="border border-cream-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-cream-600 font-medium">
                    <Clock className="h-4 w-4 inline mr-1" /> 备份历史
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {skillBackups.map((backup) => (
                      <div key={backup.id} className="flex items-center gap-3 p-2.5 bg-cream-50 rounded-lg">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-cream-800">v{backup.version}</p>
                          <p className="text-xs text-cream-400">{backup.reason}</p>
                        </div>
                        <span className="text-xs text-cream-400">{relativeTime(backup.created_at)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          disabled={restoring === backup.id}
                          onClick={async () => {
                            setRestoring(backup.id)
                            try {
                              const result = await skillsApi.restoreFromBackup(backup.id, true)
                              await fetchSkills()
                              await fetchDeployments()
                              toast.success(`已恢复到 ${backup.version}，${result.deployments_synced} 个部署已同步`)
                            } catch (e) {
                              toast.error('恢复失败: ' + String(e))
                            } finally {
                              setRestoring(null)
                            }
                          }}
                        >
                          {restoring === backup.id ? '恢复中...' : '恢复'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── 同步 Tab ── */}
          <TabsContent value="sync" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-cream-500">检查商城和 Git 仓库的更新状态</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1"
                    disabled={checkingSync}
                    onClick={handleCheckSync}
                  >
                    {checkingSync ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    检查远程版本
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>联网查询 skills.sh 商城 / Git 仓库是否有新版本</p>
                  <p className="text-xs opacity-70 mt-0.5">只读查询，不会修改本地文件</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* ── 商城 (skills.sh) 区块：始终展示 ── */}
            <Card className="border border-cream-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Download className="h-4 w-4 text-orange-400" />
                  skills.sh 商城
                  {skill.source === 'skills-sh' && (
                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-500 ml-1">来源</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {checkingSync ? (
                  <div className="flex items-center gap-2 text-sm text-cream-400 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在查询商城...
                  </div>
                ) : !hasCheckedStore ? (
                  <div className="flex items-center gap-2 text-sm text-cream-400 py-2">
                    <Info className="h-4 w-4" />
                    <span>点击"检查远程版本"查看此 Skill 在商城中的状态</span>
                  </div>
                ) : remoteUpdateInfo === null ? (
                  <div className="flex items-center gap-2 text-sm text-cream-400 py-2">
                    <Info className="h-4 w-4" />
                    <span>此 Skill 在 skills.sh 商城中未找到</span>
                  </div>
                ) : remoteUpdateInfo.has_update ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-orange-700">商城有新版本</p>
                        {remoteUpdateInfo.locally_modified && (
                          <p className="text-orange-600 text-xs mt-0.5">注意：本地已修改，应用更新会覆盖本地改动并自动备份</p>
                        )}
                      </div>
                    </div>
                    <Button
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl"
                      size="sm"
                      disabled={applyingUpdate}
                      onClick={handleApplyStoreUpdate}
                    >
                      {applyingUpdate
                        ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 更新中...</>
                        : <><Download className="h-4 w-4 mr-1" /> 应用商城更新到数据库</>}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-mint-500 py-2">
                    <CheckCircle2 className="h-4 w-4" />
                    与商城版本一致，无需更新
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Git 仓库区块 ── */}
            <Card className="border border-cream-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-lavender-400" />
                  Git 仓库同步
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {checkingSync ? (
                  <div className="flex items-center gap-2 text-sm text-cream-400 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在检查 Git 仓库...
                  </div>
                ) : !hasCheckedGit ? (
                  <div className="flex items-center gap-2 text-sm text-cream-400 py-2">
                    <Info className="h-4 w-4" />
                    点击"检查远程版本"查看 Git 仓库状态
                  </div>
                ) : gitUpdateInfo.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-cream-400 py-2">
                    <Info className="h-4 w-4" />
                    未配置 Git 仓库，或连接失败
                  </div>
                ) : (
                  gitUpdateInfo.map((repoInfo) => {
                    const skillStatus = repoInfo.skills.find((s) => s.name === skill.name)
                    const inRepo = !!skillStatus

                    return (
                      <div key={repoInfo.config_id} className="border border-cream-100 rounded-xl p-3 space-y-2.5">
                        {/* 仓库地址 */}
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5 text-cream-400 shrink-0" />
                          <p className="text-xs text-cream-500 font-mono truncate flex-1">{repoInfo.remote_url}</p>
                          <span className="text-xs text-cream-400 shrink-0">分支: {repoInfo.branch}</span>
                        </div>

                        {/* Skill 在仓库中的状态 */}
                        {inRepo ? (
                          <div className="flex items-center gap-2 px-2.5 py-2 bg-cream-50 rounded-lg">
                            <Badge
                              variant="outline"
                              className={cn('text-xs shrink-0',
                                skillStatus.status === 'unchanged'     ? 'bg-mint-50 text-mint-600 border-mint-200' :
                                skillStatus.status === 'updated'       ? 'bg-orange-50 text-orange-600 border-orange-200' :
                                skillStatus.status === 'new_remote'    ? 'bg-lavender-50 text-lavender-600 border-lavender-200' :
                                                                          'bg-red-50 text-red-500 border-red-200'
                              )}
                            >
                              {skillStatus.status === 'unchanged'     ? '已同步'
                               : skillStatus.status === 'updated'      ? 'Git 有新版'
                               : skillStatus.status === 'new_remote'   ? '仅在 Git'
                               :                                          '已在 Git 删除'}
                            </Badge>
                            {skillStatus.status === 'updated' && (
                              <span className="text-xs text-orange-500">Git 上有更新，可拉取或推送覆盖</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-2.5 py-2 bg-cream-50 rounded-lg text-xs text-cream-400">
                            <Info className="h-3.5 w-3.5 shrink-0" />
                            此 Skill 不在该仓库中，可推送到 Git 以纳入版本管理
                          </div>
                        )}

                        {/* 操作按钮：始终可推送到 Git */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full rounded-xl gap-1 text-xs"
                          disabled={exporting}
                          onClick={() => handleExportToGit(repoInfo.config_id)}
                        >
                          {exporting
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 推送中...</>
                            : <><UploadCloud className="h-3.5 w-3.5" /> 推送数据库 → Git</>}
                        </Button>
                      </div>
                    )
                  })
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-cream-400 w-full"
                  onClick={() => navigate('/settings')}
                >
                  在设置中配置 Git 仓库 →
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 文件 Tab ── */}
          <TabsContent value="files">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  文件列表
                  {skillFiles.length > 0 && (
                    <span className="text-xs font-normal text-cream-400 bg-cream-100 px-2 py-0.5 rounded-full">
                      {skillFiles.length} 个文件
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {skillFiles.length === 0 ? (
                  <div className="text-center py-8">
                    <Folder className="h-8 w-8 text-cream-300 mx-auto mb-2" />
                    <p className="text-cream-400 text-sm">没有找到文件</p>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    {/* 左侧：文件树 */}
                    <div className="w-56 shrink-0 bg-cream-50 rounded-xl p-2 space-y-0.5 overflow-y-auto max-h-96 border border-cream-100">
                      {(() => {
                        // 构建目录树
                        const dirs: Record<string, string[]> = {}
                        const rootFiles: string[] = []
                        for (const f of skillFiles) {
                          const slash = f.lastIndexOf('/')
                          if (slash === -1) { rootFiles.push(f) }
                          else {
                            const dir = f.slice(0, slash)
                            if (!dirs[dir]) dirs[dir] = []
                            dirs[dir].push(f)
                          }
                        }
                        const getFileIcon = (name: string) => {
                          const ext = name.split('.').pop()?.toLowerCase()
                          if (ext === 'md') return '📝'
                          if (['ts', 'tsx', 'js', 'jsx'].includes(ext ?? '')) return '📜'
                          if (ext === 'json') return '📋'
                          if (['py', 'rs', 'go', 'rb'].includes(ext ?? '')) return '⚙️'
                          if (['png', 'jpg', 'svg', 'gif', 'webp'].includes(ext ?? '')) return '🖼️'
                          return '📄'
                        }
                        return (
                          <>
                            {/* 根目录文件 */}
                            {rootFiles.map((f) => (
                              <button
                                key={f}
                                onClick={async () => {
                                  setSelectedFile(f)
                                  setLoadingFile(true)
                                  try {
                                    const content = await skillsApi.readFile(skill.id, f)
                                    setSelectedFileContent(content)
                                  } catch { setSelectedFileContent(null) }
                                  finally { setLoadingFile(false) }
                                }}
                                className={cn(
                                  'w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left text-xs transition-colors',
                                  selectedFile === f
                                    ? 'bg-peach-100 text-peach-700'
                                    : 'text-cream-600 hover:bg-cream-100'
                                )}
                              >
                                <span className="text-[10px]">{getFileIcon(f)}</span>
                                <span className="font-mono truncate">{f}</span>
                              </button>
                            ))}
                            {/* 目录及其文件 */}
                            {Object.entries(dirs).map(([dir, files]) => {
                              const isOpen = expandedDirs.has(dir)
                              return (
                                <div key={dir}>
                                  <button
                                    onClick={() => setExpandedDirs((prev) => {
                                      const s = new Set(prev)
                                      isOpen ? s.delete(dir) : s.add(dir)
                                      return s
                                    })}
                                    className="w-full flex items-center gap-1 px-2 py-1 rounded-lg text-left text-xs text-cream-700 hover:bg-cream-100 transition-colors"
                                  >
                                    {isOpen
                                      ? <><ChevronDown className="h-3 w-3 shrink-0" /><FolderOpen className="h-3 w-3 text-honey-400 shrink-0" /></>
                                      : <><ChevronRight className="h-3 w-3 shrink-0" /><Folder className="h-3 w-3 text-honey-400 shrink-0" /></>
                                    }
                                    <span className="font-mono font-medium truncate">{dir}</span>
                                    <span className="ml-auto text-cream-300 shrink-0">{files.length}</span>
                                  </button>
                                  {isOpen && (
                                    <div className="ml-4 mt-0.5 space-y-0.5">
                                      {files.map((f) => {
                                        const name = f.split('/').pop() ?? f
                                        return (
                                          <button
                                            key={f}
                                            onClick={async () => {
                                              setSelectedFile(f)
                                              setLoadingFile(true)
                                              try {
                                                const content = await skillsApi.readFile(skill.id, f)
                                                setSelectedFileContent(content)
                                              } catch { setSelectedFileContent(null) }
                                              finally { setLoadingFile(false) }
                                            }}
                                            className={cn(
                                              'w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left text-xs transition-colors',
                                              selectedFile === f
                                                ? 'bg-peach-100 text-peach-700'
                                                : 'text-cream-600 hover:bg-cream-100'
                                            )}
                                          >
                                            <span className="text-[10px]">{getFileIcon(name)}</span>
                                            <span className="font-mono truncate">{name}</span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </>
                        )
                      })()}
                    </div>

                    {/* 右侧：文件内容预览 */}
                    <div className="flex-1 min-w-0 bg-cream-50 rounded-xl border border-cream-100 overflow-hidden">
                      {!selectedFile ? (
                        <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                          <FileText className="h-8 w-8 text-cream-200 mb-2" />
                          <p className="text-xs text-cream-400">点击左侧文件查看内容</p>
                        </div>
                      ) : loadingFile ? (
                        <div className="flex items-center justify-center h-full py-12">
                          <Loader2 className="h-5 w-5 text-peach-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="flex flex-col h-full max-h-96">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-cream-100 bg-white">
                            <span className="text-xs font-mono text-cream-600 truncate">{selectedFile}</span>
                            <button onClick={() => { setSelectedFile(null); setSelectedFileContent(null) }} className="text-cream-400 hover:text-cream-700 ml-2 shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {selectedFileContent === null ? (
                            <div className="p-4 text-xs text-cream-400">无法读取文件内容（可能是二进制文件）</div>
                          ) : (
                            <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-cream-700 leading-relaxed whitespace-pre-wrap break-all">
                              {selectedFileContent}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* 新增部署对话框 */}
      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent className="flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5" /> 数据库 → 部署
            </DialogTitle>
            <DialogDescription>
              将 <strong>{skill.name}</strong> 从数据库部署到项目目录或工具全局目录。
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* 部署类型 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                className={cn(
                  'p-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                  deployType === 'project'
                    ? 'border-peach-400 bg-peach-50 text-peach-700'
                    : 'border-cream-200 text-cream-600 hover:border-peach-200'
                )}
                onClick={() => setDeployType('project')}
              >
                <MapPin className="h-4 w-4 mb-1" />
                部署到项目
                <p className="text-xs font-normal text-current opacity-70 mt-0.5">指定项目目录</p>
              </button>
              <button
                className={cn(
                  'p-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                  deployType === 'global'
                    ? 'border-peach-400 bg-peach-50 text-peach-700'
                    : 'border-cream-200 text-cream-600 hover:border-peach-200'
                )}
                onClick={() => setDeployType('global')}
              >
                <UploadCloud className="h-4 w-4 mb-1" />
                部署到全局
                <p className="text-xs font-normal text-current opacity-70 mt-0.5">工具全局目录</p>
              </button>
            </div>

            {deployType === 'project' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-cream-700">目标项目</label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="border-cream-300"><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-cream-700">目标工具</label>
              <div className="grid grid-cols-3 gap-2">
                {TOOLS.map((tool) => (
                  <button
                    key={tool}
                    onClick={() => setSelectedTool(tool)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2 px-1 rounded-lg border-2 text-xs transition-all',
                      selectedTool === tool
                        ? 'border-peach-400 bg-peach-50 text-peach-700'
                        : 'border-cream-200 text-cream-600 hover:border-peach-200'
                    )}
                  >
                    <ToolIcon tool={tool} size={24} />
                    {toolNames[tool]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2 border-t border-cream-100">
            <Button variant="outline" onClick={() => setDeployDialogOpen(false)}>取消</Button>
            <Button
              className="bg-peach-500 hover:bg-peach-600 text-white"
              disabled={deploying || (deployType === 'project' && !selectedProject)}
              onClick={() => handleDeploy()}
            >
              {deploying ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 部署中...</> : '确认部署'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {skill.name}</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将删除该 Skill 的所有 {skillDeployments.length} 个部署（包括磁盘文件）和数据库记录。不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleBatchDelete() }}
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
