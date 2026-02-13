import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, Download, ArrowRight, AlertTriangle,
  ChevronDown, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn, sourceLabels } from '@/lib/utils'
import { toast } from 'sonner'

interface UpdateItem {
  id: string
  name: string
  currentVersion: string
  newVersion: string
  source: 'skills-sh' | 'github' | 'gitee'
  locallyModified: boolean
  deployCount: number
  selected: boolean
}

const mockUpdates: UpdateItem[] = [
  { id: 'u1', name: 'tailwindcss', currentVersion: '2.0.0', newVersion: '2.1.0', source: 'skills-sh', locallyModified: false, deployCount: 3, selected: false },
  { id: 'u2', name: 'skill-creator', currentVersion: '2.0.0', newVersion: '2.2.0', source: 'skills-sh', locallyModified: true, deployCount: 1, selected: false },
  { id: 'u3', name: 'gsap-react', currentVersion: '1.1.0', newVersion: '1.3.0', source: 'github', locallyModified: false, deployCount: 2, selected: false },
]

export default function UpdateManager() {
  const [updates, setUpdates] = useState<UpdateItem[]>(mockUpdates)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [updateScope, setUpdateScope] = useState('all')
  const [modifiedAlert, setModifiedAlert] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const handleCheck = () => {
    setChecking(true)
    toast.promise(new Promise((r) => setTimeout(r, 3000)), {
      loading: '正在检查 skills.sh 和 Git 仓库...',
      success: () => { setChecking(false); return `发现 ${updates.length} 个可用更新` },
      error: () => { setChecking(false); return '检查失败' },
    })
  }

  const handleUpdate = (id: string) => {
    const item = updates.find((u) => u.id === id)
    if (item?.locallyModified) { setModifiedAlert(id); return }
    doUpdate(id)
  }

  const doUpdate = (id: string) => {
    setUpdating(id)
    setTimeout(() => {
      setUpdating(null)
      setUpdates((prev) => prev.filter((u) => u.id !== id))
      toast.success('更新成功')
    }, 2000)
  }

  const handleBatchUpdate = () => {
    const selected = updates.filter((u) => u.selected)
    if (selected.length === 0) { toast.error('请先选中要更新的 Skill'); return }
    setBatchUpdating(true)
    setBatchProgress(0)
    const step = 100 / selected.length
    let i = 0
    const iv = setInterval(() => {
      i++
      setBatchProgress(Math.min(i * step, 100))
      if (i >= selected.length) {
        clearInterval(iv)
        setBatchUpdating(false)
        setUpdates((prev) => prev.filter((u) => !u.selected))
        toast.success(`已更新 ${selected.length} 个 Skill`)
      }
    }, 1500)
  }

  const toggleSelect = (id: string) => {
    setUpdates((prev) => prev.map((u) => u.id === id ? { ...u, selected: !u.selected } : u))
  }

  const toggleAll = () => {
    const allSelected = updates.every((u) => u.selected)
    setUpdates((prev) => prev.map((u) => ({ ...u, selected: !allSelected })))
  }

  const selectedCount = updates.filter((u) => u.selected).length

  return (
    <div className="space-y-6">
      {/* 顶部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-cream-800">更新管理</h1>
          <p className="text-sm text-cream-500 mt-1">上次检查：5 分钟前 · 每日自动检测</p>
        </div>
        <Button onClick={handleCheck} disabled={checking} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
          <RefreshCw className={cn('h-4 w-4 mr-1', checking && 'animate-spin')} /> {checking ? '检查中...' : '立即检查更新'}
        </Button>
      </div>

      {/* 批量更新进度 */}
      {batchUpdating && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
          <Progress value={batchProgress} className="h-3" />
          <p className="text-sm text-cream-500 text-center">正在批量更新...</p>
        </motion.div>
      )}

      {/* 可更新列表 */}
      {updates.length > 0 ? (
        <>
          {/* 批量操作栏 */}
          <div className="flex items-center gap-3">
            <Checkbox checked={updates.every((u) => u.selected)} onCheckedChange={toggleAll} />
            <span className="text-sm text-cream-600">全选</span>
            <Button onClick={handleBatchUpdate} disabled={selectedCount === 0 || batchUpdating}
              className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl ml-2">
              批量更新选中 ({selectedCount})
            </Button>
            <Select value={updateScope} onValueChange={setUpdateScope}>
              <SelectTrigger className="w-44 border-cream-300 ml-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lib">仅本地 Skill 库</SelectItem>
                <SelectItem value="all">本地 + 所有部署</SelectItem>
                <SelectItem value="custom">自定义选择</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {updates.map((item) => {
                const src = sourceLabels[item.source]
                return (
                  <motion.div
                    key={item.id}
                    layout
                    exit={{ opacity: 0, scale: 0.9, height: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="update-card"
                  >
                    <Card className={cn(
                      'border shadow-card hover:shadow-card-hover transition-shadow',
                      item.locallyModified ? 'border-l-[3px] border-l-honey-400 border-cream-200' : 'border-cream-200'
                    )}>
                      <CardContent className="flex items-center gap-4 p-5">
                        <Checkbox checked={item.selected} onCheckedChange={() => toggleSelect(item.id)} />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-cream-800">{item.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-cream-500">v{item.currentVersion}</span>
                            <ArrowRight className="h-3 w-3 text-peach-300" />
                            <span className="text-xs font-bold text-peach-600">v{item.newVersion}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn('text-xs', src.bg, src.text)}>{src.label}</Badge>
                        {item.locallyModified && (
                          <Badge variant="outline" className="bg-honey-100 text-honey-500 text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" /> 本地已修改
                          </Badge>
                        )}
                        <span className="text-xs text-cream-400">已部署到 {item.deployCount} 个位置</span>
                        <Button
                          onClick={() => handleUpdate(item.id)}
                          disabled={updating === item.id}
                          className="bg-peach-500 hover:bg-peach-600 text-white rounded-lg text-sm"
                        >
                          {updating === item.id ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                          {updating === item.id ? '更新中...' : '更新'}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-20">
          <div className="text-6xl mb-4">😺🛋️</div>
          <h2 className="text-xl font-display font-bold text-cream-700 mb-2">所有 Skill 都是最新版本～</h2>
          <p className="text-cream-500">上次检查：刚刚</p>
        </motion.div>
      )}

      {/* 更新历史 */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <Card className="border border-cream-200">
          <CollapsibleTrigger asChild>
            <CardContent className="flex items-center justify-between p-4 cursor-pointer hover:bg-cream-50">
              <h2 className="font-display font-semibold text-cream-800">最近更新记录</h2>
              <motion.div animate={{ rotate: historyOpen ? 180 : 0 }}>
                <ChevronDown className="h-4 w-4 text-cream-400" />
              </motion.div>
            </CardContent>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-cream-200 divide-y divide-cream-100">
              {[
                { name: 'framer-motion-animator', from: '0.9.0', to: '1.0.0', source: 'skills-sh', time: '3 天前', status: 'success' },
                { name: 'zustand-state-management', from: '0.8.0', to: '1.0.0', source: 'skills-sh', time: '1 周前', status: 'success' },
              ].map((item) => (
                <div key={item.name} className="flex items-center gap-4 px-5 py-3">
                  <Check className="h-4 w-4 text-mint-500" />
                  <span className="font-medium text-cream-800">{item.name}</span>
                  <span className="text-xs text-cream-500">v{item.from} → v{item.to}</span>
                  <Badge variant="secondary" className="text-[10px]">{item.source}</Badge>
                  <span className="text-xs text-cream-400 ml-auto">{item.time}</span>
                  <Badge variant="outline" className="bg-mint-100 text-mint-500 text-xs">成功</Badge>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 本地已修改确认 */}
      <AlertDialog open={!!modifiedAlert} onOpenChange={() => setModifiedAlert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>此 Skill 本地有修改</AlertDialogTitle>
            <AlertDialogDescription>更新将覆盖本地修改，你确定要继续吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="outline" onClick={() => { setModifiedAlert(null); toast.info('请在 Diff 视图中合并') }}>合并</Button>
            <AlertDialogAction onClick={() => { doUpdate(modifiedAlert!); setModifiedAlert(null) }} className="bg-strawberry-500 hover:bg-strawberry-400">
              覆盖本地修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
