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
