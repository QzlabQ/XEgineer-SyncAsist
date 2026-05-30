'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useCallback } from 'react'
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
import type { EditorView } from '@tiptap/pm/view'
import { EditorToolbar } from './EditorToolbar'

interface RichEditorProps {
  content: string
  onChange: (json: string) => void
}

export function RichEditor({ content, onChange }: RichEditorProps) {
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

  if (!editor) return null

  return (
    <div className="flex flex-col h-full">
      <EditorToolbar editor={editor} onImageUpload={handleImageUpload} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
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
