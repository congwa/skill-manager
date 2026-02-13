import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

type ImportStep = 'input' | 'cloning' | 'results' | 'deploy' | 'done'

interface FoundSkill {
  name: string
  status: 'new' | 'exists' | 'conflict'
  selected: boolean
}

export default function GitImport() {
  const navigate = useNavigate()
  const [step, setStep] = useState<ImportStep>('input')
  const [platform, setPlatform] = useState('github')
  const [url, setUrl] = useState('')
  const [authType, setAuthType] = useState('ssh')
  const [cloneProgress, setCloneProgress] = useState(0)
  const [cloneStatus, setCloneStatus] = useState('正在连接远程仓库...')
  const [foundSkills, setFoundSkills] = useState<FoundSkill[]>([])
  const [deployProgress, setDeployProgress] = useState(0)
  const handleStartImport = () => {
    if (!url) { toast.error('请输入仓库地址'); return }
    setStep('cloning')
    setCloneProgress(0)
    const statuses = ['正在连接远程仓库...', '正在接收数据 (2.3 MB / 5.1 MB)...', '正在解压文件...', '正在扫描 Skill...']
    let i = 0
    const iv = setInterval(() => {
      setCloneProgress((p) => {
        if (p >= 100) {
          clearInterval(iv)
          setFoundSkills([
            { name: 'react-best-practices', status: 'new', selected: true },
            { name: 'docker-deploy', status: 'new', selected: true },
            { name: 'tailwindcss', status: 'conflict', selected: false },
            { name: 'python-testing', status: 'exists', selected: false },
          ])
          setStep('results')
          return 100
        }
        i = Math.min(i + 1, statuses.length - 1)
        setCloneStatus(statuses[i])
        return p + 5
      })
    }, 200)
  }

  const handleImportSelected = () => {
    setStep('deploy')
    setDeployProgress(0)
    const iv = setInterval(() => {
      setDeployProgress((p) => {
        if (p >= 100) { clearInterval(iv); setStep('done'); return 100 }
        return p + 10
      })
    }, 300)
  }

  const toggleSkill = (name: string) => {
    setFoundSkills((prev) => prev.map((s) => s.name === name ? { ...s, selected: !s.selected } : s))
  }

  const statusColors = { new: 'bg-mint-100 text-mint-500', exists: 'bg-sky-100 text-sky-500', conflict: 'bg-honey-100 text-honey-500' }
  const statusLabels = { new: '新增', exists: '已存在', conflict: '冲突' }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-display font-bold text-cream-800">从 Git 仓库导入</h1>

      <AnimatePresence mode="wait">
        {/* Step 1: 输入 */}
        {step === 'input' && (
          <motion.div key="input" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="step-content space-y-6">
            <Tabs value={platform} onValueChange={setPlatform}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="github"><GitBranch className="h-4 w-4 mr-1" /> GitHub</TabsTrigger>
                <TabsTrigger value="gitee"><GitBranch className="h-4 w-4 mr-1" /> Gitee</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-2">
              <Label>仓库地址</Label>
              <Input placeholder="https://github.com/user/skills" value={url} onChange={(e) => setUrl(e.target.value)}
                className="h-12 rounded-full text-base" />
            </div>
            <div className="space-y-2">
              <Label>认证方式</Label>
              <RadioGroup value={authType} onValueChange={setAuthType} className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="ssh" id="import-ssh" /><Label htmlFor="import-ssh">SSH Key</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="token" id="import-token" /><Label htmlFor="import-token">HTTPS Token</Label></div>
              </RadioGroup>
            </div>
            <Button onClick={handleStartImport} className="w-full bg-peach-500 hover:bg-peach-600 text-white rounded-xl h-12 text-base">
              开始导入 <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          </motion.div>
        )}

        {/* Step 2: 克隆 */}
        {step === 'cloning' && (
          <motion.div key="cloning" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="step-content text-center space-y-6 py-12">
            <div className="text-6xl">🐱📦</div>
            <h2 className="text-xl font-display font-bold text-cream-800">正在克隆仓库...</h2>
            <Progress value={cloneProgress} className="h-3 max-w-sm mx-auto" />
            <p className="text-lg font-display font-bold text-peach-600">{cloneProgress}%</p>
            <p className="text-sm text-cream-500">{cloneStatus}</p>
          </motion.div>
        )}

        {/* Step 3: 扫描结果 */}
        {step === 'results' && (
          <motion.div key="results" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="step-content space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-display font-bold text-cream-800">发现 {foundSkills.length} 个 Skill</h2>
              <p className="text-sm text-cream-500 mt-1">
                <span className="text-mint-500">{foundSkills.filter((s) => s.status === 'new').length} 个新增</span>
                {' · '}
                <span className="text-sky-500">{foundSkills.filter((s) => s.status === 'exists').length} 个已存在</span>
                {' · '}
                <span className="text-honey-500">{foundSkills.filter((s) => s.status === 'conflict').length} 个冲突</span>
              </p>
            </div>
            <div className="space-y-2">
              {foundSkills.map((skill, i) => (
                <motion.div
                  key={skill.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06 } }}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                    skill.status === 'conflict' ? 'border-l-[3px] border-l-honey-400 border-cream-200' : 'border-cream-200'
                  } ${skill.selected ? 'bg-peach-50/50' : 'bg-card'}`}
                >
                  <Checkbox checked={skill.selected} onCheckedChange={() => toggleSkill(skill.name)} />
                  <h3 className="font-semibold text-cream-800 flex-1">{skill.name}</h3>
                  <Badge variant="outline" className={`text-xs ${statusColors[skill.status]}`}>
                    {statusLabels[skill.status]}
                  </Badge>
                </motion.div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('input')}>返回</Button>
              <Button onClick={handleImportSelected} disabled={!foundSkills.some((s) => s.selected)}
                className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
                导入选中的 Skill ({foundSkills.filter((s) => s.selected).length})
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 4: 部署 */}
        {step === 'deploy' && (
          <motion.div key="deploy" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="step-content text-center space-y-6 py-12">
            <h2 className="text-xl font-display font-bold text-cream-800">正在导入 Skill...</h2>
            <Progress value={deployProgress} className="h-3 max-w-sm mx-auto" />
            <p className="text-sm text-cream-500">写入本地 Skill 库 + 数据库...</p>
          </motion.div>
        )}

        {/* Step 5: 完成 */}
        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="step-content text-center space-y-6 py-12">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
              <div className="text-6xl">🎉🐱</div>
            </motion.div>
            <h2 className="text-2xl font-display font-bold text-cream-800">导入完成！</h2>
            <p className="text-cream-500">
              导入了 {foundSkills.filter((s) => s.selected).length} 个 Skill
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate('/skills')} className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
                查看 Skill 列表
              </Button>
              <Button variant="ghost" onClick={() => { setStep('input'); setUrl(''); setFoundSkills([]) }}>继续导入</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
