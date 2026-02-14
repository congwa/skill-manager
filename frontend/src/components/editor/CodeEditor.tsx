import { useRef, useEffect, useCallback } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection, rectangularSelection } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, indentOnInput, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'

interface CodeEditorProps {
  content: string
  filePath: string
  onChange?: (value: string) => void
  onSave?: () => void
  onCursorChange?: (line: number, col: number) => void
}

function getLanguageExtension(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'md':
      return markdown({ codeLanguages: languages })
    case 'json':
      return json()
    case 'js':
    case 'jsx':
      return javascript({ jsx: true })
    case 'ts':
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    default:
      return []
  }
}

export default function CodeEditor({ content, filePath, onChange, onSave, onCursorChange }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onCursorRef = useRef(onCursorChange)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onCursorRef.current = onCursorChange

  const saveKeymap = useCallback(() => {
    return keymap.of([{
      key: 'Mod-s',
      run: () => {
        onSaveRef.current?.()
        return true
      },
    }])
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const lang = getLanguageExtension(filePath)

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        langCompartment.current.of(lang),
        oneDark,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        saveKeymap(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString())
          }
          if (update.selectionSet) {
            const pos = update.state.selection.main.head
            const line = update.state.doc.lineAt(pos)
            onCursorRef.current?.(line.number, pos - line.from + 1)
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" },
          '.cm-gutters': { borderRight: 'none' },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [filePath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== content) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: content },
      })
    }
  }, [content])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const lang = getLanguageExtension(filePath)
    view.dispatch({
      effects: langCompartment.current.reconfigure(lang),
    })
  }, [filePath])

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />
}
