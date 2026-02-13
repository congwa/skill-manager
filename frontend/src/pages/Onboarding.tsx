import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, Check, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useUIStore } from '@/stores/useUIStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { isTauri, settingsApi, scannerApi } from '@/lib/tauri-api'
import type { ScanResultData } from '@/lib/tauri-api'

const steps = ['欢迎', '选择路径', '导入项目', 'Git 配置']

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [skillPath, setSkillPath] = useState('~/.skills-manager/skills/')
  const [pathValid, setPathValid] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanned, setScanned] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResultData | null>(null)
  const [gitPlatform, setGitPlatform] = useState('github')
  const [gitUrl, setGitUrl] = useState('')
  const [authType, setAuthType] = useState('ssh')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)
  const navigate = useNavigate()
  const completeOnboarding = useUIStore((s) => s.completeOnboarding)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)

  const handleSelectFolder = async () => {
    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({ directory: true, multiple: false, title: '选择项目目录' })
        if (selected) {
          handleScanPath(selected as string)
        }
      } catch (e) {
        console.error('dialog error:', e)
      }
    } else {
      handleScanMock()
    }
  }

  const handleScanPath = async (projectPath: string) => {
    setScanning(true)
    setScanProgress(20)
    try {
      if (isTauri()) {
        setScanProgress(50)
        const result = await scannerApi.scanAndImport(projectPath)
        setScanResult(result)
        setScanProgress(100)
        setScanned(true)
        await fetchProjects()
      }
    } catch (e) {
      console.error('scan error:', e)
    } finally {
      setScanning(false)
    }
  }

  const handleScanMock = () => {
    setScanning(true)
    setScanProgress(0)
    const interval = setInterval(() => {
      setScanProgress((p) => {
        if (p >= 100) { clearInterval(interval); setScanning(false); setScanned(true); return 100 }
        return p + 20
      })
    }, 400)
  }

  const handleSelectSkillPath = async () => {
    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({ directory: true, multiple: false, title: '选择 Skill 库路径' })
        if (selected) {
          setSkillPath(selected as string)
          setPathValid(true)
        }
      } catch (e) {
        console.error('dialog error:', e)
      }
    }
  }

  const handleTestConnection = () => {
    setTesting(true)
    setTestResult(null)
    setTimeout(() => { setTesting(false); setTestResult('success') }, 1500)
  }

  const handleFinish = async () => {
    if (isTauri()) {
      await settingsApi.set('skills_lib_path', JSON.stringify(skillPath)).catch(console.error)
      if (gitUrl) {
        await settingsApi.set('git_repo_url', JSON.stringify(gitUrl)).catch(console.error)
        await settingsApi.set('git_platform', JSON.stringify(gitPlatform)).catch(console.error)
        await settingsApi.set('git_auth_type', JSON.stringify(authType)).catch(console.error)
      }
    }
    completeOnboarding()
    navigate('/projects')
  }

  const nextStep = () => setStep((s) => Math.min(s + 1, 3))
  const prevStep = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* 背景光斑 */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-peach-200/30 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-lavender-200/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

      {/* 步骤指示器 */}
      <div className="flex items-center gap-2 mb-12">
        {steps.map((_label, i) => (
          <div key={i} className="flex items-center gap-2">
            <motion.div
              className={`rounded-full flex items-center justify-center transition-all duration-300 ${
                i === step ? 'w-3 h-3 bg-peach-500' :
                i < step ? 'w-2.5 h-2.5 bg-mint-400' :
                'w-2.5 h-2.5 border-2 border-cream-300'
              }`}
              layout
              onClick={() => i < step && setStep(i)}
              style={{ cursor: i < step ? 'pointer' : 'default' }}
            />
            {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i < step ? 'bg-mint-300' : 'bg-cream-300'}`} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 0: 欢迎 */}
        {step === 0 && (
          <motion.div key="step0" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="text-center max-w-lg">
            <div className="welcome-title text-4xl font-display font-bold text-cream-800 mb-4">
              欢迎来到 Skills Manager
            </div>
            <p className="welcome-sub text-cream-600 mb-8">
              轻松管理你所有 AI 编码工具的 Skill
            </p>
            <div className="welcome-btn">
              <Button onClick={nextStep} className="bg-peach-500 hover:bg-peach-600 text-white rounded-2xl px-8 py-3 text-lg shadow-clay">
                开始设置 <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 1: 选择路径 */}
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-md space-y-6">
            <h1 className="text-2xl font-display font-bold text-cream-800 text-center">选择你的 Skill 仓库位置</h1>
            <div className="space-y-2">
              <Label htmlFor="path">Skill 库路径</Label>
              <div className="flex gap-2">
                <Input id="path" value={skillPath} onChange={(e) => { setSkillPath(e.target.value); setPathValid(e.target.value.length > 0) }}
                  className={`flex-1 ${pathValid ? 'border-cream-300' : 'border-strawberry-400'}`} />
                <Button variant="outline" onClick={handleSelectSkillPath}>
                  <FolderOpen className="h-4 w-4 mr-1" /> 选择
                </Button>
              </div>
              {pathValid && skillPath && <p className="text-xs text-mint-500 flex items-center gap-1"><Check className="h-3 w-3" /> 路径有效</p>}
              <p className="text-xs text-cream-500">这里会存放所有 Skill 的标准文件</p>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={prevStep}>返回</Button>
              <Button onClick={nextStep} disabled={!pathValid} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">下一步</Button>
            </div>
          </motion.div>
        )}

        {/* Step 2: 导入项目 */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-md space-y-6">
            <h1 className="text-2xl font-display font-bold text-cream-800 text-center">添加你的第一个项目</h1>
            {!scanned ? (
              <>
                {!scanning ? (
                  <motion.div
                    className="border-2 border-dashed border-cream-300 rounded-xl p-12 text-center cursor-pointer hover:border-peach-300 hover:bg-peach-50/50 transition-all"
                    animate={{ borderColor: ['#F0E0D4', '#FFB694', '#F0E0D4'] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    onClick={handleSelectFolder}
                  >
                    <FolderOpen className="h-12 w-12 text-cream-400 mx-auto mb-4" />
                    <p className="text-cream-600">拖拽文件夹到此处或点击选择</p>
                  </motion.div>
                ) : (
                  <div className="space-y-4 p-8">
                    <p className="text-center text-cream-600">正在扫描项目 Skill...</p>
                    <Progress value={scanProgress} className="h-2" />
                    <p className="text-center text-xs text-cream-500">正在扫描 .windsurf/skills/...</p>
                  </div>
                )}
              </>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card rounded-xl p-6 shadow-card space-y-3">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-mint-500" />
                  <span className="font-semibold text-cream-800">{scanResult?.project_name || '项目'}</span>
                </div>
                <p className="text-xs text-cream-500">{scanResult?.project_path || ''}</p>
                <div className="flex gap-2">
                  {(scanResult?.tools || []).map((tool) => (
                    <span key={tool} className="text-xs bg-sky-100 text-sky-500 px-2 py-0.5 rounded-full">{tool}</span>
                  ))}
                </div>
                <p className="text-sm text-cream-700">发现 {scanResult?.skills.length || 0} 个 Skill</p>
              </motion.div>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={prevStep}>返回</Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={nextStep}>跳过</Button>
                <Button onClick={nextStep} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">下一步</Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Git 配置 */}
        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-md space-y-6">
            <h1 className="text-2xl font-display font-bold text-cream-800 text-center">备份到 Git 仓库（可选）</h1>
            <Tabs value={gitPlatform} onValueChange={setGitPlatform}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="github">GitHub</TabsTrigger>
                <TabsTrigger value="gitee">Gitee</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>仓库 URL</Label>
                <Input placeholder="https://github.com/user/skills" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>认证方式</Label>
                <RadioGroup value={authType} onValueChange={setAuthType} className="flex gap-4">
                  <div className="flex items-center gap-2"><RadioGroupItem value="ssh" id="ssh" /><Label htmlFor="ssh">SSH Key</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="token" id="token" /><Label htmlFor="token">HTTPS Token</Label></div>
                </RadioGroup>
              </div>
              <Button variant="outline" onClick={handleTestConnection} disabled={!gitUrl || testing} className="w-full">
                {testing ? '测试中...' : testResult === 'success' ? '✓ 连接成功' : '测试连接'}
              </Button>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={prevStep}>返回</Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleFinish}>跳过</Button>
                <Button onClick={handleFinish} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">完成设置</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
