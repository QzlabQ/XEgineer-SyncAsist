'use client'

import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import { useEffect, useCallback, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link2, Highlighter } from 'lucide-react'
import type { EditorView } from '@tiptap/pm/view'
import { EditorToolbar } from './EditorToolbar'

interface SlashState {
  query: string
  from: number
  to: number
  top: number
  left: number
}

interface SlashCommand {
  title: string
  hint: string
  keywords: string[]
  run: (editor: Editor, state: SlashState) => void
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    title: '一级标题',
    hint: '大标题',
    keywords: ['h1', 'title', 'biaoti'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).toggleHeading({ level: 1 }).run(),
  },
  {
    title: '二级标题',
    hint: '章节标题',
    keywords: ['h2', 'heading', 'biaoti'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).toggleHeading({ level: 2 }).run(),
  },
  {
    title: '无序列表',
    hint: '项目符号',
    keywords: ['list', 'ul', 'liebiao'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).toggleBulletList().run(),
  },
  {
    title: '有序列表',
    hint: '编号列表',
    keywords: ['ol', 'number', 'liebiao'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).toggleOrderedList().run(),
  },
  {
    title: '任务列表',
    hint: '待办事项',
    keywords: ['task', 'todo'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).toggleTaskList().run(),
  },
  {
    title: '引用',
    hint: '引文块',
    keywords: ['quote', 'blockquote', 'yinyong'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).toggleBlockquote().run(),
  },
  {
    title: '代码块',
    hint: '多行代码',
    keywords: ['code', 'daima'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).toggleCodeBlock().run(),
  },
  {
    title: '表格',
    hint: '3 x 3',
    keywords: ['table', 'biaoge'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: '分割线',
    hint: '水平线',
    keywords: ['hr', 'line', 'divider'],
    run: (editor, state) => editor.chain().focus().deleteRange(state).setHorizontalRule().run(),
  },
]

interface RichEditorProps {
  content: string
  onChange: (json: string) => void
}

