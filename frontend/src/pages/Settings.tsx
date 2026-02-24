import { useState } from 'react'
import { motion } from 'framer-motion'
import appIcon from '@/assets/app-icon.png'
import {
  Settings as SettingsIcon, Folder, GitBranch, RefreshCw,
  Wrench, Database, Info, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { cn } from '@/lib/utils'
import { ALL_TOOLS } from '@/lib/tools'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { settingsApi, gitApi } from '@/lib/tauri-api'

import { ToolIcon } from '@/components/ui/ToolIcon'

function ToolCard({ tool }: { tool: typeof ALL_TOOLS[number] }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={cn(
        'border border-cream-150 rounded-xl p-3 cursor-pointer transition-all hover:shadow-sm hover:border-cream-300 bg-white',
        open && 'border-cream-300 shadow-sm'
      )}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="flex items-center gap-3">
        <ToolIcon tool={tool.id} size={36} rounded="rounded-xl" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-cream-800 truncate">{tool.name}</p>
          <p className="text-xs text-cream-400 font-mono truncate">{tool.projectDir}</p>
        </div>
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tool.color }} />
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-cream-100 space-y-1.5 text-xs text-cream-500">
          <div className="flex gap-2">
            <span className="text-cream-400 shrink-0">项目级：</span>
            <code className="font-mono text-cream-600">{'{project}/'}{tool.projectDir}</code>
          </div>
          <div className="flex gap-2">
            <span className="text-cream-400 shrink-0">全局：</span>
            <code className="font-mono text-cream-600">{'~/'}{tool.globalDir}</code>
          </div>
        </div>
      )}
    </div>
  )
}

const sections = [
  { id: 'general', label: '通用', icon: SettingsIcon },
  { id: 'library', label: '本地 Skill 库', icon: Folder },
  { id: 'git', label: 'Git 仓库', icon: GitBranch },
  { id: 'sync', label: '同步', icon: RefreshCw },
  { id: 'tools', label: '工具目录', icon: Wrench },
  { id: 'data', label: '数据管理', icon: Database },
  { id: 'about', label: '关于', icon: Info },
]

