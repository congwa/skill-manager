import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, Download, ArrowRight, AlertTriangle,
  ChevronDown, Check, Package,
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
import { skillsApi, skillsShApi } from '@/lib/tauri-api'
import type { SkillUpdateInfoRow, RemoteUpdateInfo } from '@/lib/tauri-api'
import { useSkillStore } from '@/stores/useSkillStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSyncStore } from '@/stores/useSyncStore'

interface UpdateItem extends SkillUpdateInfoRow {
  selected: boolean
}

export default function UpdateManager() {
  const [updates, setUpdates] = useState<UpdateItem[]>([])
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [updateScope, setUpdateScope] = useState('all')
  const [modifiedAlert, setModifiedAlert] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null)
  const [remoteUpdates, setRemoteUpdates] = useState<RemoteUpdateInfo[]>([])
  const [checkingRemote, setCheckingRemote] = useState(false)
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const syncHistory = useSyncStore((s) => s.syncHistory)
  const projects = useProjectStore((s) => s.projects)

  const TOOL_LIST = ['windsurf', 'cursor', 'claude-code', 'codex', 'trae']

  const toggleTool = (tool: string) => {
    setSelectedTools((prev) => prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool])
  }
  const toggleProject = (pid: string) => {
    setSelectedProjectIds((prev) => prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid])
  }

  const handleCheck = async () => {
    setChecking(true)
    try {
      console.log('[UpdateManager] 检查更新...')
      const infos = await skillsApi.checkUpdates()
      console.log(`[UpdateManager] 检查完成: ${infos.length} 个 Skill`)
      setUpdates(infos.map((info) => ({ ...info, selected: false })))
      setLastCheckTime(new Date().toLocaleTimeString())
      toast.success(`检查完成: 发现 ${infos.length} 个 Skill`)
    } catch (e) {
      console.error('[UpdateManager] 检查失败:', e)
      toast.error('检查失败')
    } finally {
      setChecking(false)
    }
  }

  const handleUpdate = (id: string) => {
    const item = updates.find((u) => u.skill_id === id)
    if (item?.locally_modified) { setModifiedAlert(id); return }
    doUpdate(id)
  }

  const doUpdate = async (id: string) => {
    setUpdating(id)
    try {
      const syncDeps = updateScope !== 'lib'
      const pIds = updateScope === 'custom' && selectedProjectIds.length > 0 ? selectedProjectIds : undefined
      const tNames = updateScope === 'custom' && selectedTools.length > 0 ? selectedTools : undefined
      console.log(`[UpdateManager] 更新 Skill: ${id}, syncDeps=${syncDeps}, projects=${pIds}, tools=${tNames}`)
      const result = await skillsApi.updateFromLibrary(id, syncDeps, pIds, tNames)
      console.log(`[UpdateManager] 更新完成: ${result.deployments_synced} 个部署已同步`)
      await useSkillStore.getState().fetchSkills()
      await useSkillStore.getState().fetchDeployments()
      setUpdates((prev) => prev.filter((u) => u.skill_id !== id))
      toast.success(`更新成功，${result.deployments_synced} 个部署已同步`)
    } catch (e) {
      console.error('[UpdateManager] 更新失败:', e)
      toast.error('更新失败: ' + String(e))
    } finally {
      setUpdating(null)
    }
  }

  const handleBatchUpdate = async () => {
    const selected = updates.filter((u) => u.selected)
    if (selected.length === 0) { toast.error('请先选中要更新的 Skill'); return }
    setBatchUpdating(true)
    setBatchProgress(0)
    const step = 100 / selected.length
    let completed = 0
    for (const item of selected) {
      try {
        const syncDeps = updateScope !== 'lib'
        const pIds = updateScope === 'custom' && selectedProjectIds.length > 0 ? selectedProjectIds : undefined
        const tNames = updateScope === 'custom' && selectedTools.length > 0 ? selectedTools : undefined
        await skillsApi.updateFromLibrary(item.skill_id, syncDeps, pIds, tNames)
        completed++
        setBatchProgress(Math.min(completed * step, 100))
      } catch (e) {
        console.error(`[UpdateManager] 批量更新失败: ${item.skill_name}`, e)
      }
    }
    await useSkillStore.getState().fetchSkills()
    await useSkillStore.getState().fetchDeployments()
    setUpdates((prev) => prev.filter((u) => !u.selected))
    setBatchUpdating(false)
    toast.success(`已更新 ${completed} 个 Skill`)
  }

  const toggleSelect = (id: string) => {
    setUpdates((prev) => prev.map((u) => u.skill_id === id ? { ...u, selected: !u.selected } : u))
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
          <p className="text-sm text-cream-500 mt-1">上次检查：{lastCheckTime ?? '未检查'}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCheck} disabled={checking} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
            <RefreshCw className={cn('h-4 w-4 mr-1', checking && 'animate-spin')} /> {checking ? '检查中...' : '检查本地状态'}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              setCheckingRemote(true)
              try {
                console.log('[UpdateManager] 检查远程更新...')
                const infos = await skillsShApi.checkRemoteUpdates()
                const withUpdates = infos.filter((i) => i.has_update)
                setRemoteUpdates(withUpdates)
                toast.success(`远程检查完成: ${withUpdates.length} 个 Skill 有更新`)
              } catch (e) {
                console.error('[UpdateManager] 远程检查失败:', e)
                toast.error('远程检查失败: ' + String(e))
              } finally {
                setCheckingRemote(false)
              }
            }}
            disabled={checkingRemote}
            className="rounded-xl"
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', checkingRemote && 'animate-spin')} />
            {checkingRemote ? '检查中...' : '检查远程更新'}
          </Button>
        </div>
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

          {/* 自定义选择面板 */}
          {updateScope === 'custom' && (
            <Card className="border border-lavender-200 bg-lavender-50/30">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold text-cream-700">选择同步范围（留空=同步全部）</p>
                <div>
                  <p className="text-xs text-cream-500 mb-1.5">按工具筛选</p>
                  <div className="flex flex-wrap gap-2">
                    {TOOL_LIST.map((tool) => (
                      <Badge
                        key={tool}
                        variant="outline"
                        className={cn('cursor-pointer text-xs transition-colors',
                          selectedTools.includes(tool) ? 'bg-peach-100 text-peach-600 border-peach-300' : 'text-cream-500 hover:bg-cream-100'
                        )}
                        onClick={() => toggleTool(tool)}
                      >
                        {selectedTools.includes(tool) && <Check className="h-3 w-3 mr-0.5" />}
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </div>
                {projects.length > 0 && (
                  <div>
                    <p className="text-xs text-cream-500 mb-1.5">按项目筛选</p>
                    <div className="flex flex-wrap gap-2">
                      {projects.map((p) => (
                        <Badge
                          key={p.id}
                          variant="outline"
                          className={cn('cursor-pointer text-xs transition-colors',
                            selectedProjectIds.includes(p.id) ? 'bg-peach-100 text-peach-600 border-peach-300' : 'text-cream-500 hover:bg-cream-100'
                          )}
                          onClick={() => toggleProject(p.id)}
                        >
                          {selectedProjectIds.includes(p.id) && <Check className="h-3 w-3 mr-0.5" />}
                          {p.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <AnimatePresence>
              {updates.map((item) => {
                const src = (sourceLabels as Record<string, { bg: string; text: string; label: string }>)[item.source_type]
                return (
                  <motion.div
                    key={item.skill_id}
                    layout
                    exit={{ opacity: 0, scale: 0.9, height: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="update-card"
                  >
                    <Card className={cn(
                      'border shadow-card hover:shadow-card-hover transition-shadow',
                      item.locally_modified ? 'border-l-[3px] border-l-honey-400 border-cream-200' : 'border-cream-200'
                    )}>
                      <CardContent className="flex items-center gap-4 p-5">
                        <Checkbox checked={item.selected} onCheckedChange={() => toggleSelect(item.skill_id)} />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-cream-800">{item.skill_name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-cream-500">{item.current_version ?? '未知'}</span>
                            {item.installed_version && item.installed_version !== item.current_version && (
                              <>
                                <ArrowRight className="h-3 w-3 text-peach-300" />
                                <span className="text-xs font-bold text-peach-600">安装时: v{item.installed_version}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {src && <Badge variant="outline" className={cn('text-xs', src.bg, src.text)}>{src.label}</Badge>}
                        {item.locally_modified && (
                          <Badge variant="outline" className="bg-honey-100 text-honey-500 text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" /> 本地已修改
                          </Badge>
                        )}
                        <span className="text-xs text-cream-400"><Package className="h-3 w-3 inline mr-1" />{item.deploy_count} 个部署</span>
                        <Button
                          onClick={() => handleUpdate(item.skill_id)}
                          disabled={updating === item.skill_id}
                          className="bg-peach-500 hover:bg-peach-600 text-white rounded-lg text-sm"
                        >
                          {updating === item.skill_id ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                          {updating === item.skill_id ? '更新中...' : '同步更新'}
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

      {/* 远程更新列表 */}
      {remoteUpdates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-display font-bold text-cream-800">远程可更新 (skills.sh)</h2>
          {remoteUpdates.map((item) => (
            <Card key={item.skill_id} className="border border-lavender-200 shadow-card">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-cream-800">{item.skill_name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-cream-500">{item.current_version ?? '未知版本'}</span>
                    <ArrowRight className="h-3 w-3 text-lavender-300" />
                    <span className="text-xs font-bold text-lavender-500">有新版本</span>
                  </div>
                  <p className="text-xs text-cream-400 mt-1">{item.owner_repo} / {item.skill_path}</p>
                </div>
                <Badge variant="outline" className="bg-lavender-100 text-lavender-400 text-xs">skills.sh</Badge>
                {item.locally_modified && (
                  <Badge variant="outline" className="bg-honey-100 text-honey-500 text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" /> 本地已修改
                  </Badge>
                )}
                <span className="text-xs text-cream-400"><Package className="h-3 w-3 inline mr-1" />{item.deploy_count} 个部署</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 操作历史 */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <Card className="border border-cream-200">
          <CollapsibleTrigger asChild>
            <CardContent className="flex items-center justify-between p-4 cursor-pointer hover:bg-cream-50">
              <h2 className="font-display font-semibold text-cream-800">最近操作记录</h2>
              <motion.div animate={{ rotate: historyOpen ? 180 : 0 }}>
                <ChevronDown className="h-4 w-4 text-cream-400" />
              </motion.div>
            </CardContent>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-cream-200 divide-y divide-cream-100">
              {syncHistory.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center gap-4 px-5 py-3">
                  {item.result === 'success' ? (
                    <Check className="h-4 w-4 text-mint-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-strawberry-500" />
                  )}
                  <span className="font-medium text-cream-800">{item.skill_name}</span>
                  <Badge variant="secondary" className="text-[10px]">{item.action_type}</Badge>
                  {item.project_name && <span className="text-xs text-cream-500">{item.project_name}</span>}
                  <span className="text-xs text-cream-400 ml-auto">{new Date(item.created_at).toLocaleString()}</span>
                  <Badge variant="outline" className={cn('text-xs',
                    item.result === 'success' ? 'bg-mint-100 text-mint-500' : 'bg-strawberry-100 text-strawberry-500'
                  )}>{item.result === 'success' ? '成功' : '失败'}</Badge>
                </div>
              ))}
              {syncHistory.length === 0 && (
                <p className="text-center text-cream-400 py-4 text-sm">暂无操作记录</p>
              )}
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
            <AlertDialogAction onClick={() => { void doUpdate(modifiedAlert!); setModifiedAlert(null) }} className="bg-strawberry-500 hover:bg-strawberry-400">
              覆盖本地修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
