import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Edit, RefreshCw, MoreHorizontal, Eye,
  Trash2, Download, Upload, Clock, FileText, MapPin, ExternalLink,
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
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useSkillStore } from '@/stores/useSkillStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { cn, toolColors, toolNames, statusColors, sourceLabels, relativeTime } from '@/lib/utils'
import { toast } from 'sonner'
import { skillsApi, deploymentsApi } from '@/lib/tauri-api'

export default function SkillDetail() {
  const { skillId } = useParams()
  const navigate = useNavigate()
  const { skills, deployments, backups } = useSkillStore()
  const projects = useProjectStore((s) => s.projects)
  const skill = skills.find((s) => s.id === skillId)
  const skillDeployments = deployments.filter((d) => d.skill_id === skillId)
  const skillBackups = backups.filter((b) => b.skill_id === skillId)
  const [activeTab, setActiveTab] = useState('content')
  const [skillContent, setSkillContent] = useState<string | null>(null)
  const [skillFiles, setSkillFiles] = useState<string[]>([])
  const [restoring, setRestoring] = useState<string | null>(null)

  useState(() => {
    if (skill?.local_path) {
      skillsApi.readFile(skill.local_path + '/SKILL.md').then(setSkillContent).catch(() => {})
      skillsApi.listFiles(skill.local_path).then(setSkillFiles).catch(() => {})
    }
  })

  if (!skill) {
    return (
      <div className="text-center py-20">
        <p className="text-cream-500">Skill 不存在</p>
        <Button variant="ghost" onClick={() => navigate('/skills')} className="mt-4">返回列表</Button>
      </div>
    )
  }

  const src = sourceLabels[skill.source]

  const handleSyncAll = async () => {
    toast.loading('正在同步所有部署...')
    try {
      let totalFiles = 0
      for (const dep of skillDeployments) {
        console.log(`[SkillDetail] 同步部署: ${dep.id} -> ${dep.deploy_path}`)
        const result = await deploymentsApi.syncDeployment(dep.id)
        totalFiles += result.files_copied
        console.log(`[SkillDetail] 同步完成: ${result.files_copied} 个文件, checksum ${result.old_checksum} -> ${result.new_checksum}`)
      }
      await useSkillStore.getState().fetchDeployments()
      toast.success(`已同步 ${skillDeployments.length} 个部署，共 ${totalFiles} 个文件`)
    } catch (e) {
      console.error('[SkillDetail] sync error:', e)
      toast.error('同步失败')
    }
  }

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleBatchDelete = async (withLocalLib: boolean) => {
    setDeleting(true)
    try {
      const result = await skillsApi.batchDelete(skillId!, withLocalLib)
      await useSkillStore.getState().fetchSkills()
      await useSkillStore.getState().fetchDeployments()
      toast.success(
        `${result.skill_name} 已删除: ${result.deployments_deleted} 个部署${result.local_lib_removed ? ' + 本地库' : ''}`
      )
      navigate('/skills')
    } catch (e) {
      console.error('batch delete error:', e)
      toast.error('删除失败: ' + String(e))
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 顶部 */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/skills')} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/skills">Skills</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
                <BreadcrumbItem><BreadcrumbLink>{skill.name}</BreadcrumbLink></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <h1 className="text-3xl font-display font-bold text-cream-800">{skill.name}</h1>
          <p className="text-cream-600">{skill.description}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="bg-lavender-50 text-lavender-400">v{skill.version}</Badge>
            <Badge variant="outline" className={cn(src.bg, src.text)}>{src.label}</Badge>
            {skill.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="bg-cream-100 text-cream-600 text-xs">{tag}</Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/skills/${skillId}/edit`)} className="rounded-xl">
            <Edit className="h-4 w-4 mr-1" /> 编辑
          </Button>
          <Button onClick={handleSyncAll} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
            <RefreshCw className="h-4 w-4 mr-1" /> 同步所有部署
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => {
                if (skill?.local_path) {
                  skillsApi.openInEditor(skill.local_path).catch((e) => toast.error('打开失败: ' + String(e)))
                } else {
                  toast.error('无本地路径')
                }
              }}><ExternalLink className="h-4 w-4 mr-2" /> 在编辑器中打开</DropdownMenuItem>
              <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> 检查更新</DropdownMenuItem>
              <DropdownMenuItem><Clock className="h-4 w-4 mr-2" /> 版本回滚</DropdownMenuItem>
              <DropdownMenuItem className="text-strawberry-500" onClick={() => setDeleteDialogOpen(true)}><Trash2 className="h-4 w-4 mr-2" /> 批量删除</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tab 区 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-cream-100">
          <TabsTrigger value="content"><FileText className="h-4 w-4 mr-1" /> 内容预览</TabsTrigger>
          <TabsTrigger value="deployments"><MapPin className="h-4 w-4 mr-1" /> 部署位置 ({skillDeployments.length})</TabsTrigger>
          <TabsTrigger value="backups"><Clock className="h-4 w-4 mr-1" /> 备份历史 ({skillBackups.length})</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          {/* 内容预览 */}
          <TabsContent value="content">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Skill 信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: '名称', value: skill.name },
                    { label: '版本', value: `v${skill.version}` },
                    { label: '来源', value: src.label },
                    { label: '校验和', value: skill.checksum },
                    { label: '本地路径', value: skill.local_path },
                    { label: '最后修改', value: relativeTime(skill.last_modified_at) },
                    { label: '创建时间', value: new Date(skill.created_at).toLocaleDateString('zh-CN') },
                    { label: '部署数量', value: `${skillDeployments.length} 个位置` },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <p className="text-xs text-cream-500">{item.label}</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm text-cream-800 truncate">{item.value}</p>
                        </TooltipTrigger>
                        <TooltipContent><p>{item.value}</p></TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
                {skill.source_url && (
                  <div className="space-y-1">
                    <p className="text-xs text-cream-500">来源 URL</p>
                    <a href={skill.source_url} target="_blank" rel="noreferrer" className="text-sm text-peach-600 hover:underline">
                      {skill.source_url}
                    </a>
                  </div>
                )}

                {skillFiles.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-cream-500 mb-2">文件列表 ({skillFiles.length})</p>
                    <div className="bg-cream-50 rounded-xl p-3 space-y-1">
                      {skillFiles.map((f) => (
                        <p key={f} className="text-xs text-cream-600 font-mono">{f}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 bg-cream-50 rounded-xl p-4 font-mono text-sm text-cream-700 whitespace-pre-wrap leading-relaxed">
                  {skillContent || `---\nname: ${skill.name}\ndescription: ${skill.description}\nversion: ${skill.version}\n---\n\n# ${skill.name}\n\n${skill.description}`}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 部署位置 */}
          <TabsContent value="deployments">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">部署位置</CardTitle>
                <Button size="sm" className="bg-peach-500 hover:bg-peach-600 text-white rounded-lg">
                  <Upload className="h-3 w-3 mr-1" /> 部署到新位置
                </Button>
              </CardHeader>
              <CardContent>
                {skillDeployments.length === 0 ? (
                  <p className="text-center text-cream-400 py-8">此 Skill 尚未部署到任何位置</p>
                ) : (
                  <div className="divide-y divide-cream-100">
                    {skillDeployments.map((dep, i) => {
                      const project = projects.find((p) => p.id === dep.project_id)
                      const stat = statusColors[dep.status]
                      return (
                        <motion.div
                          key={dep.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
                          className="flex items-center gap-4 py-3"
                        >
                          <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ backgroundColor: toolColors[dep.tool_name] }}>
                            {toolNames[dep.tool_name][0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-cream-800">{project?.name || '全局'}</p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-xs text-cream-400 truncate">{dep.deploy_path}</p>
                              </TooltipTrigger>
                              <TooltipContent><p className="text-xs">{dep.deploy_path}</p></TooltipContent>
                            </Tooltip>
                          </div>
                          <Badge variant="outline" className={cn('text-xs', stat.bg, stat.text)}>{stat.label}</Badge>
                          <span className="text-xs text-cream-400">{relativeTime(dep.last_synced_at)}</span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"><RefreshCw className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-3 w-3" /></Button>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 备份历史 */}
          <TabsContent value="backups">
            <Card>
              <CardHeader><CardTitle className="text-lg">备份历史</CardTitle></CardHeader>
              <CardContent>
                {skillBackups.length === 0 ? (
                  <p className="text-center text-cream-400 py-8">暂无备份</p>
                ) : (
                  <div className="space-y-3">
                    {skillBackups.map((backup, i) => (
                      <motion.div
                        key={backup.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                        className="flex items-center gap-4 p-3 bg-cream-50 rounded-lg"
                      >
                        <Clock className="h-4 w-4 text-cream-400 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-cream-800">v{backup.version}</p>
                          <p className="text-xs text-cream-500">{backup.reason}</p>
                        </div>
                        <span className="text-xs text-cream-400">{relativeTime(backup.created_at)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          disabled={restoring === backup.id}
                          onClick={async () => {
                            setRestoring(backup.id)
                            try {
                              console.log(`[SkillDetail] 恢复备份: ${backup.id}`)
                              const result = await skillsApi.restoreFromBackup(backup.id, true)
                              console.log(`[SkillDetail] 恢复完成: version=${result.restored_version}, synced=${result.deployments_synced}`)
                              await useSkillStore.getState().fetchSkills()
                              await useSkillStore.getState().fetchDeployments()
                              await useSkillStore.getState().fetchBackups(skillId!)
                              toast.success(`已恢复到 ${backup.version || '此版本'}，${result.deployments_synced} 个部署已同步`)
                              if (skill?.local_path) {
                                skillsApi.readFile(skill.local_path + '/SKILL.md').then(setSkillContent).catch(() => {})
                              }
                            } catch (e) {
                              console.error('[SkillDetail] 恢复失败:', e)
                              toast.error('恢复失败: ' + String(e))
                            } finally {
                              setRestoring(null)
                            }
                          }}
                        >
                          {restoring === backup.id ? '恢复中...' : '恢复此版本'}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* 批量删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {skill?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将删除该 Skill 的所有 {skillDeployments.length} 个部署（包括磁盘文件）和数据库记录。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-honey-500 hover:bg-honey-600 text-white"
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleBatchDelete(false) }}
            >
              {deleting ? '删除中...' : '从所有部署删除'}
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-strawberry-500 hover:bg-strawberry-600 text-white"
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleBatchDelete(true) }}
            >
              {deleting ? '删除中...' : '完全删除（含本地库）'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
