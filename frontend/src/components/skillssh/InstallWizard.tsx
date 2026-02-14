import { useState } from 'react'
import { Download, Package, Loader2, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn, toolNames } from '@/lib/utils'
import { skillsShApi } from '@/lib/tauri-api'
import type { RepoSkillEntry, DeployTargetParam } from '@/lib/tauri-api'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSkillStore } from '@/stores/useSkillStore'
import { toast } from 'sonner'
import type { ToolName } from '@/types'

const TOOLS: ToolName[] = ['windsurf', 'cursor', 'claude-code', 'codex', 'trae']

interface InstallWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ownerRepo: string
  skillName: string
  skillEntry: RepoSkillEntry | null
  installs?: number
}

type InstallScope = 'global' | 'project'

export default function InstallWizard({
  open, onOpenChange, ownerRepo, skillEntry, skillName, installs,
}: InstallWizardProps) {
  const projects = useProjectStore((s) => s.projects)
  const [step, setStep] = useState(1)
  const [selectedTools, setSelectedTools] = useState<ToolName[]>(['windsurf'])
  const [scope, setScope] = useState<InstallScope>('global')
  const [selectedProject, setSelectedProject] = useState('')
  const [installing, setInstalling] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const toggleTool = (tool: ToolName) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    )
  }

  const handleInstall = async () => {
    if (!skillEntry) return
    if (selectedTools.length === 0) { toast.error('请至少选择一个目标工具'); return }
    if (scope === 'project' && !selectedProject) { toast.error('请选择目标项目'); return }

    setInstalling(true)
    try {
      const deployTargets: DeployTargetParam[] = selectedTools.map((tool) => ({
        project_id: scope === 'project' ? selectedProject : null,
        tool,
      }))

      console.log(`[InstallWizard] 安装 ${skillName} from ${ownerRepo}`)
      const installResult = await skillsShApi.install({
        ownerRepo,
        skillPath: skillEntry.skill_path,
        skillName,
        folderSha: skillEntry.folder_sha,
        files: skillEntry.files,
        deployTargets,
      })

      if (installResult.conflict) {
        const ct = installResult.conflict.conflict_type
        if (ct === 'locally_modified') {
          toast.warning(`${skillName} 本地已有修改，是否覆盖安装？`, {
            action: {
              label: '覆盖安装',
              onClick: () => handleForceInstall(deployTargets),
            },
          })
          setInstalling(false)
          return
        }
        if (ct === 'already_installed') {
          toast.warning(`${skillName} 已安装，是否重新安装？`, {
            action: {
              label: '重新安装',
              onClick: () => handleForceInstall(deployTargets),
            },
          })
          setInstalling(false)
          return
        }
      }

      await useSkillStore.getState().fetchSkills()
      await useSkillStore.getState().fetchDeployments()
      setResult({
        success: true,
        message: `已下载 ${installResult.files_downloaded} 个文件，创建 ${installResult.deployments_created} 个部署`,
      })
      setStep(3)
      toast.success(`${skillName} 安装成功`)
    } catch (e) {
      console.error('[InstallWizard] 安装失败:', e)
      setResult({ success: false, message: String(e) })
      setStep(3)
      toast.error('安装失败: ' + String(e))
    } finally {
      setInstalling(false)
    }
  }

  const handleForceInstall = async (deployTargets: DeployTargetParam[]) => {
    if (!skillEntry) return
    setInstalling(true)
    try {
      const installResult = await skillsShApi.install({
        ownerRepo,
        skillPath: skillEntry.skill_path,
        skillName,
        folderSha: skillEntry.folder_sha,
        files: skillEntry.files,
        deployTargets,
        forceOverwrite: true,
      })
      await useSkillStore.getState().fetchSkills()
      await useSkillStore.getState().fetchDeployments()
      setResult({
        success: true,
        message: `已下载 ${installResult.files_downloaded} 个文件，创建 ${installResult.deployments_created} 个部署`,
      })
      setStep(3)
      toast.success(`${skillName} 安装成功`)
    } catch (e) {
      toast.error('安装失败: ' + String(e))
    } finally {
      setInstalling(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setTimeout(() => {
      setStep(1)
      setSelectedTools(['windsurf'])
      setScope('global')
      setSelectedProject('')
      setResult(null)
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-peach-500" />
            安装 {skillName}
          </DialogTitle>
          <DialogDescription>
            来源: {ownerRepo}
            {installs != null && ` · ${installs >= 1000 ? `${(installs / 1000).toFixed(1)}K` : installs} 次安装`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: 选择工具 */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <label className="text-sm font-medium text-cream-700">目标工具（可多选）</label>
              <div className="grid grid-cols-2 gap-2">
                {TOOLS.map((tool) => (
                  <label
                    key={tool}
                    className={cn(
                      'flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors',
                      selectedTools.includes(tool)
                        ? 'border-peach-400 bg-peach-50'
                        : 'border-cream-200 hover:bg-cream-50'
                    )}
                  >
                    <Checkbox
                      checked={selectedTools.includes(tool)}
                      onCheckedChange={() => toggleTool(tool)}
                    />
                    <span className="text-sm font-medium text-cream-800">
                      {toolNames[tool]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-cream-700">安装范围</label>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={cn(
                    'p-3 rounded-xl border cursor-pointer transition-colors text-center',
                    scope === 'global' ? 'border-peach-400 bg-peach-50' : 'border-cream-200 hover:bg-cream-50'
                  )}
                  onClick={() => setScope('global')}
                >
                  <p className="text-sm font-medium text-cream-800">全局安装</p>
                  <p className="text-xs text-cream-500 mt-1">所有项目可用</p>
                </label>
                <label
                  className={cn(
                    'p-3 rounded-xl border cursor-pointer transition-colors text-center',
                    scope === 'project' ? 'border-peach-400 bg-peach-50' : 'border-cream-200 hover:bg-cream-50'
                  )}
                  onClick={() => setScope('project')}
                >
                  <p className="text-sm font-medium text-cream-800">项目级安装</p>
                  <p className="text-xs text-cream-500 mt-1">仅限选定项目</p>
                </label>
              </div>
            </div>

            {scope === 'project' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-cream-700">选择项目</label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="border-cream-300"><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        <span className="text-cream-400 text-xs ml-2">{p.path}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {skillEntry && (
              <div className="flex items-center gap-2 text-xs text-cream-500 bg-cream-50 p-3 rounded-lg">
                <Package className="h-4 w-4" />
                <span>{skillEntry.file_count} 个文件</span>
                <span>·</span>
                <span>路径: {skillEntry.skill_path}</span>
              </div>
            )}
          </div>
        )}

        {/* Step 3: 结果 */}
        {step === 3 && result && (
          <div className="py-8 text-center space-y-3">
            {result.success ? (
              <>
                <div className="w-12 h-12 bg-mint-100 rounded-full flex items-center justify-center mx-auto">
                  <Check className="h-6 w-6 text-mint-500" />
                </div>
                <h3 className="text-lg font-semibold text-cream-800">安装成功</h3>
                <p className="text-sm text-cream-500">{result.message}</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-strawberry-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="h-6 w-6 text-strawberry-500" />
                </div>
                <h3 className="text-lg font-semibold text-cream-800">安装失败</h3>
                <p className="text-sm text-strawberry-500">{result.message}</p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" onClick={handleClose}>取消</Button>
              <Button
                className="bg-peach-500 hover:bg-peach-600 text-white"
                disabled={selectedTools.length === 0 || (scope === 'project' && !selectedProject) || installing}
                onClick={handleInstall}
              >
                {installing ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 安装中...</>
                ) : (
                  <><Download className="h-4 w-4 mr-1" /> 确认安装</>
                )}
              </Button>
            </>
          )}
          {step === 3 && (
            <Button onClick={handleClose} className="bg-peach-500 hover:bg-peach-600 text-white">
              完成
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
