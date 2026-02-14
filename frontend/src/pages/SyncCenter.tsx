import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  GitBranch, CloudUpload, CloudDownload, ShieldCheck,
  BellRing, AlertTriangle, RefreshCw, X,
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
import { deploymentsApi, settingsApi, gitApi } from '@/lib/tauri-api'
import { Upload } from 'lucide-react'
import type { ConsistencyDetailData } from '@/lib/tauri-api'
import { useSkillStore } from '@/stores/useSkillStore'

export default function SyncCenter() {
  const { changeEvents, syncHistory, gitConfig, resolveEvent, ignoreEvent } = useSyncStore()
  const [activeTab, setActiveTab] = useState('events')
  const [eventStatusFilter, setEventStatusFilter] = useState('all')
  const [eventTypeFilter, setEventTypeFilter] = useState('all')
  const [checking, setChecking] = useState(false)
  const [checkProgress, setCheckProgress] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [consistencyDetails, setConsistencyDetails] = useState<ConsistencyDetailData[]>([])
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const pendingCount = changeEvents.filter((e) => e.status === 'pending').length

  const handleConsistencyCheck = async () => {
    setChecking(true)
    setCheckProgress(10)
    try {
      console.log('[SyncCenter] 开始一致性检查...')
      setCheckProgress(30)
      const report = await deploymentsApi.checkConsistency()
      setCheckProgress(80)
      console.log('[SyncCenter] 一致性检查结果:', JSON.stringify(report, null, 2))
      await useSkillStore.getState().fetchDeployments()
      setConsistencyDetails(report.details)
      setCheckProgress(100)
      setActiveTab('report')
      if (report.diverged === 0 && report.missing === 0) {
        toast.success(`一致性检查完成: ${report.total_deployments} 个部署全部同步 ✓`)
      } else {
        toast.warning(`发现 ${report.diverged} 个偏离, ${report.missing} 个缺失 (共 ${report.total_deployments} 个部署)`)
      }
    } catch (e) {
      console.error('[SyncCenter] 一致性检查失败:', e)
      toast.error('一致性检查失败')
    } finally {
      setChecking(false)
    }
  }

  const divergedDetails = consistencyDetails.filter((d) => d.status === 'diverged')
  const missingDetails = consistencyDetails.filter((d) => d.status === 'missing')
  const untrackedDetails = consistencyDetails.filter((d) => d.status === 'untracked')

  const statCards = [
    { label: 'Git 连接', value: gitConfig?.connected ? '已连接' : '未配置', icon: GitBranch, bg: 'bg-mint-50', color: gitConfig?.connected ? 'text-mint-500' : 'text-cream-500' },
    { label: '最近导出', value: gitConfig?.last_export_at ? relativeTime(gitConfig.last_export_at) : '从未', icon: CloudUpload, bg: 'bg-lavender-50', color: 'text-lavender-400' },
    { label: '待处理变更', value: `${pendingCount}`, icon: BellRing, bg: 'bg-honey-50', color: pendingCount > 0 ? 'text-honey-500' : 'text-cream-500' },
    { label: '偏离部署', value: `${divergedDetails.length + missingDetails.length}`, icon: AlertTriangle, bg: 'bg-strawberry-50', color: divergedDetails.length + missingDetails.length > 0 ? 'text-strawberry-500' : 'text-cream-500' },
  ]

  const filteredEvents = changeEvents.filter((e) => {
    if (eventStatusFilter !== 'all' && e.status !== eventStatusFilter) return false
    if (eventTypeFilter !== 'all' && e.event_type !== eventTypeFilter) return false
    return true
  })

  const eventTypeColors: Record<string, string> = {
    modified: 'text-honey-500', created: 'text-mint-500', deleted: 'text-strawberry-500', renamed: 'text-sky-500',
    file_modified: 'text-honey-500', file_created: 'text-mint-500', file_deleted: 'text-strawberry-500',
    checksum_mismatch: 'text-honey-500', untracked_skill: 'text-sky-500',
  }

  const handleResyncDeployment = async (deploymentId: string) => {
    setSyncingId(deploymentId)
    try {
      console.log(`[SyncCenter] 重新同步部署: ${deploymentId}`)
      const result = await deploymentsApi.syncDeployment(deploymentId)
      console.log(`[SyncCenter] 同步完成: ${result.files_copied} 个文件`)
      await useSkillStore.getState().fetchDeployments()
      setConsistencyDetails((prev) =>
        prev.map((d) => d.deployment_id === deploymentId ? { ...d, status: 'synced' } : d)
      )
      toast.success(`同步完成: ${result.files_copied} 个文件已更新`)
    } catch (e) {
      console.error('[SyncCenter] 同步失败:', e)
      toast.error('同步失败')
    } finally {
      setSyncingId(null)
    }
  }

  const handleUpdateLibrary = async (deploymentId: string) => {
    setSyncingId(deploymentId)
    try {
      console.log(`[SyncCenter] 回写到库: ${deploymentId}`)
      const result = await deploymentsApi.updateLibraryFromDeployment(deploymentId, true)
      console.log(`[SyncCenter] 回写完成: ${result.skill_name}, 其他 ${result.other_deployments_synced} 个部署已同步`)
      await useSkillStore.getState().fetchSkills()
      await useSkillStore.getState().fetchDeployments()
      setConsistencyDetails((prev) =>
        prev.map((d) => d.deployment_id === deploymentId ? { ...d, status: 'synced' } : d)
      )
      toast.success(`${result.skill_name} 已回写到本地库，${result.other_deployments_synced} 个其他部署已同步`)
    } catch (e) {
      console.error('[SyncCenter] 回写失败:', e)
      toast.error('回写失败: ' + String(e))
    } finally {
      setSyncingId(null)
    }
  }

  const handleDeleteDeployment = async (deploymentId: string) => {
    try {
      console.log(`[SyncCenter] 删除部署记录: ${deploymentId}`)
      await deploymentsApi.delete(deploymentId)
      await useSkillStore.getState().fetchDeployments()
      setConsistencyDetails((prev) => prev.filter((d) => d.deployment_id !== deploymentId))
      toast.success('部署记录已删除')
    } catch (e) {
      console.error('[SyncCenter] 删除失败:', e)
      toast.error('删除失败')
    }
  }

  const handleResolveAndSync = async (eventId: string, deploymentId: string) => {
    try {
      await deploymentsApi.syncDeployment(deploymentId)
      resolveEvent(eventId)
      await useSkillStore.getState().fetchDeployments()
      toast.success('已重新同步并标记已处理')
    } catch (e) {
      console.error('[SyncCenter] 同步+处理失败:', e)
      toast.error('操作失败')
    }
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
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleResolveAndSync(event.id, event.file_path)}>
                        <RefreshCw className="h-3 w-3 mr-1" /> 重新同步
                      </Button>
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
          {consistencyDetails.length === 0 ? (
            <Card className="border border-cream-200">
              <CardContent className="text-center text-cream-400 py-8">
                请先执行一致性检查
              </CardContent>
            </Card>
          ) : (
            [
              { label: '已偏离', color: 'bg-honey-400', items: divergedDetails },
              { label: '文件缺失', color: 'bg-strawberry-400', items: missingDetails },
              { label: '未追踪', color: 'bg-sky-400', items: untrackedDetails },
            ].map((section) => (
              <Collapsible key={section.label} defaultOpen={section.items.length > 0}>
                <Card className="border border-cream-200">
                  <CollapsibleTrigger asChild>
                    <CardContent className="flex items-center gap-3 p-4 cursor-pointer hover:bg-cream-50">
                      <div className={cn('h-2.5 w-2.5 rounded-full', section.color)} />
                      <span className="font-semibold text-cream-800">{section.label}</span>
                      <Badge variant="secondary" className="text-xs">{section.items.length}</Badge>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-cream-200 divide-y divide-cream-100">
                      {section.items.map((detail) => (
                        <div key={detail.deployment_id} className="flex items-center justify-between px-5 py-3">
                          <div className="space-y-0.5">
                            <span className="text-sm font-medium text-cream-800">{detail.skill_name}</span>
                            <p className="text-xs text-cream-400">{detail.tool} · {detail.deploy_path}</p>
                          </div>
                          <div className="flex gap-2">
                            {detail.status !== 'missing' && (
                              <>
                                <Button
                                  variant="ghost" size="sm" className="text-xs h-7"
                                  disabled={syncingId === detail.deployment_id}
                                  onClick={() => handleResyncDeployment(detail.deployment_id)}
                                >
                                  <RefreshCw className={cn('h-3 w-3 mr-1', syncingId === detail.deployment_id && 'animate-spin')} />
                                  {syncingId === detail.deployment_id ? '处理中...' : '用库覆盖'}
                                </Button>
                                <Button
                                  variant="ghost" size="sm" className="text-xs h-7 text-lavender-500 hover:text-lavender-600"
                                  disabled={syncingId === detail.deployment_id}
                                  onClick={() => handleUpdateLibrary(detail.deployment_id)}
                                >
                                  <Upload className="h-3 w-3 mr-1" /> 回写到库
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost" size="sm" className="text-xs h-7 text-strawberry-500 hover:text-strawberry-600"
                              onClick={() => handleDeleteDeployment(detail.deployment_id)}
                            >
                              <X className="h-3 w-3 mr-1" /> 删除记录
                            </Button>
                          </div>
                        </div>
                      ))}
                      {section.items.length === 0 && <p className="text-center text-cream-400 py-4 text-sm">无</p>}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
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
              将把所有 Skill 导出到 {gitConfig?.repo_url || '未配置'}（{gitConfig?.branch || 'main'} 分支）
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              setExportOpen(false)
              try {
                const configs = await settingsApi.getGitConfigs()
                if (configs.length === 0) { toast.error('请先配置 Git 仓库'); return }
                toast.loading('正在导出到 Git...')
                const result = await gitApi.exportToGit(configs[0].id)
                toast.success(result.message)
              } catch (e) {
                console.error('[SyncCenter] 导出失败:', e)
                toast.error('导出失败: ' + String(e))
              }
            }}
              className="bg-peach-500 hover:bg-peach-600">
              确认导出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
