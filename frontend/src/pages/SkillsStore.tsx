import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Download, Loader2, CheckCircle2, AlertCircle, RefreshCw,
  Globe, Package, ChevronLeft, ChevronRight, ExternalLink, FileText, Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
import { catalogApi, skillsShApi } from '@/lib/tauri-api'
import type { CatalogSkill, RemoteUpdateInfo, SkillsShItem } from '@/lib/tauri-api'
import { toast } from 'sonner'
import type { ToolName } from '@/types'

const TOOLS: ToolName[] = ['windsurf', 'cursor', 'claude-code', 'codex', 'trae']
const PAGE_SIZE = 12

const CATEGORY_LABELS: Record<string, string> = {
  development: '开发',
  data: '数据',
  documents: '文档',
  automation: '自动化',
  ai: 'AI',
  productivity: '效率',
  communication: '沟通',
}

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

function QualityBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-mint-400' : score >= 60 ? 'bg-honey-400' : 'bg-cream-300'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-cream-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-cream-400 shrink-0">{score}</span>
    </div>
  )
}

export default function SkillsStore() {
  const { skills, fetchSkills, fetchDeployments } = useSkillStore()
  const projects = useProjectStore((s) => s.projects)

  // ── 搜索模式 ──
  const [useSkillsSh, setUseSkillsSh] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<CatalogSkill[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [page, setPage] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState('')

  const [catalogSkills, setCatalogSkills] = useState<CatalogSkill[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)

  const [remoteUpdates, setRemoteUpdates] = useState<RemoteUpdateInfo[]>([])
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  // skills.sh 搜索结果
  const [skillsShResults, setSkillsShResults] = useState<SkillsShItem[]>([])

  // skills.sh 详情 Sheet
  const [skillsShDetailItem, setSkillsShDetailItem] = useState<SkillsShItem | null>(null)

  const [skillsShInstalling, setSkillsShInstalling] = useState(false)

  // 详情抽屉（catalog 模式）
  const [detailSkill, setDetailSkill] = useState<CatalogSkill | null>(null)
  const [detailContent, setDetailContent] = useState<string | null>(null)
  const [detailMeta, setDetailMeta] = useState<SkillMeta>({})
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailInstalls, setDetailInstalls] = useState<number | null>(null)
  const [loadingInstalls, setLoadingInstalls] = useState(false)

  // 安装对话框
  const [installDialog, setInstallDialog] = useState<CatalogSkill | null>(null)
  const [installType, setInstallType] = useState<'db-only' | 'project' | 'global'>('db-only')
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTool, setSelectedTool] = useState<ToolName>('cursor')
  const [installing, setInstalling] = useState<string | null>(null)

  useEffect(() => {
    loadCatalog()
    checkUpdates()
  }, [])

  useEffect(() => { setPage(0) }, [hasSearched, searchResults, catalogSkills, selectedCategory])

  const loadCatalog = async () => {
    setLoadingCatalog(true)
    try {
      const result = await catalogApi.fetch()
      setCatalogSkills(result)
    } catch { /* 网络不可用时静默失败 */ }
    finally { setLoadingCatalog(false) }
  }

  const checkUpdates = async () => {
    setCheckingUpdates(true)
    try {
      const updates = await catalogApi.checkUpdates()
      setRemoteUpdates(updates)
    } catch { /* 静默失败 */ }
    finally { setCheckingUpdates(false) }
  }

  // 从 catalog 数据中提取实际出现的分类
  const availableCategories = useMemo(() => {
    const cats = new Set(catalogSkills.map(s => s.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [catalogSkills])

  const filteredSkills = useMemo(() => {
    if (!selectedCategory) return catalogSkills
    return catalogSkills.filter(s => s.category === selectedCategory)
  }, [catalogSkills, selectedCategory])

  const displaySkills = hasSearched ? searchResults : filteredSkills
  const totalPages = Math.ceil(displaySkills.length / PAGE_SIZE)
  const paginatedSkills = useMemo(
    () => displaySkills.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [displaySkills, page]
  )
  const pendingUpdates = remoteUpdates.filter((u) => u.has_update)

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    if (useSkillsSh) {
      // skills.sh 搜索模式
      setSearching(true)
      setHasSearched(true)
      try {
        const results = await skillsShApi.search(searchQuery.trim())
        setSkillsShResults(results)
      } catch (e) {
        toast.error('skills.sh 搜索失败: ' + String(e))
      } finally {
        setSearching(false)
      }
      return
    }

    setSearching(true)
    setHasSearched(true)
    try {
      const results = await catalogApi.search(searchQuery.trim())
      setSearchResults(results)
    } catch (e) {
      toast.error('搜索失败: ' + String(e))
    } finally {
      setSearching(false)
    }
  }

  const handleSkillsShInstall = async (item: SkillsShItem) => {
    const loadingId = toast.loading(`正在从 skills.sh 安装 ${item.name}...`)
    setSkillsShInstalling(true)
    try {
      await skillsShApi.install({
        source: item.source,
        skillId: item.skillId || item.name,
        deployTargets: [],
        forceOverwrite: false,
      })
      await fetchSkills()
      await fetchDeployments()
      toast.success(`${item.name} 已安装到数据库`, { id: loadingId })
      setSkillsShDetailItem(null)
    } catch (e) {
      toast.error('安装失败: ' + String(e), { id: loadingId })
    } finally {
      setSkillsShInstalling(false)
    }
  }

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat)
    setHasSearched(false)
    setSearchQuery('')
    setSearchResults([])
    // 静默预热安装量缓存（不阻塞 UI）
    if (cat) {
      catalogApi.enrichBatchByCategory(cat).catch(() => {})
    }
  }

  const isInstalled = (skillName: string) =>
    skills.some((s) => s.name.toLowerCase() === skillName.toLowerCase())

  const getUpdateInfo = (skillName: string) =>
    remoteUpdates.find((u) => u.skill_name.toLowerCase() === skillName.toLowerCase())

  const handleOpenDetail = async (skill: CatalogSkill) => {
    setDetailSkill(skill)
    setDetailContent(null)
    setDetailMeta({})
    setDetailInstalls(null)
    setLoadingDetail(true)
    setLoadingInstalls(true)

    // 并行：拉 SKILL.md + 查安装量（安装量读缓存优先，过期才调 skills.sh）
    const [mdResult, installsResult] = await Promise.allSettled([
      fetch(skill.skill_md_url).then(r => r.ok ? r.text() : null),
      catalogApi.enrichSingle(skill.name, skill.source_repo),
    ])

    setLoadingDetail(false)
    setLoadingInstalls(false)

    if (mdResult.status === 'fulfilled' && mdResult.value) {
      const { meta, body } = parseFrontmatter(mdResult.value)
      setDetailMeta(meta)
      setDetailContent(body)
    }

    if (installsResult.status === 'fulfilled') {
      setDetailInstalls(installsResult.value ?? null)
    }
  }

  const handleInstall = async () => {
    if (!installDialog) return
    const skill = installDialog
    const loadingId = toast.loading(`正在安装 ${skill.name}...`)
    setInstalling(skill.name)
    try {
      const deployTargets =
        installType === 'project' && selectedProject
          ? [{ project_id: selectedProject, tool: selectedTool }]
          : installType === 'global'
          ? [{ project_id: null, tool: selectedTool }]
          : []

      const result = await catalogApi.install({
        sourceRepo: skill.source_repo,
        sourcePath: skill.source_path,
        skillName: skill.name,
        commitSha: skill.commit_sha,
        deployTargets,
        forceOverwrite: false,
      })

      await fetchSkills()
      await fetchDeployments()
      const newUpdates = await catalogApi.checkUpdates()
      setRemoteUpdates(newUpdates)

      const msg = deployTargets.length > 0
        ? `${skill.name} 已安装到数据库并部署 ${result.deployments_created} 个位置`
        : `${skill.name} 已安装到数据库`
      toast.success(result.conflict ? `${skill.name} 已更新数据库记录（本地已存在）` : msg, { id: loadingId })
      setInstallDialog(null)
    } catch (e) {
      toast.error('安装失败: ' + String(e), { id: loadingId })
    } finally {
      setInstalling(null)
    }
  }

  const handleApplyUpdate = async (updateInfo: RemoteUpdateInfo) => {
    const loadingId = toast.loading(`正在更新 ${updateInfo.skill_name}...`)
    try {
      // 优先从 catalog 找最新版本
      const catalogSkill = catalogSkills.find(
        s => s.name.toLowerCase() === updateInfo.skill_name.toLowerCase()
          || s.source_repo === updateInfo.owner_repo
      )

      if (!catalogSkill) {
        toast.error(`无法在商城 catalog 中找到 ${updateInfo.skill_name}`, { id: loadingId })
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
      const newUpdates = await catalogApi.checkUpdates()
      setRemoteUpdates(newUpdates)
      toast.success(`${updateInfo.skill_name} 已更新到数据库`, { id: loadingId })
    } catch (e) {
      toast.error('更新失败: ' + String(e), { id: loadingId })
    }
  }

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-cream-800">商城</h1>
          <p className="text-sm text-cream-500 mt-0.5">
            从 Skill 商城安装到本地数据库
            {catalogSkills.length > 0 && (
              <span className="ml-2 text-cream-400">· {catalogSkills.length} 个可用</span>
            )}
          </p>
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
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-400" />
            <Input
              placeholder={useSkillsSh ? '从 skills.sh 搜索 Skill...' : '搜索 Skill 名称、描述、标签...'}
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
          {(hasSearched || skillsShResults.length > 0) && (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setHasSearched(false)
                setSearchQuery('')
                setSearchResults([])
                setSkillsShResults([])
              }}
            >
              清除
            </Button>
          )}
        </div>
        {/* skills.sh 模式切换 */}
        <div className="flex items-center gap-2">
          <Switch
            id="skills-sh-toggle"
            checked={useSkillsSh}
            onCheckedChange={(v) => {
              setUseSkillsSh(v)
              setHasSearched(false)
              setSearchResults([])
              setSkillsShResults([])
            }}
          />
          <Label htmlFor="skills-sh-toggle" className="text-xs text-cream-500 cursor-pointer flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-peach-400" />
            从 skills.sh 搜索
          </Label>
          {useSkillsSh && (
            <span className="text-[10px] px-1.5 py-0.5 bg-peach-50 text-peach-500 border border-peach-200 rounded-full">
              实时搜索全球 Skill 目录
            </span>
          )}
        </div>
      </div>

      {/* 分类 Tab */}
      {!hasSearched && availableCategories.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleCategoryChange('')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all',
              !selectedCategory
                ? 'bg-peach-500 text-white'
                : 'bg-cream-100 text-cream-600 hover:bg-cream-200'
            )}
          >
            全部
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                selectedCategory === cat
                  ? 'bg-peach-500 text-white'
                  : 'bg-cream-100 text-cream-600 hover:bg-cream-200'
              )}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      )}

      {/* skills.sh 搜索结果列表 */}
      {useSkillsSh && (hasSearched || skillsShResults.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-cream-700 flex items-center gap-2">
              <Globe className="h-4 w-4 text-peach-400" />
              skills.sh 搜索结果（{skillsShResults.length}）
            </h2>
          </div>
          {searching ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 text-peach-400 animate-spin mx-auto" />
              <p className="text-sm text-cream-400 mt-3">正在从 skills.sh 搜索...</p>
            </div>
          ) : skillsShResults.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-cream-400">没有找到匹配的 Skill，换个关键词试试</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {skillsShResults.map((item, i) => {
                const installed = isInstalled(item.name)
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: i * 0.02 } }}
                    className="h-full"
                  >
                    <Card
                      className="border border-cream-200 transition-all hover:shadow-md cursor-pointer h-full group flex flex-col"
                      onClick={() => setSkillsShDetailItem(item)}
                    >
                      <CardContent className="p-4 flex flex-col gap-2.5 h-full">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-cream-800 text-sm leading-snug group-hover:text-peach-600 transition-colors min-w-0 flex-1">
                            {item.name}
                          </h3>
                          {installed && (
                            <Badge variant="outline" className="text-[10px] bg-mint-50 text-mint-500 border-mint-200 px-1.5 h-5 shrink-0">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> 已安装
                            </Badge>
                          )}
                        </div>

                        <p className="text-[10px] text-cream-400 font-mono truncate">{item.source}</p>

                        {item.description && (
                          <p className="text-xs text-cream-600 leading-relaxed line-clamp-2 flex-1">
                            {item.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-cream-100 mt-auto">
                          <span className="text-[10px] text-cream-400 flex items-center gap-1">
                            <Package className="h-2.5 w-2.5" />
                            {item.installs > 0 ? item.installs.toLocaleString() + ' 次安装' : '—'}
                          </span>
                          <div onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              className={cn(
                                'text-xs h-7 rounded-lg',
                                installed
                                  ? 'bg-cream-100 text-cream-500 hover:bg-cream-200'
                                  : 'bg-peach-500 hover:bg-peach-600 text-white'
                              )}
                              onClick={() => setSkillsShDetailItem(item)}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              {installed ? '重装' : '安装'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Skill 列表（catalog 模式） */}
      {!useSkillsSh && <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-cream-700 flex items-center gap-2">
            <Globe className="h-4 w-4 text-cream-400" />
            {hasSearched
              ? `搜索结果（${searchResults.length}）`
              : selectedCategory
                ? `${CATEGORY_LABELS[selectedCategory] ?? selectedCategory}（${filteredSkills.length}）`
                : `全部 Skill（${catalogSkills.length}）`}
          </h2>
          {totalPages > 1 && (
            <span className="text-xs text-cream-400">
              第 {page + 1} / {totalPages} 页
            </span>
          )}
        </div>

        {(loadingCatalog || searching) ? (
          <div className="text-center py-16">
            <Loader2 className="h-8 w-8 text-peach-400 animate-spin mx-auto" />
            <p className="text-sm text-cream-400 mt-3">
              {loadingCatalog ? '正在拉取 Skill 商城数据...' : '搜索中...'}
            </p>
          </div>
        ) : displaySkills.length === 0 && hasSearched ? (
          <div className="text-center py-16">
            <p className="text-cream-400">没有找到匹配的 Skill，换个关键词试试</p>
          </div>
        ) : displaySkills.length === 0 && !loadingCatalog ? (
          <div className="text-center py-16">
            <Globe className="h-10 w-10 text-cream-200 mx-auto mb-3" />
            <p className="text-cream-400 text-sm">暂无数据</p>
            <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={loadCatalog}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> 重新加载
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {paginatedSkills.map((skill, i) => {
                const installed = isInstalled(skill.name)
                const updateInfo = getUpdateInfo(skill.name)
                const hasUpdate = updateInfo?.has_update

                return (
                  <motion.div
                    key={skill.id || skill.name}
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
                      <CardContent className="p-4 flex flex-col gap-2.5 h-full">

                        {/* 第一行：名称 + 状态徽章 */}
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

                        {/* 第二行：分类 + 维护状态 */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {skill.category && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-lavender-100 text-lavender-600 rounded-full">
                              {CATEGORY_LABELS[skill.category] ?? skill.category}
                            </span>
                          )}
                          {skill.maintenance_status && (
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded-full',
                              skill.maintenance_status === 'active'
                                ? 'bg-mint-100 text-mint-600'
                                : 'bg-cream-100 text-cream-500'
                            )}>
                              {skill.maintenance_status === 'active' ? '活跃' : '维护中'}
                            </span>
                          )}
                          {skill.license && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-cream-100 text-cream-500 rounded-full">
                              {skill.license}
                            </span>
                          )}
                        </div>

                        {/* 第三行：描述 */}
                        <div className="flex-1 min-h-[40px]">
                          {skill.description ? (
                            <p className="text-xs text-cream-600 leading-relaxed line-clamp-2">
                              {skill.description}
                            </p>
                          ) : (
                            <p className="text-xs text-cream-300 italic">点击查看详情</p>
                          )}
                        </div>

                        {/* 第四行：标签 */}
                        {skill.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {skill.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-honey-50 text-honey-600 rounded-full border border-honey-200">
                                {tag}
                              </span>
                            ))}
                            {skill.tags.length > 3 && (
                              <span className="text-[9px] text-cream-400">+{skill.tags.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* 第五行：质量分 */}
                        <QualityBar score={skill.quality_score} />

                        {/* 第六行：来源 + 按钮 */}
                        <div className="flex items-center justify-between pt-1 border-t border-cream-100">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-cream-400 truncate">{skill.source_repo}</p>
                            <p className="text-[10px] text-cream-300 flex items-center gap-0.5 mt-0.5">
                              <Package className="h-2.5 w-2.5" />
                              {skill.installs != null ? skill.installs.toLocaleString() + ' 次安装' : '—'}
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
      </div>}

      {/* ── skills.sh 详情侧边抽屉 ── */}
      <Sheet
        open={!!skillsShDetailItem}
        onOpenChange={(open) => {
          if (!open) {
            setSkillsShDetailItem(null)
          }
        }}
      >
        <SheetContent className="w-[560px] sm:max-w-[560px] flex flex-col gap-0 p-0 overflow-hidden">
          {skillsShDetailItem && (
            <>
              <SheetHeader className="p-5 pb-3 border-b border-cream-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SheetTitle className="text-lg font-display">{skillsShDetailItem.name}</SheetTitle>
                    <SheetDescription className="mt-0.5 text-xs font-mono text-cream-400 truncate">
                      {skillsShDetailItem.source}
                    </SheetDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {isInstalled(skillsShDetailItem.name) && (
                      <Badge variant="outline" className="text-xs bg-mint-50 text-mint-500 border-mint-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> 已安装
                      </Badge>
                    )}
                    <span className="text-[10px] text-cream-400 flex items-center gap-1">
                      <Package className="h-2.5 w-2.5" />
                      {skillsShDetailItem.installs > 0
                        ? skillsShDetailItem.installs.toLocaleString() + ' 次安装'
                        : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={`https://skills.sh/${skillsShDetailItem.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-peach-500 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    在 skills.sh 查看
                  </a>
                </div>
              </SheetHeader>

              {/* skills.sh 页面 WebView 嵌入 */}
              <div className="flex-1 overflow-hidden">
                <iframe
                  src={`https://skills.sh/${skillsShDetailItem.id}`}
                  className="w-full h-full border-0"
                  title={`skills.sh - ${skillsShDetailItem.name}`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>

              {/* 底部安装操作 */}
              <div className="p-4 border-t border-cream-200 flex gap-2">
                <Button
                  className="flex-1 bg-peach-500 hover:bg-peach-600 text-white rounded-xl"
                  disabled={skillsShInstalling}
                  onClick={() => handleSkillsShInstall(skillsShDetailItem)}
                >
                  {skillsShInstalling ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> 安装中...</>
                  ) : (
                    <><Download className="h-4 w-4 mr-1.5" />
                      {isInstalled(skillsShDetailItem.name) ? '重新安装到数据库' : '从 skills.sh 安装到数据库'}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── 详情侧边抽屉 ── */}
      <Sheet
        open={!!detailSkill}
        onOpenChange={(open) => {
          if (!open) {
            setDetailSkill(null)
            setDetailMeta({})
            setDetailContent(null)
            setDetailInstalls(null)
          }
        }}
      >
        <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col gap-0 p-0 overflow-hidden">
          {detailSkill && (
            <>
              <SheetHeader className="p-6 pb-4 border-b border-cream-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SheetTitle className="text-xl font-display">{detailSkill.name}</SheetTitle>
                    <SheetDescription className="mt-1 text-xs font-mono text-cream-400 truncate">
                      {detailSkill.source_repo}
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

                {/* 分类 + 维护状态 + 许可 */}
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {detailSkill.category && (
                    <span className="text-xs px-2 py-0.5 bg-lavender-100 text-lavender-600 rounded-full font-medium">
                      {CATEGORY_LABELS[detailSkill.category] ?? detailSkill.category}
                    </span>
                  )}
                  {detailSkill.maintenance_status && (
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      detailSkill.maintenance_status === 'active'
                        ? 'bg-mint-100 text-mint-600'
                        : 'bg-cream-100 text-cream-500'
                    )}>
                      {detailSkill.maintenance_status === 'active' ? '活跃维护' : '维护中'}
                    </span>
                  )}
                  {detailSkill.license && (
                    <span className="text-xs px-2 py-0.5 bg-cream-100 text-cream-500 rounded-full">
                      {detailSkill.license}
                    </span>
                  )}
                </div>

                {/* 统计行 */}
                <div className="flex items-center gap-4 text-xs text-cream-500 mt-2">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-honey-400" />
                    质量分 {detailSkill.quality_score}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {loadingInstalls
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : detailInstalls != null
                        ? `${detailInstalls.toLocaleString()} 次安装`
                        : '安装量未知'
                    }
                  </span>
                  {detailSkill.compatibility && (
                    <span className="text-cream-400 truncate">
                      兼容 {detailSkill.compatibility}
                    </span>
                  )}
                </div>

                {/* 标签 */}
                {detailSkill.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {detailSkill.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-honey-50 text-honey-600 rounded-full border border-honey-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* GitHub 链接 */}
                <a
                  href={`https://github.com/${detailSkill.source_repo}/tree/main/${detailSkill.source_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-1 text-xs text-peach-500 hover:underline w-fit"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" /> 在 GitHub 查看
                </a>
              </SheetHeader>

              {/* SKILL.md 内容 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {loadingDetail ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-6 w-6 text-peach-400 animate-spin mx-auto" />
                    <p className="text-sm text-cream-400 mt-2">加载 Skill 详情...</p>
                  </div>
                ) : (detailContent || detailMeta.description || detailSkill.description) ? (
                  <>
                    {/* description：优先 frontmatter，其次 catalog */}
                    {(detailMeta.description || detailSkill.description) && (
                      <div className="bg-peach-50 border border-peach-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-peach-500 uppercase tracking-wide mb-1.5">适用场景</p>
                        <p className="text-sm text-cream-800 leading-relaxed">
                          {detailMeta.description ?? detailSkill.description}
                        </p>
                      </div>
                    )}

                    {/* triggers 关键词 */}
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

                    {/* 元信息 */}
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

                    {/* SKILL.md 正文 */}
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
                      href={`https://github.com/${detailSkill.source_repo}/tree/main/${detailSkill.source_path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-peach-500 hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> 在 GitHub 查看完整说明
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
