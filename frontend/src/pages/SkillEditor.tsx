import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, X, Eye, EyeOff, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useSkillStore } from '@/stores/useSkillStore'
import { toast } from 'sonner'
import { skillsApi } from '@/lib/tauri-api'

export default function SkillEditor() {
  const { skillId } = useParams()
  const navigate = useNavigate()
  const skill = useSkillStore((s) => s.skills.find((sk) => sk.id === skillId))
  const [description, setDescription] = useState(skill?.description || '')
  const [version, setVersion] = useState(skill?.version || '')
  const [content, setContent] = useState('')
  const [showPreview, setShowPreview] = useState(true)
  const [saving, setSaving] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [frontmatterOpen, setFrontmatterOpen] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [loading, setLoading] = useState(true)

  useState(() => {
    if (skill?.local_path) {
      const mdPath = skill.local_path + '/SKILL.md'
      skillsApi.readFile(mdPath).then((text) => {
        setContent(text)
        setLoading(false)
      }).catch(() => {
        setContent(`---\nname: ${skill.name}\ndescription: ${skill.description}\nversion: ${skill.version}\n---\n\n# ${skill.name}\n\n${skill.description}\n`)
        setLoading(false)
      })
    } else {
      setContent(`---\nname: ${skill?.name || ''}\ndescription: ${skill?.description || ''}\nversion: ${skill?.version || ''}\n---\n\n# ${skill?.name || ''}\n\n${skill?.description || ''}\n`)
      setLoading(false)
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

  const handleSave = async () => {
    setSaving(true)
    try {
      if (skill?.local_path) {
        const mdPath = skill.local_path + '/SKILL.md'
        await skillsApi.writeFile(mdPath, content)
      }
      setSaving(false)
      setHasChanges(false)
      toast.success('保存成功')
    } catch (e) {
      console.error('save error:', e)
      setSaving(false)
      toast.error('保存失败')
    }
  }

  const handleDiscard = () => {
    if (hasChanges) {
      setDiscardOpen(true)
    } else {
      navigate(`/skills/${skillId}`)
    }
  }

  const handleChange = (setter: (v: string) => void, value: string) => {
    setter(value)
    setHasChanges(true)
  }

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)] flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleDiscard} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/skills">Skills</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem><BreadcrumbLink href={`/skills/${skillId}`}>{skill.name}</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem><BreadcrumbLink>编辑</BreadcrumbLink></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {hasChanges && (
            <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="text-xs bg-honey-100 text-honey-500 px-2 py-0.5 rounded-full">
              未保存
            </motion.span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowPreview(!showPreview)} className="rounded-lg">
            {showPreview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {showPreview ? '隐藏预览' : '显示预览'}
          </Button>
          <Button variant="ghost" onClick={handleDiscard}>
            <X className="h-4 w-4 mr-1" /> 放弃
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}
            className="bg-peach-500 hover:bg-peach-600 text-white rounded-xl">
            <Save className="h-4 w-4 mr-1" /> {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Frontmatter */}
      <Collapsible open={frontmatterOpen} onOpenChange={setFrontmatterOpen} className="shrink-0">
        <Card className="border border-cream-200 bg-cream-50">
          <CollapsibleTrigger asChild>
            <CardContent className="flex items-center justify-between p-3 cursor-pointer">
              <span className="text-sm font-semibold text-cream-700">Frontmatter</span>
              <motion.div animate={{ rotate: frontmatterOpen ? 180 : 0 }}>
                <ChevronDown className="h-4 w-4 text-cream-400" />
              </motion.div>
            </CardContent>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-3 pt-0 grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">name</Label>
                <Input value={skill.name} disabled className="bg-cream-100 text-cream-500 text-sm h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">description</Label>
                <Input value={description} onChange={(e) => handleChange(setDescription, e.target.value)} className="text-sm h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">version</Label>
                <Input value={version} onChange={(e) => handleChange(setVersion, e.target.value)} className="text-sm h-8" />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 编辑器 + 预览 */}
      <div className={`flex-1 flex gap-4 min-h-0 ${showPreview ? '' : ''}`}>
        {/* 左侧编辑区 */}
        <div className={`flex-1 min-w-0 ${showPreview ? 'w-1/2' : 'w-full'}`}>
          <Card className="h-full border border-cream-200">
            <CardContent className="p-0 h-full">
              <Textarea
                value={content}
                onChange={(e) => handleChange(setContent, e.target.value)}
                className="h-full w-full resize-none border-0 rounded-xl font-mono text-sm leading-relaxed p-4 focus:ring-0 focus-visible:ring-0"
                placeholder="输入 Skill 内容 (Markdown)..."
              />
            </CardContent>
          </Card>
        </div>

        {/* 右侧预览区 */}
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: '50%' }}
            exit={{ opacity: 0, width: 0 }}
            className="min-w-0"
          >
            <Card className="h-full border border-cream-200 overflow-auto">
              <CardContent className="p-4">
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-cream-700 text-sm leading-relaxed font-body">
                    {content}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* 放弃修改确认 */}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定放弃所有修改吗？</AlertDialogTitle>
            <AlertDialogDescription>修改内容将丢失，此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(`/skills/${skillId}`)} className="bg-strawberry-500 hover:bg-strawberry-400">
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
