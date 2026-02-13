import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  GitBranch, CloudUpload, CloudDownload, ShieldCheck,
  BellRing, AlertTriangle, RefreshCw, Eye, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Progress } from '@/components/ui/progress'
import { useSyncStore } from '@/stores/useSyncStore'
import { cn, relativeTime, toolNames } from '@/lib/utils'
import { toast } from 'sonner'

export default function SyncCenter() {
  const { changeEvents, syncHistory, gitConfig: _gitConfig, resolveEvent, ignoreEvent } = useSyncStore()
  const gitConfig = _gitConfig!
  const [activeTab, setActiveTab] = useState('events')
  const [eventStatusFilter, setEventStatusFilter] = useState('all')
  const [eventTypeFilter, setEventTypeFilter] = useState('all')
  const [checking, setChecking] = useState(false)
  const [checkProgress, setCheckProgress] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const pendingCount = changeEvents.filter((e) => e.status === 'pending').length

  const handleConsistencyCheck = () => {
    setChecking(true)
    setCheckProgress(0)
    const iv = setInterval(() => {
      setCheckProgress((p) => {
        if (p >= 100) {
          clearInterval(iv)
          setChecking(false)
          setActiveTab('report')
          toast.success('一致性检查完成')
          return 100
        }
        return p + 5
      })
    }, 150)
  }

  const statCards = [
    { label: 'Git 连接', value: gitConfig.connected ? '已连接' : '未配置', icon: GitBranch, bg: 'bg-mint-50', color: gitConfig.connected ? 'text-mint-500' : 'text-cream-500' },
    { label: '最近导出', value: gitConfig.last_export_at ? relativeTime(gitConfig.last_export_at) : '从未', icon: CloudUpload, bg: 'bg-lavender-50', color: 'text-lavender-400' },
    { label: '待处理变更', value: `${pendingCount}`, icon: BellRing, bg: 'bg-honey-50', color: pendingCount > 0 ? 'text-honey-500' : 'text-cream-500' },
    { label: '偏离部署', value: '2', icon: AlertTriangle, bg: 'bg-strawberry-50', color: 'text-strawberry-500' },
  ]

  const filteredEvents = changeEvents.filter((e) => {
    if (eventStatusFilter !== 'all' && e.status !== eventStatusFilter) return false
    if (eventTypeFilter !== 'all' && e.event_type !== eventTypeFilter) return false
    return true
  })

  const eventTypeColors: Record<string, string> = {
    modified: 'text-honey-500', created: 'text-mint-500', deleted: 'text-strawberry-500', renamed: 'text-sky-500',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display font-bold text-cream-800">同步中心</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className={cn('border-0 shadow-card', stat.bg)}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={cn('p-2.5 rounded-xl', stat.bg)}><stat.icon className={cn('h-5 w-5', stat.color)} /></div>
              <div>
                <p className="text-xs text-cream-500">{stat.label}</p>
                <p className={cn('text-xl font-bold font-display', stat.color)}>{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 检查中进度 */}
      {checking && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
          <Progress value={checkProgress} className="h-2" />
          <p className="text-sm text-cream-500 text-center">正在检查第 {Math.floor(checkProgress / 10)}/10 个部署...</p>
        </motion.div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <Button onClick={handleConsistencyCheck} disabled={checking} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
          <ShieldCheck className="h-4 w-4 mr-1" /> {checking ? '检查中...' : '执行一致性检查'}
        </Button>
        <Button variant="outline" onClick={() => setExportOpen(true)} className="rounded-xl">
          <CloudUpload className="h-4 w-4 mr-1" /> 备份导出到 Git
        </Button>
        <Button variant="outline" className="rounded-xl">
          <CloudDownload className="h-4 w-4 mr-1" /> 从 Git 恢复
        </Button>
      </div>

      {/* Tab 区 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-cream-100">
          <TabsTrigger value="events">变更事件 ({pendingCount})</TabsTrigger>
          <TabsTrigger value="report">一致性报告</TabsTrigger>
          <TabsTrigger value="history">操作历史</TabsTrigger>
        </TabsList>

        {/* 变更事件 */}
        <TabsContent value="events" className="space-y-4">
          <div className="flex gap-3">
            <Select value={eventStatusFilter} onValueChange={setEventStatusFilter}>
              <SelectTrigger className="w-32 border-cream-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="pending">待处理</SelectItem>
                <SelectItem value="resolved">已处理</SelectItem>
                <SelectItem value="ignored">已忽略</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-32 border-cream-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="modified">修改</SelectItem>
                <SelectItem value="created">新增</SelectItem>
                <SelectItem value="deleted">删除</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card className="border border-cream-200">
            <div className="divide-y divide-cream-100">
              {filteredEvents.map((event, i) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                  className={cn(
                    'flex items-center gap-4 px-5 py-3 hover:bg-peach-50/50 transition-colors',
                    event.status === 'pending' && 'border-l-[3px] border-l-honey-400'
                  )}
                >
                  <span className={cn('text-xs font-medium capitalize', eventTypeColors[event.event_type])}>
                    {event.event_type}
                  </span>
                  <h3 className="font-semibold text-cream-800 min-w-[140px]">{event.skill_name}</h3>
                  <span className="text-xs text-cream-500">{event.project_name}</span>
                  <span className="text-xs text-cream-400">{toolNames[event.tool_name]}</span>
                  <span className="text-xs text-cream-400 ml-auto">{relativeTime(event.detected_at)}</span>
                  <Badge variant="outline" className={cn('text-xs',
                    event.status === 'pending' ? 'bg-honey-100 text-honey-500' :
                    event.status === 'resolved' ? 'bg-mint-100 text-mint-500' : 'bg-cream-200 text-cream-500'
                  )}>
                    {event.status === 'pending' ? '待处理' : event.status === 'resolved' ? '已处理' : '已忽略'}
                  </Badge>
                  {event.status === 'pending' && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { resolveEvent(event.id); toast.success('已处理') }}>
                        <RefreshCw className="h-3 w-3 mr-1" /> 更新
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs"><Eye className="h-3 w-3 mr-1" /> Diff</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { ignoreEvent(event.id); toast.info('已忽略') }}>
                        <X className="h-3 w-3 mr-1" /> 忽略
                      </Button>
                    </div>
                  )}
                </motion.div>
              ))}
              {filteredEvents.length === 0 && (
                <p className="text-center text-cream-400 py-8">暂无变更事件</p>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* 一致性报告 */}
        <TabsContent value="report" className="space-y-4">
          {[
            { label: '已偏离', count: 2, color: 'bg-honey-400', items: ['frontend-design @ EmbedEase/Windsurf', 'skill-creator @ 全局/Cursor'] },
            { label: '文件丢失', count: 1, color: 'bg-strawberry-400', items: ['gsap-react @ EmbedEase/Windsurf'] },
            { label: '未追踪', count: 0, color: 'bg-sky-400', items: [] },
          ].map((section) => (
            <Collapsible key={section.label} defaultOpen={section.count > 0}>
              <Card className="border border-cream-200">
                <CollapsibleTrigger asChild>
                  <CardContent className="flex items-center gap-3 p-4 cursor-pointer hover:bg-cream-50">
                    <div className={cn('h-2.5 w-2.5 rounded-full', section.color)} />
                    <span className="font-semibold text-cream-800">{section.label}</span>
                    <Badge variant="secondary" className="text-xs">{section.count}</Badge>
                  </CardContent>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-cream-200 divide-y divide-cream-100">
                    {section.items.map((item) => (
                      <div key={item} className="flex items-center justify-between px-5 py-3">
                        <span className="text-sm text-cream-700">{item}</span>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="text-xs h-7"><RefreshCw className="h-3 w-3 mr-1" /> 重新部署</Button>
                          <Button variant="ghost" size="sm" className="text-xs h-7"><Eye className="h-3 w-3 mr-1" /> 查看 Diff</Button>
                        </div>
                      </div>
                    ))}
                    {section.count === 0 && <p className="text-center text-cream-400 py-4 text-sm">无</p>}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </TabsContent>

        {/* 操作历史 */}
        <TabsContent value="history">
          <Card className="border border-cream-200">
            <div className="divide-y divide-cream-100">
              {syncHistory.map((item, i) => {
                const actionColors: Record<string, string> = {
                  deploy: 'bg-mint-100 text-mint-500', update: 'bg-sky-100 text-sky-500',
                  delete: 'bg-strawberry-100 text-strawberry-500', export: 'bg-lavender-100 text-lavender-400',
                  import: 'bg-honey-100 text-honey-500',
                }
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                    className={cn('flex items-center gap-4 px-5 py-3', item.result === 'failed' && 'border-l-[3px] border-l-strawberry-400')}
                  >
                    <span className="text-xs text-cream-400 w-24 shrink-0">{relativeTime(item.created_at)}</span>
                    <Badge variant="outline" className={cn('text-xs', actionColors[item.action_type])}>{item.action_type}</Badge>
                    <span className="font-medium text-cream-800">{item.skill_name}</span>
                    {item.project_name && <span className="text-xs text-cream-500">{item.project_name}</span>}
                    {item.tool_name && <span className="text-xs text-cream-400">{toolNames[item.tool_name]}</span>}
                    <Badge variant="outline" className={cn('text-xs ml-auto',
                      item.result === 'success' ? 'bg-mint-100 text-mint-500' : 'bg-strawberry-100 text-strawberry-500'
                    )}>
                      {item.result === 'success' ? '成功' : '失败'}
                    </Badge>
                  </motion.div>
                )
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 导出确认 */}
      <AlertDialog open={exportOpen} onOpenChange={setExportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>备份导出到 Git</AlertDialogTitle>
            <AlertDialogDescription>
              将把所有 Skill 导出到 {gitConfig.repo_url}（{gitConfig.branch} 分支）
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setExportOpen(false); toast.promise(new Promise((r) => setTimeout(r, 3000)), { loading: '正在推送到 GitHub...', success: '导出成功', error: '导出失败' }) }}
              className="bg-peach-500 hover:bg-peach-600">
              确认导出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
