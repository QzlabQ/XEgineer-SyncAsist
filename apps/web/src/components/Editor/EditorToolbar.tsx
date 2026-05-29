'use client'

import type { Editor } from '@tiptap/core'
import {
  Bold, Italic, Underline, Strikethrough, Code, Link2, Image,
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare,
  Quote, Minus, Table, Undo, Redo,
} from 'lucide-react'

interface EditorToolbarProps {
  editor: Editor
  onImageUpload: () => void
}

export function EditorToolbar({ editor, onImageUpload }: EditorToolbarProps) {
  const btn = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
    disabled = false
  ) => (
    <button
      key={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded text-sm transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icon}
    </button>
  )

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('输入链接 URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const sz = 15

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-4 py-2 border-b border-gray-200 bg-white sticky top-0 z-10">
      {/* History */}
      {btn(false, () => editor.chain().focus().undo().run(), <Undo size={sz} />, '撤销', !editor.can().undo())}
      {btn(false, () => editor.chain().focus().redo().run(), <Redo size={sz} />, '重做', !editor.can().redo())}

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Headings */}
      {btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <Heading1 size={sz} />, 'H1')}
      {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={sz} />, 'H2')}
      {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 size={sz} />, 'H3')}

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Inline marks */}
      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold size={sz} />, '加粗')}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic size={sz} />, '斜体')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <Underline size={sz} />, '下划线')}
      {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={sz} />, '删除线')}
      {btn(editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), <Code size={sz} />, '行内代码')}
      {btn(editor.isActive('link'), setLink, <Link2 size={sz} />, '链接')}

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Lists */}
      {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List size={sz} />, '无序列表')}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={sz} />, '有序列表')}
      {btn(editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run(), <CheckSquare size={sz} />, '任务列表')}

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Blocks */}
      {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), <Quote size={sz} />, '引用')}
      {btn(editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), <Code size={sz} />, '代码块')}
      {btn(false, () => editor.chain().focus().setHorizontalRule().run(), <Minus size={sz} />, '分割线')}
      {btn(false, insertTable, <Table size={sz} />, '表格')}
      {btn(false, onImageUpload, <Image size={sz} />, '插入图片')}
    </div>
  )
}