export function RichEditor({ content, onChange }: RichEditorProps) {
  const [slashState, setSlashState] = useState<SlashState | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashStateRef = useRef<SlashState | null>(null)

  const setSlashMenu = useCallback((state: SlashState | null) => {
    slashStateRef.current = state
    setSlashState(state)
    setSlashIndex(0)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { HTMLAttributes: { class: 'code-block' } },
      }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Image.configure({ HTMLAttributes: { class: 'editor-image' } }),
      Placeholder.configure({ placeholder: '开始写作...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight.configure({ multicolor: true }),
      Typography,
    ],
    content: content ? JSON.parse(content) : undefined,
    editorProps: {
      attributes: { class: 'tiptap-editor focus:outline-none' },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        files.forEach(file => insertImageFile(view, file))
        return true
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false
        const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith('image/'))
        if (!files.length) return false
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        event.preventDefault()
        files.forEach(file => insertImageFile(view, file, pos))
        return true
      },
    },
    onUpdate({ editor }) {
      onChange(JSON.stringify(editor.getJSON()))
      updateSlashMenu(editor, setSlashMenu)
    },
    onSelectionUpdate({ editor }) {
      updateSlashMenu(editor, setSlashMenu)
    },
    immediatelyRender: false,
  })

  // Sync external content changes (e.g. switching articles)
  useEffect(() => {
    if (!editor || !content) return
    const current = JSON.stringify(editor.getJSON())
    if (current !== content) {
      editor.commands.setContent(JSON.parse(content), false)
    }
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !editor) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        editor.chain().focus().setImage({ src }).run()
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }, [editor])

  const filteredSlashCommands = slashState
    ? SLASH_COMMANDS.filter(command => {
      const query = slashState.query.toLowerCase()
      return command.title.toLowerCase().includes(query) ||
        command.hint.toLowerCase().includes(query) ||
        command.keywords.some(keyword => keyword.includes(query))
    })
    : []

  useEffect(() => {
    if (slashIndex >= filteredSlashCommands.length) setSlashIndex(0)
  }, [filteredSlashCommands.length, slashIndex])

  const applySlashCommand = useCallback((command: SlashCommand) => {
    const state = slashStateRef.current
    if (!editor || !state) return
    command.run(editor, state)
    setSlashMenu(null)
  }, [editor, setSlashMenu])

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!slashState || filteredSlashCommands.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSlashIndex(index => (index + 1) % filteredSlashCommands.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSlashIndex(index => (index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      applySlashCommand(filteredSlashCommands[slashIndex])
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setSlashMenu(null)
    }
  }

  if (!editor) return null

  return (
    <div className="flex flex-col h-full" onKeyDownCapture={handleEditorKeyDown}>
      <EditorToolbar editor={editor} onImageUpload={handleImageUpload} />

      {/* Bubble menu — appears when text is selected */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100, placement: 'top' }}
        shouldShow={({ editor: e, state }) => {
          const { selection } = state
          return !selection.empty && !e.isActive('image') && !e.isActive('codeBlock')
        }}
      >
        <div className="flex items-center gap-0.5 bg-gray-900 rounded-lg px-1.5 py-1 shadow-xl">
          {bubbleBtn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold size={13} />, '加粗')}
          {bubbleBtn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic size={13} />, '斜体')}
          {bubbleBtn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={13} />, '下划线')}
          {bubbleBtn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={13} />, '删除线')}
          {bubbleBtn(editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), <Code size={13} />, '行内代码')}
          {bubbleBtn(editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight().run(), <Highlighter size={13} />, '高亮')}
          <div className="w-px h-4 bg-gray-600 mx-0.5" />
          {bubbleBtn(editor.isActive('link'), () => {
            const prev = editor.getAttributes('link').href as string | undefined
            const url = window.prompt('输入链接 URL', prev ?? 'https://')
            if (url === null) return
            if (url === '') { editor.chain().focus().unsetLink().run(); return }
            editor.chain().focus().setLink({ href: url }).run()
          }, <Link2 size={13} />, '链接')}
        </div>
      </BubbleMenu>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EditorContent editor={editor} />
      </div>
      {slashState && filteredSlashCommands.length > 0 && (
        <div
          className="fixed z-50 w-56 rounded-lg border border-gray-200 bg-white shadow-lg py-1"
          style={{ top: slashState.top, left: slashState.left }}
        >
          {filteredSlashCommands.map((command, index) => (
            <button
              key={command.title}
              type="button"
              onMouseDown={event => {
                event.preventDefault()
                applySlashCommand(command)
              }}
              className={`w-full text-left px-3 py-2 ${index === slashIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <span className="block text-sm text-gray-900">{command.title}</span>
              <span className="block text-xs text-gray-400">{command.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function updateSlashMenu(editor: Editor, setSlashMenu: (state: SlashState | null) => void) {
  const { selection } = editor.state
  if (!selection.empty) {
    setSlashMenu(null)
    return
  }

  const $from = selection.$from
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
  const match = textBefore.match(/\/([A-Za-z0-9\u4e00-\u9fa5]*)$/)

  if (!match) {
    setSlashMenu(null)
    return
  }

  const from = $from.pos - match[0].length
  const coords = editor.view.coordsAtPos(from)
  setSlashMenu({
    query: match[1],
    from,
    to: $from.pos,
    top: coords.bottom + 8,
    left: Math.min(coords.left, window.innerWidth - 240),
  })
}

function insertImageFile(view: EditorView, file: File, pos?: number) {
  const reader = new FileReader()
  reader.onload = (event) => {
    const src = event.target?.result
    if (typeof src !== 'string') return

    const image = view.state.schema.nodes.image?.create({ src })
    if (!image) return

    const tr = typeof pos === 'number'
      ? view.state.tr.insert(pos, image)
      : view.state.tr.replaceSelectionWith(image)

    view.dispatch(tr.scrollIntoView())
  }
  reader.readAsDataURL(file)
}

function bubbleBtn(active: boolean, onClick: () => void, icon: React.ReactNode, title: string) {
  return (
    <button
      key={title}
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`w-6 h-6 inline-flex items-center justify-center rounded transition-colors ${
        active ? 'bg-white text-gray-900' : 'text-gray-300 hover:text-white hover:bg-gray-700'
      }`}
    >
      {icon}
    </button>
  )
}
