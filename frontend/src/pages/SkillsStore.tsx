import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Download, Loader2, CheckCircle2, AlertCircle, RefreshCw,
  Globe, Package, ChevronLeft, ChevronRight, ExternalLink, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn, toolNames } from '@/lib/utils'
import { ToolIcon } from '@/components/ui/ToolIcon'
import { useSkillStore } from '@/stores/useSkillStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { skillsShApi } from '@/lib/tauri-api'
import type { SkillsShSearchResult, RemoteUpdateInfo } from '@/lib/tauri-api'
import { toast } from 'sonner'
import type { ToolName } from '@/types'

const TOOLS: ToolName[] = ['windsurf', 'cursor', 'claude-code', 'codex', 'trae']
const PAGE_SIZE = 12

// ── SKILL.md frontmatter 解析 ──
interface SkillMeta {
  name?: string
  description?: string
  triggers?: string
  domain?: string
  author?: string
  version?: string
}

function parseFrontmatter(content: string): { meta: SkillMeta; body: string } {
  if (!content.startsWith('---')) return { meta: {}, body: content }
  const endIdx = content.indexOf('\n---', 3)
  if (endIdx === -1) return { meta: {}, body: content }

  const yaml = content.slice(3, endIdx)
  const body = content.slice(endIdx + 4).trim()
  const meta: SkillMeta = {}
  let inMetadata = false

  for (const line of yaml.split('\n')) {
    if (line.trim() === 'metadata:') { inMetadata = true; continue }
    if (inMetadata && !line.startsWith('  ')) inMetadata = false

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')

    if (!inMetadata) {
      if (key === 'name') meta.name = value
      else if (key === 'description') meta.description = value
    } else {
      if (key === 'triggers') meta.triggers = value
      else if (key === 'domain') meta.domain = value
      else if (key === 'author') meta.author = value
      else if (key === 'version') meta.version = value
    }
  }

  return { meta, body }
}

/**
 * 从 SKILL.md body 中提取第一段有意义的文字作为摘要
 * 用于 frontmatter 没有 description 字段时的降级方案
 */
function extractBodySummary(body: string, maxLen = 180): string | null {
  let current = ''
  for (const line of body.split('\n')) {
    const t = line.trim()
    // 跳过标题、代码块、表格、列表、分隔线
    if (!t || t.startsWith('#') || t.startsWith('|') || t.startsWith('```')
      || t.startsWith('---') || t.startsWith('- ') || t.startsWith('* ')
      || t.startsWith('>')) {
      if (current.length > 30) break  // 已收集到足够内容，停止
      current = ''
      continue
    }
    current += (current ? ' ' : '') + t
    if (current.length >= maxLen) break
  }
  if (current.length < 15) return null
  return current.length > maxLen ? current.slice(0, maxLen) + '…' : current
}