export default function Settings() {
  const { settings, updateSettings } = useSettingsStore()
  const { theme: currentTheme, setTheme: setNextTheme } = useTheme()
  const [activeSection, setActiveSection] = useState('general')
  const [gitPlatform, setGitPlatform] = useState('github')
  const [gitUrl, setGitUrl] = useState('https://github.com/congwa/cong_wa_skills')
  const [authType, setAuthType] = useState('ssh')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)
  const [factoryResetOpen, setFactoryResetOpen] = useState(false)
  const [factoryResetFinalOpen, setFactoryResetFinalOpen] = useState(false)
  const [factoryResetConfirmText, setFactoryResetConfirmText] = useState('')
  const [factoryResetLoading, setFactoryResetLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [savedField, setSavedField] = useState<string | null>(null)
  const [githubToken, setGithubToken] = useState('')
  const [tokenSaving, setTokenSaving] = useState(false)

  const openGitHub = async () => {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open('https://github.com/congwa/skill-manager')
  }

  const handleFactoryReset = async () => {
    setFactoryResetLoading(true)
    try {
      await settingsApi.resetApp()
      toast.success('所有数据已清空，应用即将重启')
      setFactoryResetFinalOpen(false)
      setFactoryResetConfirmText('')
      setTimeout(() => {
        window.location.reload()
      }, 800)
    } catch (e) {
      console.error('[Settings] 清空所有数据失败:', e)
      toast.error('清空失败: ' + String(e))
    } finally {
      setFactoryResetLoading(false)
    }
  }

  const showSaved = (field: string) => {
    setSavedField(field)
    setTimeout(() => setSavedField(null), 1500)
  }

  const handleSelectSkillLibPath = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false, title: '选择 Skill 库路径' })
      if (selected) {
        updateSettings({ skill_library_path: selected as string })
      }
    } catch (e) {
      console.error('dialog error:', e)
    }
  }

  const handleSelectBackupPath = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false, title: '选择备份目录' })
      if (selected) {
        await settingsApi.set('backup_dir', selected as string)
        toast.success('备份目录已更新')
      }
    } catch (e) {
      console.error('dialog error:', e)
    }
  }

  const handleSaveGitConfig = async () => {
    try {
      await settingsApi.saveGitConfig({
        provider: gitPlatform,
        remoteUrl: gitUrl,
        authType: authType,
        branch: 'main',
        autoExport: 'manual',
      })
      toast.success('Git 配置已保存')
    } catch (e) {
      console.error('save git config error:', e)
      toast.error('保存失败')
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await gitApi.testConnection(gitUrl, authType)
      setTestResult(result.success ? 'success' : 'fail')
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      console.error('[Settings] 连接测试失败:', e)
      setTestResult('fail')
      toast.error('连接测试失败: ' + String(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-10rem)]">
      {/* 左侧导航 */}
      <nav className="w-52 shrink-0 space-y-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left',
              activeSection === section.id
                ? 'bg-peach-100 text-peach-700 font-semibold border-l-[3px] border-l-peach-500'
                : 'text-cream-600 hover:bg-peach-50 hover:text-cream-800'
            )}
          >
            <section.icon className="h-4 w-4 shrink-0" />
            {section.label}
          </button>
        ))}
      </nav>

      {/* 右侧面板 */}
      <div className="flex-1 min-w-0">
        <motion.div key={activeSection} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

          {/* 通用设置 */}
          {activeSection === 'general' && (
            <Card>
              <CardHeader><CardTitle>通用设置</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div><Label>语言</Label><p className="text-xs text-cream-500 mt-0.5">界面显示语言</p></div>
                  <Select value={settings.language} onValueChange={(v) => { updateSettings({ language: v as 'zh-CN' | 'en' }); showSaved('language') }}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-CN">简体中文</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                  {savedField === 'language' && <Check className="h-4 w-4 text-mint-500 animate-in fade-in" />}
                </div>
                <div className="space-y-3">
                  <Label>主题</Label>
                  <div className="flex gap-3">
                    {(['light', 'dark', 'system'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => { updateSettings({ theme: t }); setNextTheme(t); showSaved('theme') }}
                        className={cn(
                          'w-20 h-10 rounded-xl border-2 flex items-center justify-center text-xs transition-all',
                          currentTheme === t
                            ? 'border-peach-400 bg-peach-50 text-peach-700 font-semibold'
                            : 'border-cream-200 bg-card text-cream-500 hover:border-peach-200'
                        )}
                      >
                        {t === 'light' ? '亮色' : t === 'dark' ? '暗色' : '跟随系统'}
                        {currentTheme === t && <Check className="h-3 w-3 ml-1" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div><Label>启动行为</Label><p className="text-xs text-cream-500 mt-0.5">应用启动时打开的页面</p></div>
                  <Select value={settings.startup_page} onValueChange={(v) => { updateSettings({ startup_page: v as 'last' | 'projects' | 'sync' }); showSaved('startup') }}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last">上次页面</SelectItem>
                      <SelectItem value="projects">项目列表</SelectItem>
                      <SelectItem value="sync">同步中心</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div><Label>通知</Label><p className="text-xs text-cream-500 mt-0.5">启用系统通知</p></div>
                  <Switch checked={settings.notifications_enabled} onCheckedChange={(v) => { updateSettings({ notifications_enabled: v }); showSaved('notify') }} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 本地 Skill 库 */}
          {activeSection === 'library' && (
            <Card>
              <CardHeader><CardTitle>本地 Skill 库</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">库路径</Label>
                  <Input value={settings.skill_library_path} onChange={(e) => updateSettings({ skill_library_path: e.target.value })} className="flex-1" />
                  <Button variant="outline" size="sm" onClick={handleSelectSkillLibPath}><Folder className="h-4 w-4 mr-1" /> 浏览</Button>
                </div>
                <div className="grid grid-cols-3 gap-4 p-4 bg-cream-50 rounded-xl">
                  <div><p className="text-xs text-cream-500">Skill 数量</p><p className="font-bold text-cream-800">8</p></div>
                  <div><p className="text-xs text-cream-500">占用空间</p><p className="font-bold text-cream-800">2.3 MB</p></div>
                  <div><p className="text-xs text-cream-500">最近修改</p><p className="font-bold text-cream-800">刚刚</p></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Git 仓库 */}
          {activeSection === 'git' && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Git 仓库配置</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-cream-500">
                    配置 Git 仓库后，可在技能库页面导入 Git Skill，也可在技能详情的"同步"Tab 将数据库推送到 Git。
                  </p>
                  <Tabs value={gitPlatform} onValueChange={setGitPlatform}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="github">GitHub</TabsTrigger>
                      <TabsTrigger value="gitee">Gitee</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>仓库地址</Label>
                      <Input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/user/my-skills" />
                    </div>
                    <div className="space-y-1">
                      <Label>认证方式</Label>
                      <RadioGroup value={authType} onValueChange={setAuthType} className="flex gap-4">
                        <div className="flex items-center gap-2"><RadioGroupItem value="ssh" id="s-ssh" /><Label htmlFor="s-ssh">SSH Key</Label></div>
                        <div className="flex items-center gap-2"><RadioGroupItem value="token" id="s-token" /><Label htmlFor="s-token">HTTPS Token</Label></div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-1">
                      <Label>导出分支</Label>
                      <Input defaultValue="main" className="w-32" />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleSaveGitConfig} className="flex-1">保存配置</Button>
                      <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing} className={cn(
                        'flex-1',
                        testResult === 'success' && 'border-mint-400 text-mint-500',
                        testResult === 'fail' && 'border-strawberry-400 text-strawberry-500',
                      )}>
                        {testing ? '测试中...' : testResult === 'success' ? '✓ 连接成功' : testResult === 'fail' ? '✗ 连接失败' : '测试连接'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">GitHub Token (skills.sh)</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-cream-500">
                    用于商城搜索和安装，无 Token 时 API 限制 60 次/小时，有 Token 提升至 5000 次/小时。
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={tokenSaving}
                      onClick={async () => {
                        setTokenSaving(true)
                        try {
                          await settingsApi.set('github_token', githubToken)
                          toast.success('GitHub Token 已保存')
                          showSaved('token')
                        } catch (e) {
                          toast.error('保存失败: ' + String(e))
                        } finally {
                          setTokenSaving(false)
                        }
                      }}
                    >
                      {tokenSaving ? '保存中...' : '保存'}
                    </Button>
                    {savedField === 'token' && <Check className="h-4 w-4 text-mint-500 animate-in fade-in" />}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 同步设置 */}
          {activeSection === 'sync' && (
            <Card>
              <CardHeader><CardTitle>同步设置</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div><Label>自动导出频率</Label></div>
                  <Select value={settings.auto_export_frequency} onValueChange={(v) => updateSettings({ auto_export_frequency: v as 'manual' | 'daily' | 'on-change' })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">手动</SelectItem>
                      <SelectItem value="daily">每日</SelectItem>
                      <SelectItem value="on-change">变更时</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div><Label>变更通知</Label><p className="text-xs text-cream-500 mt-0.5">文件变更时弹出通知</p></div>
                  <Switch checked={settings.notifications_enabled} onCheckedChange={(v) => updateSettings({ notifications_enabled: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div><Label>文件监听</Label><p className="text-xs text-cream-500 mt-0.5">后台监听项目目录变更</p></div>
                  <Switch checked={settings.file_watch_enabled} onCheckedChange={(v) => updateSettings({ file_watch_enabled: v })} />
                </div>
              </CardContent>
            </Card>
          )}


          {/* 工具目录 */}
          {activeSection === 'tools' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-display font-bold text-cream-800">支持的 Agent 工具</h2>
                <p className="text-xs text-cream-400 mt-0.5">共 {ALL_TOOLS.length} 个工具 · 点击工具可查看路径规则</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {ALL_TOOLS.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </div>
          )}

          {/* 数据管理 */}
          {activeSection === 'data' && (
            <Card>
              <CardHeader><CardTitle>数据管理</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-cream-50 rounded-xl">
                  <div><p className="text-xs text-cream-500">数据库路径</p><p className="text-sm text-cream-700">~/.skills-manager/db/skills.db</p></div>
                  <div><p className="text-xs text-cream-500">数据库大小</p><p className="text-sm font-bold text-cream-800">2.3 MB</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">备份目录</Label>
                  <Input defaultValue="~/.skills-manager/backups/" className="flex-1" />
                  <Button variant="outline" size="sm" onClick={handleSelectBackupPath}><Folder className="h-4 w-4 mr-1" /> 浏览</Button>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">历史记录保留</Label>
                  <Input type="number" defaultValue="90" className="w-20" />
                  <span className="text-sm text-cream-500">天</span>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFactoryResetOpen(true)}
                    className="text-strawberry-500 border-strawberry-200"
                  >
                    清空所有数据并重启
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toast.success('数据库已导出')}>导出数据库</Button>
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="text-strawberry-500 border-strawberry-200">导入数据库</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 关于 */}
          {activeSection === 'about' && (
            <Card>
              <CardContent className="text-center py-12 space-y-4">
                <motion.img
                  src={appIcon}
                  alt="Skills Manager"
                  className="w-16 h-16 object-contain mx-auto"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                />
                <h2 className="text-xl font-display font-bold text-cream-800">Skills Manager</h2>
                <p className="text-sm text-cream-500">v0.1.0</p>
                <p className="text-xs text-cream-400">React + Vite + TypeScript + TailwindCSS + shadcn/ui</p>
                <p className="text-xs text-cream-400">Zustand + Framer Motion + GSAP</p>
                <p className="text-xs text-cream-400 mt-4">MIT License</p>
                <div className="flex gap-3 justify-center mt-4">
                  <Button variant="outline" size="sm" onClick={openGitHub}>检查应用更新</Button>
                  <Button variant="ghost" size="sm" onClick={openGitHub}>GitHub</Button>
                  <Button variant="ghost" size="sm" onClick={openGitHub}>文档</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>

      {/* 恢复初始化确认（第一次） */}
      <AlertDialog open={factoryResetOpen} onOpenChange={setFactoryResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空所有数据？</AlertDialogTitle>
            <AlertDialogDescription>
              该操作会删除项目、Skill、部署、同步记录、Git 配置和全部设置，并将应用恢复到初始化状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setFactoryResetOpen(false)
                setFactoryResetFinalOpen(true)
              }}
              className="bg-strawberry-500 hover:bg-strawberry-400"
            >
              继续
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 恢复初始化确认（第二次） */}
      <AlertDialog open={factoryResetFinalOpen} onOpenChange={setFactoryResetFinalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>二次确认：输入 RESET</AlertDialogTitle>
            <AlertDialogDescription>
              这是不可撤销操作。请输入 <span className="font-semibold text-cream-800">RESET</span> 以确认清空所有数据并立即重启应用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={factoryResetConfirmText}
            onChange={(e) => setFactoryResetConfirmText(e.target.value)}
            placeholder="请输入 RESET"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setFactoryResetConfirmText('')
              }}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFactoryReset}
              disabled={factoryResetConfirmText !== 'RESET' || factoryResetLoading}
              className="bg-strawberry-500 hover:bg-strawberry-400"
            >
              {factoryResetLoading ? '执行中...' : '确认清空并重启'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 导入确认 */}
      <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入数据库</AlertDialogTitle>
            <AlertDialogDescription>导入将覆盖当前所有数据，此操作不可撤销。导入前会自动备份当前数据库。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setImportOpen(false); toast.success('数据库已导入') }} className="bg-strawberry-500 hover:bg-strawberry-400">
              确认导入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
