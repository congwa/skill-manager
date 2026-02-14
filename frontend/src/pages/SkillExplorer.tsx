import { useState, useEffect, useCallback } from 'react'
import { Search, FolderTree, ChevronsUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tree, Folder, File, type TreeViewElement } from '@/components/ui/file-tree'
import CodeEditor from '@/components/editor/CodeEditor'
import EditorTabs, { type EditorTab } from '@/components/editor/EditorTabs'
import SkillInfoPanel from '@/components/editor/SkillInfoPanel'
import EditorStatusBar from '@/components/editor/EditorStatusBar'
import { useSkillStore } from '@/stores/useSkillStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { skillsApi } from '@/lib/tauri-api'
import { toast } from 'sonner'

interface OpenFile {
  id: string
  fileName: string
  filePath: string
  content: string
  originalContent: string
  isDirty: boolean
}

export default function SkillExplorer() {
  const skills = useSkillStore((s) => s.skills)
  const deployments = useSkillStore((s) => s.deployments)
  const fetchDeployments = useSkillStore((s) => s.fetchDeployments)
  const projects = useProjectStore((s) => s.projects)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [skillFilesMap, setSkillFilesMap] = useState<Map<string, string[]>>(new Map())
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [expandAll, setExpandAll] = useState(false)
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null)

  // 加载所有 Skill 的文件列表
  useEffect(() => {
    const loadFiles = async () => {
      setLoading(true)
      const map = new Map<string, string[]>()
      const promises = skills
        .filter((s) => s.local_path)
        .map(async (skill) => {
          try {
            const relFiles = await skillsApi.listFiles(skill.local_path!)
            const absFiles = relFiles.map((f) => `${skill.local_path}/${f}`)
            console.log(`[SkillExplorer] ${skill.name}: ${relFiles.length} files`, relFiles.slice(0, 5))
            map.set(skill.id, absFiles)
          } catch (err) {
            console.warn(`[SkillExplorer] Failed to list files for ${skill.name}:`, err)
            map.set(skill.id, [])
          }
        })
      await Promise.all(promises)
      setSkillFilesMap(map)
      setLoading(false)
    }
    if (skills.length > 0) loadFiles()
    else setLoading(false)
  }, [skills])

  // 过滤 Skills
  const filteredSkills = skills.filter((s) =>
    !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 构建树数据
  const treeElements: TreeViewElement[] = filteredSkills
    .filter((s) => s.local_path)
    .map((skill) => {
      const files = skillFilesMap.get(skill.id) || []
      if (files.length === 0) console.log(`[SkillExplorer] ${skill.name}: no files in map`)
      // 构建文件/子目录结构
      const buildTree = (fileList: string[], basePath: string): TreeViewElement[] => {
        const dirs = new Map<string, string[]>()
        const directFiles: string[] = []

        for (const f of fileList) {
          const rel = f.startsWith(basePath) ? f.slice(basePath.length).replace(/^\//, '') : f
          const parts = rel.split('/')
          if (parts.length > 1) {
            const dirName = parts[0]
            if (!dirs.has(dirName)) dirs.set(dirName, [])
            dirs.get(dirName)!.push(f)
          } else {
            directFiles.push(f)
          }
        }

        const items: TreeViewElement[] = []

        // 子目录
        for (const [dirName, dirFiles] of dirs) {
          items.push({
            id: `${basePath}/${dirName}`,
            name: dirName,
            children: buildTree(dirFiles, `${basePath}/${dirName}`),
          })
        }

        // 文件
        for (const f of directFiles) {
          const fileName = f.split('/').pop() || f
          items.push({
            id: f,
            name: fileName,
          })
        }

        return items
      }

      return {
        id: `skill-${skill.id}`,
        name: skill.name,
        children: buildTree(files, skill.local_path!),
      }
    })

  // 打开文件
  const handleFileClick = useCallback(async (fileId: string) => {
    // 检查是否是 skill 文件夹节点
    if (fileId.startsWith('skill-')) {
      setSelectedSkillId(fileId.replace('skill-', ''))
      return
    }
    // 检查是否是目录节点（以 / 开头但不是绝对路径的文件）
    // 如果已打开，切换到它
    const existing = openFiles.find((f) => f.id === fileId)
    if (existing) {
      setActiveFileId(fileId)
      return
    }

    try {
      const content = await skillsApi.readFile(fileId)
      const fileName = fileId.split('/').pop() || fileId
      const newFile: OpenFile = {
        id: fileId,
        fileName,
        filePath: fileId,
        content,
        originalContent: content,
        isDirty: false,
      }
      setOpenFiles((prev) => [...prev, newFile])
      setActiveFileId(fileId)

      // 同时更新选中的 Skill
      const skill = skills.find((s) => s.local_path && fileId.startsWith(s.local_path))
      if (skill) setSelectedSkillId(skill.id)
    } catch (err) {
      toast.error('读取文件失败: ' + String(err))
    }
  }, [openFiles, skills])

  // 文件内容变更
  const handleContentChange = useCallback((value: string) => {
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.id === activeFileId
          ? { ...f, content: value, isDirty: value !== f.originalContent }
          : f
      )
    )
  }, [activeFileId])

  // 保存文件
  const handleSave = useCallback(async () => {
    const file = openFiles.find((f) => f.id === activeFileId)
    if (!file || !file.isDirty) return

    try {
      await skillsApi.writeFile(file.filePath, file.content)
      setOpenFiles((prev) =>
        prev.map((f) =>
          f.id === activeFileId
            ? { ...f, originalContent: f.content, isDirty: false }
            : f
        )
      )
      toast.success(`已保存 ${file.fileName}`)
    } catch (err) {
      toast.error('保存失败: ' + String(err))
    }
  }, [activeFileId, openFiles])

  // 关闭 Tab
  const handleCloseTab = useCallback((tabId: string) => {
    const file = openFiles.find((f) => f.id === tabId)
    if (file?.isDirty) {
      setCloseConfirm(tabId)
      return
    }
    doCloseTab(tabId)
  }, [openFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  const doCloseTab = useCallback((tabId: string) => {
    setOpenFiles((prev) => {
      const newFiles = prev.filter((f) => f.id !== tabId)
      if (activeFileId === tabId) {
        setActiveFileId(newFiles.length > 0 ? newFiles[newFiles.length - 1].id : null)
      }
      return newFiles
    })
    setCloseConfirm(null)
  }, [activeFileId])

  const activeFile = openFiles.find((f) => f.id === activeFileId)
  const selectedSkill = selectedSkillId ? skills.find((s) => s.id === selectedSkillId) : null

  const tabs: EditorTab[] = openFiles.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    filePath: f.filePath,
    isDirty: f.isDirty,
  }))

  if (loading) {
    return (
      <div className="flex gap-4 h-[calc(100vh-120px)]">
        <Skeleton className="w-[280px] h-full rounded-xl" />
        <Skeleton className="flex-1 h-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* 顶部操作栏 */}
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <FolderTree className="h-5 w-5 text-peach-500" />
        <h1 className="text-lg font-display font-bold text-cream-800">Skill Explorer</h1>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-400" />
          <Input
            placeholder="搜索 Skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-full border-cream-300 h-8 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-8"
          onClick={() => setExpandAll(!expandAll)}
        >
          <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
          {expandAll ? '全部折叠' : '全部展开'}
        </Button>
      </div>

      {/* 主区域 */}
      <div className="flex flex-1 gap-0 rounded-xl overflow-hidden border border-cream-200" style={{ boxShadow: 'var(--shadow-card)' }}>
        {/* 左侧面板 */}
        <div className="w-[280px] shrink-0 flex flex-col bg-cream-50/80 border-r border-cream-200">
          {/* 文件树 */}
          <div className="flex-1 overflow-hidden">
            {treeElements.length === 0 ? (
              <div className="p-4 text-center text-xs text-cream-400">
                {searchQuery ? '没有匹配的 Skill' : '暂无 Skill'}
              </div>
            ) : (
              <Tree
                className="p-2 h-full"
                initialExpandedItems={expandAll ? treeElements.map((e) => e.id) : []}
              >
                {treeElements.map((skillNode) => (
                  <Folder
                    key={skillNode.id}
                    value={skillNode.id}
                    element={skillNode.name}
                    onClick={() => setSelectedSkillId(skillNode.id.replace('skill-', ''))}
                  >
                    {renderTreeChildren(skillNode.children || [], handleFileClick)}
                  </Folder>
                ))}
              </Tree>
            )}
          </div>

          {/* Skill 详情面板 */}
          <div className="border-t border-cream-200 shrink-0 max-h-[200px] overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-cream-400 font-semibold bg-cream-100/50">
              Skill 详情
            </div>
            <SkillInfoPanel
              skill={selectedSkill ? {
                id: selectedSkill.id,
                name: selectedSkill.name,
                description: selectedSkill.description,
                version: selectedSkill.version,
                local_path: selectedSkill.local_path,
              } : null}
              deployments={deployments}
              projects={projects.map((p) => ({ id: p.id, name: p.name, path: p.path }))}
              onDeploymentChanged={fetchDeployments}
            />
          </div>
        </div>

        {/* 右侧编辑器区域 */}
        <div className="flex-1 flex flex-col bg-[#282840] min-w-0">
          {/* Tab 栏 */}
          <EditorTabs
            tabs={tabs}
            activeTabId={activeFileId}
            onSelect={setActiveFileId}
            onClose={handleCloseTab}
          />

          {/* 编辑器 */}
          <div className="flex-1 min-h-0">
            {activeFile ? (
              <CodeEditor
                key={activeFile.id}
                content={activeFile.content}
                filePath={activeFile.filePath}
                onChange={handleContentChange}
                onSave={handleSave}
                onCursorChange={(line, col) => setCursorPos({ line, col })}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-cream-500">
                <div className="text-center">
                  <div className="text-5xl mb-4">📝</div>
                  <p className="text-sm">点击左侧文件开始编辑</p>
                  <p className="text-xs text-cream-400 mt-1">支持 Markdown、JSON、JavaScript 语法高亮</p>
                </div>
              </div>
            )}
          </div>

          {/* 状态栏 */}
          <EditorStatusBar
            fileName={activeFile?.fileName ?? null}
            language=""
            line={cursorPos.line}
            col={cursorPos.col}
            isDirty={activeFile?.isDirty ?? false}
            onSave={handleSave}
          />
        </div>
      </div>

      {/* 未保存关闭确认 */}
      <AlertDialog open={!!closeConfirm} onOpenChange={() => setCloseConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>文件未保存</AlertDialogTitle>
            <AlertDialogDescription>
              {openFiles.find((f) => f.id === closeConfirm)?.fileName} 有未保存的修改，确定要关闭吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-strawberry-500 hover:bg-strawberry-400"
              onClick={() => closeConfirm && doCloseTab(closeConfirm)}
            >
              不保存关闭
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-peach-500 hover:bg-peach-600"
              onClick={async () => {
                if (closeConfirm) {
                  const file = openFiles.find((f) => f.id === closeConfirm)
                  if (file) {
                    try {
                      await skillsApi.writeFile(file.filePath, file.content)
                      toast.success(`已保存 ${file.fileName}`)
                    } catch (err) {
                      toast.error('保存失败: ' + String(err))
                    }
                  }
                  doCloseTab(closeConfirm)
                }
              }}
            >
              保存并关闭
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function renderTreeChildren(
  children: TreeViewElement[],
  onFileClick: (fileId: string) => void
): React.ReactNode {
  return children.map((child) => {
    if (child.children && child.children.length > 0) {
      return (
        <Folder key={child.id} value={child.id} element={child.name}>
          {renderTreeChildren(child.children, onFileClick)}
        </Folder>
      )
    }
    return (
      <File key={child.id} value={child.id} onClick={() => onFileClick(child.id)}>
        <span className="text-xs">{child.name}</span>
      </File>
    )
  })
}