export default function SkillsStore() {
  const { skills, fetchSkills, fetchDeployments } = useSkillStore()
  const projects = useProjectStore((s) => s.projects)

  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SkillsShSearchResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [page, setPage] = useState(0)

  const [popularSkills, setPopularSkills] = useState<SkillsShSearchResult[]>([])
  const [loadingPopular, setLoadingPopular] = useState(false)

  const [remoteUpdates, setRemoteUpdates] = useState<RemoteUpdateInfo[]>([])
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  // 详情抽屉
  const [detailSkill, setDetailSkill] = useState<SkillsShSearchResult | null>(null)
  const [detailContent, setDetailContent] = useState<string | null>(null)
  const [detailMeta, setDetailMeta] = useState<SkillMeta>({})
  const [loadingDetail, setLoadingDetail] = useState(false)

  // 卡片描述缓存：undefined = 未加载，null = 加载失败/无描述，string = 描述内容
  const [descCache, setDescCache] = useState<Record<string, string | null>>({})
  // 用 ref 跟踪正在加载中的 ID，避免重复请求同一个 skill
  const loadingDescRef = useRef<Set<string>>(new Set())

  // 安装对话框
  const [installDialog, setInstallDialog] = useState<SkillsShSearchResult | null>(null)
  const [installType, setInstallType] = useState<'db-only' | 'project' | 'global'>('db-only')
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTool, setSelectedTool] = useState<ToolName>('cursor')
  const [installing, setInstalling] = useState<string | null>(null)

  useEffect(() => {
    loadPopular()
    checkUpdates()
  }, [])

  // 切换搜索/浏览时重置分页
  useEffect(() => { setPage(0) }, [hasSearched, searchResults, popularSkills])

  const loadPopular = async () => {
    setLoadingPopular(true)
    try {
      const result = await skillsShApi.browsePopular()
      setPopularSkills(result.skills)
    } catch { /* 网络不可用时静默失败 */ }
    finally { setLoadingPopular(false) }
  }

  const checkUpdates = async () => {
    setCheckingUpdates(true)
    try {
      const updates = await skillsShApi.checkRemoteUpdates()
      setRemoteUpdates(updates)
    } catch { /* 静默失败 */ }
    finally { setCheckingUpdates(false) }
  }

  // 分页计算（必须在 useEffect 之前声明，否则依赖数组引用会触发 TDZ 错误）
  const displaySkills = hasSearched ? searchResults : popularSkills
  const totalPages = Math.ceil(displaySkills.length / PAGE_SIZE)
  // useMemo 保证引用稳定，防止 useEffect 在每次 render 都触发
  const paginatedSkills = useMemo(
    () => displaySkills.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [displaySkills, page]
  )
  const pendingUpdates = remoteUpdates.filter((u) => u.has_update)

  // 当前页技能列表变化时，批量并发拉取尚未缓存的描述
  useEffect(() => {
    const toFetch = paginatedSkills.filter(
      (s) => !(s.id in descCache) && !loadingDescRef.current.has(s.id)
    )
    if (toFetch.length === 0) return

    toFetch.forEach((s) => loadingDescRef.current.add(s.id))

    Promise.allSettled(
      toFetch.map(async (skill) => {
        const skillPath = skill.id.startsWith(skill.source + '/')
          ? skill.id.slice(skill.source.length + 1)
          : (skill.skill_id || skill.name || '').trim()
        try {
          const raw = await skillsShApi.fetchReadme(skill.source, skillPath)
          const { meta, body } = parseFrontmatter(raw)
          // 优先用 frontmatter description，为空时 fallback 到 body 第一段
          const desc = (meta.description && meta.description.trim())
            || extractBodySummary(body)
            || null
          return { id: skill.id, desc }
        } catch {
          return { id: skill.id, desc: null }
        }
      })
    ).then((results) => {
      const newDescs: Record<string, string | null> = {}
      for (const r of results) {
        if (r.status === 'fulfilled') newDescs[r.value.id] = r.value.desc
      }
      setDescCache((prev) => ({ ...prev, ...newDescs }))
      toFetch.forEach((s) => loadingDescRef.current.delete(s.id))
    })
  }, [paginatedSkills]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setHasSearched(true)
    try {
      const results = await skillsShApi.search(searchQuery.trim(), 60)
      setSearchResults(results)
    } catch (e) {
      toast.error('搜索失败: ' + String(e))
    } finally {
      setSearching(false)
    }
  }

  const isInstalled = (skillName: string) =>
    skills.some((s) => s.name.toLowerCase() === skillName.toLowerCase())

  const getUpdateInfo = (skillName: string) =>
    remoteUpdates.find((u) => u.skill_name.toLowerCase() === skillName.toLowerCase())

  // 打开详情并懒加载 SKILL.md
  // 从 skill.id（如 "vercel-labs/skills/find-skills"）和 skill.source（如 "vercel-labs/skills"）
  // 推导出 skill_path（如 "find-skills"），然后直接走 raw.githubusercontent.com
  // 不消耗 GitHub API 配额，避免匿名 60次/小时 的速率限制导致的静默失败
  const handleOpenDetail = async (skill: SkillsShSearchResult) => {
    setDetailSkill(skill)
    setDetailContent(null)
    setDetailMeta({})
    setLoadingDetail(true)
    try {
      // skill.id 形如 "vercel-labs/skills/find-skills"
      // skill.source 形如 "vercel-labs/skills"
      // 推导 skillPath = "find-skills"
      const skillPath = skill.id.startsWith(skill.source + '/')
        ? skill.id.slice(skill.source.length + 1)
        : (skill.skill_id || skill.name || '').trim()

      console.log(`[SkillsStore] 加载 SKILL.md: ${skill.source}/${skillPath}`)
      const rawContent = await skillsShApi.fetchReadme(skill.source, skillPath)

      // 解析 YAML frontmatter，提取 description / triggers 等元信息
      const { meta, body } = parseFrontmatter(rawContent)
      console.log(`[SkillsStore] 解析 frontmatter:`, meta)
      setDetailMeta(meta)
      setDetailContent(body)
    } catch (e) {
      console.error('[SkillsStore] 加载 SKILL.md 失败:', e)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleInstall = async () => {
    if (!installDialog) return
    const skill = installDialog
    const id = toast.loading(`正在安装 ${skill.name}...`)
    setInstalling(skill.id)
    try {
      const tree = await skillsShApi.getRepoTree(skill.source)
      const effectiveName = (skill.skill_id || skill.name || '').trim()
      const entry = tree.skills.find((s) => {
        const parts = s.skill_path.split('/')
        const name = parts[parts.length - 1]
        return name === effectiveName || s.skill_path.endsWith(effectiveName)
      })
      if (!entry) {
        toast.error(`未找到 Skill 文件: ${effectiveName}`, { id })
        return
      }

      const deployTargets =
        installType === 'project' && selectedProject
          ? [{ project_id: selectedProject, tool: selectedTool }]
          : installType === 'global'
          ? [{ project_id: null, tool: selectedTool }]
          : []

      const result = await skillsShApi.install({
        ownerRepo: skill.source,
        skillPath: entry.skill_path,
        skillName: entry.skill_path.split('/').pop() ?? skill.name,
        folderSha: entry.folder_sha,
        files: entry.files,
        deployTargets,
        forceOverwrite: false,
      })

      await fetchSkills()
      await fetchDeployments()
      const newUpdates = await skillsShApi.checkRemoteUpdates()
      setRemoteUpdates(newUpdates)

      const msg = deployTargets.length > 0
        ? `${skill.name} 已安装到数据库并部署 ${result.deployments_created} 个位置`
        : `${skill.name} 已安装到数据库`
      toast.success(result.conflict ? `${skill.name} 已更新数据库记录（本地已存在）` : msg, { id })
      setInstallDialog(null)
    } catch (e) {
      toast.error('安装失败: ' + String(e), { id })
    } finally {
      setInstalling(null)
    }
  }

  const handleApplyUpdate = async (updateInfo: RemoteUpdateInfo) => {
    const id = toast.loading(`正在更新 ${updateInfo.skill_name}...`)
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
      const newUpdates = await skillsShApi.checkRemoteUpdates()
      setRemoteUpdates(newUpdates)
      toast.success(`${updateInfo.skill_name} 已更新到数据库`, { id })
    } catch (e) {
      toast.error('更新失败: ' + String(e), { id })
    }
  }

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-cream-800">商城</h1>
          <p className="text-sm text-cream-500 mt-0.5">从 skills.sh 安装 Skill 到本地数据库</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5"
          onClick={checkUpdates}
          disabled={checkingUpdates}
        >
          {checkingUpdates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          检查已安装更新
        </Button>
      </div>

      {/* 有更新提示栏 */}
      {pendingUpdates.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />
            <p className="text-sm text-orange-700 font-medium">
              {pendingUpdates.length} 个已安装 Skill 有更新
            </p>
          </div>
          {pendingUpdates.map((u) => (
            <div key={u.skill_id} className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cream-800">{u.skill_name}</p>
                {u.locally_modified && (
                  <p className="text-xs text-orange-600 mt-0.5">本地已修改，更新前会自动备份</p>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-500 border-orange-200 shrink-0">
                商城有更新
              </Badge>
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg shrink-0"
                onClick={() => handleApplyUpdate(u)}
              >
                应用更新
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 搜索栏 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-400" />
          <Input
            placeholder="搜索 skills.sh 上的 Skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10 rounded-xl border-cream-300"
          />
        </div>
        <Button
          className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl"
          disabled={!searchQuery.trim() || searching}
          onClick={handleSearch}
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
        </Button>
        {hasSearched && (
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => { setHasSearched(false); setSearchQuery(''); setSearchResults([]) }}
          >
            清除
          </Button>
        )}
      </div>

      {/* Skill 列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-cream-700 flex items-center gap-2">
            <Globe className="h-4 w-4 text-cream-400" />
            {hasSearched
              ? `搜索结果（${searchResults.length}）`
              : `热门 Skill（${popularSkills.length}）`}
          </h2>
          {totalPages > 1 && (
            <span className="text-xs text-cream-400">
              第 {page + 1} / {totalPages} 页
            </span>
          )}
        </div>

        {(loadingPopular || searching) && !hasSearched ? (
          <div className="text-center py-16">
            <Loader2 className="h-8 w-8 text-peach-400 animate-spin mx-auto" />
            <p className="text-sm text-cream-400 mt-3">加载中...</p>
          </div>
        ) : displaySkills.length === 0 && hasSearched ? (
          <div className="text-center py-16">
            <p className="text-cream-400">没有找到匹配的 Skill，换个关键词试试</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {paginatedSkills.map((skill, i) => {
                const installed = isInstalled(skill.name)
                const updateInfo = getUpdateInfo(skill.name)
                const hasUpdate = updateInfo?.has_update
                // 从 source 解析仓库名显示
                const repoParts = skill.source.split('/')
                const repoName = repoParts.slice(0, 2).join('/')

                const descLoading = !(skill.id in descCache)
                const desc = descCache[skill.id]

                return (
                  <motion.div
                    key={skill.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: i * 0.02 } }}
                    className="h-full"
                  >
                    <Card
                      className={cn(
                        'border transition-all hover:shadow-md cursor-pointer h-full group flex flex-col',
                        hasUpdate ? 'border-orange-200 bg-orange-50/30' : 'border-cream-200'
                      )}
                      onClick={() => handleOpenDetail(skill)}
                    >
                      <CardContent className="p-4 flex flex-col gap-3 h-full">

                        {/* ── 第一行：名称 + 状态徽章 ── */}
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-cream-800 text-sm leading-snug group-hover:text-peach-600 transition-colors min-w-0 flex-1">
                            {skill.name}
                          </h3>
                          <div className="flex items-center gap-1 shrink-0">
                            {installed && !hasUpdate && (
                              <Badge variant="outline" className="text-[10px] bg-mint-50 text-mint-500 border-mint-200 px-1.5 h-5">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> 已安装
                              </Badge>
                            )}
                            {hasUpdate && (
                              <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-500 border-orange-200 px-1.5 h-5">
                                有更新
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* ── 第二行：描述（核心区域）── */}
                        <div className="flex-1 min-h-[52px]">
                          {descLoading ? (
                            /* 骨架屏 */
                            <div className="space-y-1.5 pt-0.5">
                              <div className="h-3 bg-cream-200 rounded-full animate-pulse w-full" />
                              <div className="h-3 bg-cream-200 rounded-full animate-pulse w-4/5" />
                            </div>
                          ) : desc ? (
                            <p className="text-xs text-cream-600 leading-relaxed line-clamp-3">
                              {desc}
                            </p>
                          ) : (
                            <p className="text-xs text-cream-300 italic leading-relaxed">
                              暂无描述，点击查看详情
                            </p>
                          )}
                        </div>

                        {/* ── 第三行：来源 + 安装量 + 按钮 ── */}
                        <div className="flex items-center justify-between pt-1 border-t border-cream-100">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-cream-400 truncate">{repoName}</p>
                            <p className="text-[10px] text-cream-300 flex items-center gap-0.5 mt-0.5">
                              <Package className="h-2.5 w-2.5" />
                              {skill.installs.toLocaleString()}
                            </p>
                          </div>
                          <div
                            className="flex gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasUpdate && updateInfo ? (
                              <Button
                                size="sm"
                                className="text-xs h-7 bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
                                onClick={() => handleApplyUpdate(updateInfo)}
                              >
                                更新
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className={cn(
                                  'text-xs h-7 rounded-lg',
                                  installed
                                    ? 'bg-cream-100 text-cream-500 hover:bg-cream-200'
                                    : 'bg-peach-500 hover:bg-peach-600 text-white'
                                )}
                                onClick={() => setInstallDialog(skill)}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                {installed ? '重装' : '安装'}
                              </Button>
                            )}
                          </div>
                        </div>

                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const pageIdx = totalPages <= 7 ? i
                      : page < 4 ? i
                      : page > totalPages - 5 ? totalPages - 7 + i
                      : page - 3 + i
                    return (
                      <Button
                        key={pageIdx}
                        variant={page === pageIdx ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          'rounded-lg w-8 h-8 p-0 text-xs',
                          page === pageIdx && 'bg-peach-500 hover:bg-peach-600 text-white border-peach-500'
                        )}
                        onClick={() => setPage(pageIdx)}
                      >
                        {pageIdx + 1}
                      </Button>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 详情侧边抽屉 ── */}
      <Sheet open={!!detailSkill} onOpenChange={(open) => { if (!open) { setDetailSkill(null); setDetailMeta({}) } }}>
        <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col gap-0 p-0 overflow-hidden">
          {detailSkill && (
            <>
              <SheetHeader className="p-6 pb-4 border-b border-cream-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SheetTitle className="text-xl font-display">{detailSkill.name}</SheetTitle>
                    <SheetDescription className="mt-1 text-xs font-mono text-cream-400 truncate">
                      {detailSkill.source}
                    </SheetDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {isInstalled(detailSkill.name) && (
                      <Badge variant="outline" className="text-xs bg-mint-50 text-mint-500 border-mint-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> 已安装
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-cream-500 mt-2">
                  <span className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {detailSkill.installs.toLocaleString()} 次安装
                  </span>
                  <a
                    href={`https://skills.sh/${detailSkill.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-peach-500 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" /> 在 skills.sh 查看
                  </a>
                </div>
              </SheetHeader>

              {/* SKILL.md 内容 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {loadingDetail ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-6 w-6 text-peach-400 animate-spin mx-auto" />
                    <p className="text-sm text-cream-400 mt-2">加载 Skill 详情...</p>
                    <p className="text-xs text-cream-300 mt-1">从 GitHub 获取 SKILL.md...</p>
                  </div>
                ) : (detailContent || detailMeta.description) ? (
                  <>
                    {/* ── 核心：description from frontmatter ── */}
                    {detailMeta.description && (
                      <div className="bg-peach-50 border border-peach-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-peach-500 uppercase tracking-wide mb-1.5">适用场景</p>
                        <p className="text-sm text-cream-800 leading-relaxed">{detailMeta.description}</p>
                      </div>
                    )}

                    {/* ── triggers 关键词 ── */}
                    {detailMeta.triggers && (
                      <div>
                        <p className="text-xs font-semibold text-cream-500 uppercase tracking-wide mb-2">触发关键词</p>
                        <div className="flex flex-wrap gap-1.5">
                          {detailMeta.triggers.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                            <span key={tag} className="text-xs bg-lavender-100 text-lavender-500 px-2 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── 元信息 ── */}
                    {(detailMeta.domain || detailMeta.author || detailMeta.version) && (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {detailMeta.domain && (
                          <div className="bg-cream-50 rounded-lg p-2 text-center">
                            <p className="text-cream-400">领域</p>
                            <p className="font-medium text-cream-700 mt-0.5">{detailMeta.domain}</p>
                          </div>
                        )}
                        {detailMeta.version && (
                          <div className="bg-cream-50 rounded-lg p-2 text-center">
                            <p className="text-cream-400">版本</p>
                            <p className="font-medium text-cream-700 mt-0.5">{detailMeta.version}</p>
                          </div>
                        )}
                        {detailMeta.author && (
                          <div className="bg-cream-50 rounded-lg p-2 text-center">
                            <p className="text-cream-400">作者</p>
                            <p className="font-medium text-cream-700 mt-0.5 truncate">
                              {detailMeta.author.split('/').pop()}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── SKILL.md 正文（frontmatter 之后的内容）── */}
                    {detailContent && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-cream-400 mb-3 border-t border-cream-100 pt-4">
                          <FileText className="h-3.5 w-3.5" /> SKILL.md 完整内容
                        </div>
                        <div className="text-sm text-cream-700 leading-relaxed space-y-2">
                          {detailContent.split('\n').map((line, idx) => {
                            if (line.startsWith('# ')) return (
                              <h2 key={idx} className="text-base font-bold text-cream-800 mt-4 first:mt-0">{line.slice(2)}</h2>
                            )
                            if (line.startsWith('## ')) return (
                              <h3 key={idx} className="text-sm font-semibold text-cream-700 mt-3 border-b border-cream-100 pb-1">{line.slice(3)}</h3>
                            )
                            if (line.startsWith('### ')) return (
                              <h4 key={idx} className="text-xs font-semibold text-cream-600 mt-2">{line.slice(4)}</h4>
                            )
                            if (line.startsWith('- ') || line.startsWith('* ')) return (
                              <div key={idx} className="flex gap-2 text-sm text-cream-600">
                                <span className="text-peach-400 shrink-0 mt-0.5">•</span>
                                <span>{line.slice(2)}</span>
                              </div>
                            )
                            if (line.startsWith('```')) return (
                              <div key={idx} className="text-xs font-mono text-cream-500 bg-cream-100 rounded px-2 py-0.5">{line}</div>
                            )
                            if (line.trim() === '') return <div key={idx} className="h-1" />
                            return <p key={idx} className="text-sm text-cream-700">{line}</p>
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-8 w-8 text-cream-300 mx-auto mb-2" />
                    <p className="text-sm text-cream-400">无法加载 Skill 详情</p>
                    <p className="text-xs text-cream-300 mt-1 mb-3">可能是网络问题或该 Skill 暂无 SKILL.md</p>
                    <a
                      href={`https://skills.sh/${detailSkill.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-peach-500 hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> 在 skills.sh 查看完整说明
                    </a>
                  </div>
                )}
              </div>

              {/* 底部操作 */}
              <div className="p-4 border-t border-cream-200 flex gap-2">
                {getUpdateInfo(detailSkill.name)?.has_update ? (
                  <Button
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl"
                    onClick={() => {
                      const u = getUpdateInfo(detailSkill.name)
                      if (u) { handleApplyUpdate(u); setDetailSkill(null) }
                    }}
                  >
                    应用商城更新到数据库
                  </Button>
                ) : (
                  <Button
                    className="flex-1 bg-peach-500 hover:bg-peach-600 text-white rounded-xl"
                    onClick={() => { setInstallDialog(detailSkill); setDetailSkill(null) }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {isInstalled(detailSkill.name) ? '重新安装' : '安装到数据库'}
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── 安装对话框 ── */}
      <Dialog open={!!installDialog} onOpenChange={(open) => !open && setInstallDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" /> 安装 {installDialog?.name}
            </DialogTitle>
            <DialogDescription>
              商城 → 数据库。选择是否同时部署到项目或工具全局目录。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 安装范围 */}
            <div>
              <label className="text-sm font-medium text-cream-700 mb-2 block">安装范围</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'db-only', label: '仅数据库', desc: '不部署文件' },
                  { value: 'project', label: '部署到项目', desc: '选择项目+工具' },
                  { value: 'global', label: '部署到全局', desc: '工具全局目录' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setInstallType(opt.value as typeof installType)}
                    className={cn(
                      'p-2.5 rounded-xl border-2 text-xs text-left transition-all',
                      installType === opt.value
                        ? 'border-peach-400 bg-peach-50 text-peach-700'
                        : 'border-cream-200 text-cream-600 hover:border-peach-200'
                    )}
                  >
                    <p className="font-medium">{opt.label}</p>
                    <p className="opacity-70 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {installType === 'project' && (
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

            {(installType === 'project' || installType === 'global') && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-cream-700">目标工具</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {TOOLS.map((tool) => (
                    <button
                      key={tool}
                      onClick={() => setSelectedTool(tool)}
                      className={cn(
                        'flex flex-col items-center gap-1 py-2 rounded-lg border-2 text-[10px] transition-all',
                        selectedTool === tool
                          ? 'border-peach-400 bg-peach-50 text-peach-700'
                          : 'border-cream-200 text-cream-500 hover:border-peach-200'
                      )}
                    >
                      <ToolIcon tool={tool} size={20} />
                      {toolNames[tool]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallDialog(null)}>取消</Button>
            <Button
              className="bg-peach-500 hover:bg-peach-600 text-white"
              disabled={
                installing !== null ||
                (installType === 'project' && !selectedProject)
              }
              onClick={handleInstall}
            >
              {installing !== null
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 安装中...</>
                : '确认安装到数据库'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
