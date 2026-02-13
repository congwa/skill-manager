import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon, Folder, GitBranch, RefreshCw,
  Download, Wrench, Database, Info, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { cn, toolColors, toolNames } from '@/lib/utils'
import type { ToolName } from '@/types'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'

const sections = [
  { id: 'general', label: '通用', icon: SettingsIcon },
  { id: 'library', label: '本地 Skill 库', icon: Folder },
  { id: 'git', label: 'Git 仓库', icon: GitBranch },
  { id: 'sync', label: '同步', icon: RefreshCw },
  { id: 'update', label: '更新', icon: Download },
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
  const [clearOpen, setClearOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [savedField, setSavedField] = useState<string | null>(null)

  const showSaved = (field: string) => {
    setSavedField(field)
    setTimeout(() => setSavedField(null), 1500)
  }

  const handleTestConnection = () => {
    setTesting(true)
    setTestResult(null)
    setTimeout(() => { setTesting(false); setTestResult('success') }, 1500)
  }

  const tools: { name: ToolName; pattern: string; globalPath: string; detected: boolean }[] = [
    { name: 'windsurf', pattern: '.windsurf/skills/', globalPath: '~/.windsurf/skills/', detected: true },
    { name: 'cursor', pattern: '.cursor/skills/', globalPath: '~/.cursor/skills/', detected: true },
    { name: 'claude-code', pattern: '.claude/skills/', globalPath: '~/.claude/skills/', detected: true },
    { name: 'codex', pattern: '.codex/skills/', globalPath: '~/.codex/skills/', detected: false },
    { name: 'trae', pattern: '.trae/skills/', globalPath: '~/.trae/skills/', detected: false },
  ]

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
                  <Button variant="outline" size="sm"><Folder className="h-4 w-4 mr-1" /> 浏览</Button>
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
            <Card>
              <CardHeader><CardTitle>Git 仓库配置</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={gitPlatform} onValueChange={setGitPlatform}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="github">GitHub</TabsTrigger>
                    <TabsTrigger value="gitee">Gitee</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>仓库地址</Label>
                    <Input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} />
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
                  <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing} className={cn(
                    'w-full',
                    testResult === 'success' && 'border-mint-400 text-mint-500',
                    testResult === 'fail' && 'border-strawberry-400 text-strawberry-500',
                  )}>
                    {testing ? '测试中...' : testResult === 'success' ? '✓ 连接成功' : testResult === 'fail' ? '✗ 连接失败' : '测试连接'}
                  </Button>
                </div>
              </CardContent>
            </Card>
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

          {/* 更新设置 */}
          {activeSection === 'update' && (
            <Card>
              <CardHeader><CardTitle>更新设置</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div><Label>检测频率</Label></div>
                  <Select value={settings.update_check_frequency} onValueChange={(v) => updateSettings({ update_check_frequency: v as 'startup' | 'hourly' | 'daily' | 'manual' })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="startup">启动时</SelectItem>
                      <SelectItem value="hourly">每小时</SelectItem>
                      <SelectItem value="daily">每日</SelectItem>
                      <SelectItem value="manual">手动</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div><Label>自动更新</Label><p className="text-xs text-cream-500 mt-0.5">发现新版本时自动更新（仅本地 Skill 库）</p></div>
                  <Switch checked={settings.auto_update} onCheckedChange={(v) => updateSettings({ auto_update: v })} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 工具目录 */}
          {activeSection === 'tools' && (
            <div className="space-y-4">
              <h2 className="text-lg font-display font-bold text-cream-800">工具目录配置</h2>
              {tools.map((tool) => (
                <Card key={tool.name} className={cn('border', tool.detected ? 'border-cream-200' : 'border-cream-200 opacity-60')}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: tool.detected ? toolColors[tool.name] : '#D4C4B0' }}>
                      {toolNames[tool.name][0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-cream-800">{toolNames[tool.name]}</h3>
                      <p className="text-xs text-cream-500">模式：{tool.pattern}</p>
                    </div>
                    <Input defaultValue={tool.globalPath} className="w-56" disabled={!tool.detected} />
                    <Badge variant="outline" className={cn('text-xs', tool.detected ? 'bg-mint-100 text-mint-500' : 'bg-cream-200 text-cream-500')}>
                      {tool.detected ? '已检测到' : '未安装'}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
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
                  <Button variant="outline" size="sm"><Folder className="h-4 w-4 mr-1" /> 浏览</Button>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">历史记录保留</Label>
                  <Input type="number" defaultValue="90" className="w-20" />
                  <span className="text-sm text-cream-500">天</span>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setClearOpen(true)}>立即清理</Button>
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
                <motion.div className="w-16 h-16 bg-gradient-to-br from-peach-400 to-peach-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto shadow-clay"
                  whileHover={{ scale: 1.05, rotate: 5 }}>
                  SM
                </motion.div>
                <h2 className="text-xl font-display font-bold text-cream-800">Skills Manager</h2>
                <p className="text-sm text-cream-500">v0.1.0</p>
                <p className="text-xs text-cream-400">React + Vite + TypeScript + TailwindCSS + shadcn/ui</p>
                <p className="text-xs text-cream-400">Zustand + Framer Motion + GSAP</p>
                <p className="text-xs text-cream-400 mt-4">MIT License</p>
                <div className="flex gap-3 justify-center mt-4">
                  <Button variant="outline" size="sm">检查应用更新</Button>
                  <Button variant="ghost" size="sm">GitHub</Button>
                  <Button variant="ghost" size="sm">文档</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>

      {/* 清理确认 */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清理历史记录</AlertDialogTitle>
            <AlertDialogDescription>将清理 23 条历史记录，确认？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setClearOpen(false); toast.success('已清理 23 条历史记录') }}>确认清理</AlertDialogAction>
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
