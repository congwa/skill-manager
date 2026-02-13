import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Star, Download, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn, toolNames } from '@/lib/utils'
import type { StoreSkill } from '@/types'
import { mockStoreSkills } from '@/mock/data'
import { toast } from 'sonner'

const categories = ['全部', 'Frontend', 'Backend', 'Testing', 'DevOps', 'Database']

export default function SkillsStore() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const topSkills = [...mockStoreSkills].sort((a, b) => b.install_count - a.install_count).slice(0, 5)

  const filtered = mockStoreSkills.filter((s) => {
    const matchSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchCategory = activeCategory === '全部' || s.category === activeCategory
    return matchSearch && matchCategory
  })

  const handleInstall = (skill: StoreSkill) => {
    setInstalling(skill.id)
    toast.promise(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          setInstalling(null)
          setInstalled((prev) => new Set(prev).add(skill.id))
          resolve()
        }, 2000)
      }),
      {
        loading: `正在安装 ${skill.name}...`,
        success: `${skill.name} 安装成功！`,
        error: '安装失败',
      }
    )
  }

  return (
    <div className="space-y-8">
      {/* 大搜索框 */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-display font-bold text-cream-800">Skill 仓库</h1>
        <p className="text-cream-500">发现和安装社区 Skill</p>
        <div className="relative max-w-lg mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-cream-400" />
          <Input
            placeholder="搜索 Skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 rounded-full border-cream-300 shadow-card text-base"
          />
        </div>
      </div>

      {/* 排行榜 */}
      {!searchQuery && (
        <div>
          <h2 className="text-lg font-display font-bold text-cream-800 mb-4">🔥 热门 Skill</h2>
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4">
              {topSkills.map((skill, i) => (
                <motion.div
                  key={skill.id}
                  className="store-card shrink-0 w-64"
                  whileHover={{ scale: 1.03, y: -4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Card className="border border-cream-200 shadow-card hover:shadow-card-hover transition-shadow h-full">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="bg-peach-100 text-peach-700 text-xs">#{i + 1}</Badge>
                        <div className="flex items-center gap-1 text-honey-500">
                          <Star className="h-3 w-3 fill-current" />
                          <span className="text-xs font-medium">{skill.rating}</span>
                        </div>
                      </div>
                      <h3 className="font-semibold text-cream-800">{skill.name}</h3>
                      <p className="text-xs text-cream-500 line-clamp-2">{skill.description}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {skill.compatible_tools.slice(0, 3).map((tool) => (
                          <span key={tool} className="text-[10px] bg-cream-100 text-cream-600 px-1.5 py-0.5 rounded">
                            {toolNames[tool]}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-cream-400">{(skill.install_count / 1000).toFixed(1)}k 安装</span>
                        {installed.has(skill.id) ? (
                          <Badge className="bg-mint-100 text-mint-500"><Check className="h-3 w-3 mr-1" /> 已安装</Badge>
                        ) : skill.has_update ? (
                          <Button size="sm" variant="outline" className="text-xs h-7 border-peach-300 text-peach-600"
                            onClick={() => handleInstall(skill)} disabled={installing === skill.id}>
                            更新
                          </Button>
                        ) : (
                          <Button size="sm" className="text-xs h-7 bg-peach-500 hover:bg-peach-600 text-white"
                            onClick={() => handleInstall(skill)} disabled={installing === skill.id}>
                            {installing === skill.id ? '安装中...' : '安装'}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* 分类标签 */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={activeCategory === cat ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'rounded-full text-xs',
              activeCategory === cat ? 'bg-peach-500 hover:bg-peach-600 text-white' : 'border-cream-300'
            )}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Skill 列表网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((skill) => (
          <motion.div key={skill.id} className="category-card" whileHover={{ scale: 1.02 }}>
            <Card className="border border-cream-200 shadow-card hover:shadow-card-hover transition-shadow h-full">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-cream-800">{skill.name}</h3>
                    <p className="text-xs text-cream-500 mt-1">{skill.description}</p>
                  </div>
                  <Badge variant="outline" className="bg-lavender-50 text-lavender-400 text-xs shrink-0">
                    v{skill.version}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {skill.compatible_tools.map((tool) => (
                    <span key={tool} className="text-[10px] bg-cream-100 text-cream-600 px-1.5 py-0.5 rounded">
                      {toolNames[tool]}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-honey-500">
                      <Star className="h-3 w-3 fill-current" />
                      <span className="text-xs">{skill.rating}</span>
                    </div>
                    <span className="text-xs text-cream-400">{(skill.install_count / 1000).toFixed(1)}k</span>
                    <Badge variant="secondary" className="bg-cream-100 text-cream-600 text-[10px]">{skill.category}</Badge>
                  </div>
                  {installed.has(skill.id) ? (
                    <Badge className="bg-mint-100 text-mint-500 text-xs"><Check className="h-3 w-3 mr-1" /> 已安装</Badge>
                  ) : (
                    <Button size="sm" className="text-xs h-7 bg-peach-500 hover:bg-peach-600 text-white"
                      onClick={() => handleInstall(skill)} disabled={installing === skill.id}>
                      <Download className="h-3 w-3 mr-1" /> {installing === skill.id ? '安装中...' : '安装'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-lg font-display font-bold text-cream-700 mb-2">没有找到匹配的 Skill</h2>
          <p className="text-cream-500">试试其他关键词或分类</p>
        </div>
      )}
    </div>
  )
}
