import { useState, useCallback, useEffect } from 'react'
import {
  Search, Loader2, ExternalLink, Download, Globe,
  Flame, Layout, Server, GitBranch, Brain, Smartphone,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { skillsShApi } from '@/lib/tauri-api'
import type { SkillsShSearchResult, RepoSkillEntry, RepoTreeResult, SkillCategoryData } from '@/lib/tauri-api'
import InstallWizard from '@/components/skillssh/InstallWizard'
import { toast } from 'sonner'

export default function SkillsShSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SkillsShSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  // Install wizard state
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardOwnerRepo, setWizardOwnerRepo] = useState('')
  const [wizardSkillName, setWizardSkillName] = useState('')
  const [wizardSkillEntry, setWizardSkillEntry] = useState<RepoSkillEntry | null>(null)
  const [wizardInstalls, setWizardInstalls] = useState(0)
  const [loadingTree, setLoadingTree] = useState<string | null>(null)
  const [categories, setCategories] = useState<SkillCategoryData[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [browseResults, setBrowseResults] = useState<SkillsShSearchResult[]>([])
  const [browsing, setBrowsing] = useState(false)

  const iconMap: Record<string, typeof Flame> = {
    flame: Flame, layout: Layout, server: Server,
    'git-branch': GitBranch, brain: Brain, smartphone: Smartphone,
  }

  useEffect(() => {
    skillsShApi.getCategories().then(setCategories).catch(() => {})
  }, [])

  const handleBrowseCategory = async (catId: string) => {
    setActiveCategory(catId)
    setBrowsing(true)
    try {
      console.log(`[SkillsShSearch] 浏览分类: ${catId}`)
      const result = await skillsShApi.browsePopular(catId)
      console.log(`[SkillsShSearch] 分类 ${catId} 返回 ${result.total} 条`)
      setBrowseResults(result.skills)
    } catch (e) {
      console.error('[SkillsShSearch] 浏览失败:', e)
      toast.error('加载分类失败: ' + String(e))
    } finally {
      setBrowsing(false)
    }
  }

  const handleSearch = useCallback(async () => {
    if (query.trim().length < 2) {
      toast.error('搜索关键词至少需要 2 个字符')
      return
    }
    setSearching(true)
    setSearched(true)
    try {
      console.log(`[SkillsShSearch] 搜索: ${query}`)
      const data = await skillsShApi.search(query.trim())
      setResults(data)
      console.log(`[SkillsShSearch] 返回 ${data.length} 条结果`)
    } catch (e) {
      console.error('[SkillsShSearch] 搜索失败:', e)
      toast.error('搜索失败: ' + String(e))
    } finally {
      setSearching(false)
    }
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleInstallClick = async (item: SkillsShSearchResult) => {
    setLoadingTree(item.id)
    try {
      // Parse owner/repo from source field
      const ownerRepo = item.source
      console.log(`[SkillsShSearch] 获取仓库树: ${ownerRepo}`)
      const tree: RepoTreeResult = await skillsShApi.getRepoTree(ownerRepo)

      // Find the matching skill entry
      const skillEntry = tree.skills.find((s) => {
        const parts = s.skill_path.split('/')
        const entryName = parts[parts.length - 1]
        return entryName === item.skill_id || s.skill_path.endsWith(item.skill_id)
      })

      if (!skillEntry) {
        toast.error(`在仓库 ${ownerRepo} 中未找到 Skill: ${item.skill_id}`)
        return
      }

      setWizardOwnerRepo(ownerRepo)
      setWizardSkillName(item.skill_id)
      setWizardSkillEntry(skillEntry)
      setWizardInstalls(item.installs)
      setWizardOpen(true)
    } catch (e) {
      console.error('[SkillsShSearch] 获取仓库树失败:', e)
      toast.error('获取 Skill 详情失败: ' + String(e))
    } finally {
      setLoadingTree(null)
    }
  }

  const formatInstalls = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="space-y-6">
      {/* 搜索框 */}
      <div className="text-center space-y-4">
        <div className="flex items-center gap-2 justify-center text-cream-500 text-sm">
          <Globe className="h-4 w-4" />
          <span>搜索 skills.sh 在线仓库</span>
        </div>
        <div className="relative max-w-lg mx-auto flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-cream-400" />
            <Input
              placeholder="搜索 Skill（如 react, tailwind, python...）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-12 h-12 rounded-full border-cream-300 shadow-card text-base"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={searching || query.trim().length < 2}
            className="h-12 px-6 rounded-full bg-peach-500 hover:bg-peach-600 text-white"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
          </Button>
        </div>
      </div>

      {/* 搜索结果 */}
      <AnimatePresence mode="wait">
        {searching && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-12"
          >
            <Loader2 className="h-8 w-8 text-peach-400 animate-spin mx-auto" />
            <p className="text-sm text-cream-500 mt-3">正在搜索 skills.sh...</p>
          </motion.div>
        )}

        {!searching && results.length > 0 && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-sm text-cream-500 mb-4">找到 {results.length} 个 Skill</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                  whileHover={{ scale: 1.02 }}
                >
                  <Card className="border border-cream-200 shadow-card hover:shadow-card-hover transition-shadow h-full">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-cream-800 truncate">{item.name}</h3>
                          <p className="text-xs text-cream-500 mt-1 truncate">{item.source}</p>
                        </div>
                        <Badge variant="outline" className="bg-lavender-100 text-lavender-400 text-xs shrink-0 ml-2">
                          skills.sh
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-xs text-cream-400">
                          <Download className="h-3 w-3 inline mr-1" />
                          {formatInstalls(item.installs)} 次安装
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => window.open(`https://skills.sh/${item.id}`, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            className="text-xs h-7 bg-peach-500 hover:bg-peach-600 text-white"
                            onClick={() => handleInstallClick(item)}
                            disabled={loadingTree === item.id}
                          >
                            {loadingTree === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Download className="h-3 w-3 mr-1" />
                            )}
                            安装
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {!searching && searched && results.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-lg font-display font-bold text-cream-700 mb-2">没有找到匹配的 Skill</h2>
            <p className="text-cream-500">试试其他关键词</p>
          </motion.div>
        )}

        {!searching && !searched && (
          <motion.div
            key="initial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* 分类浏览 */}
            <div className="flex flex-wrap gap-2 justify-center">
              {categories.map((cat) => {
                const Icon = iconMap[cat.icon] ?? Globe
                return (
                  <Button
                    key={cat.id}
                    variant={activeCategory === cat.id ? 'default' : 'outline'}
                    size="sm"
                    className={activeCategory === cat.id
                      ? 'rounded-full bg-peach-500 hover:bg-peach-600 text-white'
                      : 'rounded-full border-cream-300 hover:bg-cream-100'
                    }
                    onClick={() => handleBrowseCategory(cat.id)}
                    disabled={browsing}
                  >
                    <Icon className="h-3.5 w-3.5 mr-1" /> {cat.name}
                  </Button>
                )
              })}
            </div>

            {/* 浏览结果 */}
            {browsing && (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 text-peach-400 animate-spin mx-auto" />
                <p className="text-sm text-cream-500 mt-2">加载中...</p>
              </div>
            )}

            {!browsing && browseResults.length > 0 && (
              <div>
                <p className="text-sm text-cream-500 mb-4">
                  {categories.find((c) => c.id === activeCategory)?.name ?? ''} 热门 Skill（{browseResults.length} 个）
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {browseResults.slice(0, 30).map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <Card className="border border-cream-200 shadow-card hover:shadow-card-hover transition-shadow h-full">
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-cream-800 truncate">{item.name}</h3>
                              <p className="text-xs text-cream-500 mt-1 truncate">{item.source}</p>
                            </div>
                            <Badge variant="outline" className="bg-lavender-100 text-lavender-400 text-xs shrink-0 ml-2">
                              {formatInstalls(item.installs)}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between pt-2">
                            <span className="text-xs text-cream-400">
                              <Download className="h-3 w-3 inline mr-1" />
                              {formatInstalls(item.installs)} 次安装
                            </span>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="text-xs h-7"
                                onClick={() => window.open(`https://skills.sh/${item.id}`, '_blank')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              <Button size="sm" className="text-xs h-7 bg-peach-500 hover:bg-peach-600 text-white"
                                onClick={() => handleInstallClick(item)} disabled={loadingTree === item.id}>
                                {loadingTree === item.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                                安装
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {!browsing && browseResults.length === 0 && !activeCategory && (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">🌐</div>
                <h2 className="text-lg font-display font-bold text-cream-700 mb-2">搜索或浏览 skills.sh</h2>
                <p className="text-cream-500">输入关键词搜索，或点击上方分类浏览热门 Skill</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 安装向导 */}
      <InstallWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        ownerRepo={wizardOwnerRepo}
        skillName={wizardSkillName}
        skillEntry={wizardSkillEntry}
        installs={wizardInstalls}
      />
    </div>
  )
}
