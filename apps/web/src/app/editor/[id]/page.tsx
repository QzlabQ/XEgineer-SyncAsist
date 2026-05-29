'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useArticleStore } from '@/stores/article'
import { TopNav } from '@/components/Layout/TopNav'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { PreviewPanel } from '@/components/Preview/PreviewPanel'
import { PublishDialog } from '@/components/PublishPanel/PublishDialog'

// Tiptap must be client-only
const RichEditor = dynamic(() => import('@/components/Editor/RichEditor').then(m => ({ default: m.RichEditor })), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">加载编辑器...</div>,
})

export default function EditorPage() {
  const params = useParams()
  const id = Number(params.id)
  const { current, loadArticle, updateTitle, updateContent } = useArticleStore()
  const [showPreview, setShowPreview] = useState(true)

  useEffect(() => {
    if (id) loadArticle(id)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleContentChange = useCallback((json: string) => {
    updateContent(json)
  }, [updateContent])

  if (!current) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-400">
        加载中...
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopNav />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Title */}
          <div className="px-8 pt-8 pb-2 flex-shrink-0">
            <input
              type="text"
              value={current.title}
              onChange={e => updateTitle(e.target.value)}
              placeholder="文章标题"
              className="w-full text-3xl font-bold text-gray-900 placeholder-gray-300 border-none outline-none bg-transparent"
            />
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <RichEditor
              content={current.tiptapJSON}
              onChange={handleContentChange}
            />
          </div>
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="w-96 flex-shrink-0">
            <PreviewPanel title={current.title} tiptapJSON={current.tiptapJSON} />
          </div>
        )}
      </div>

      <PublishDialog />
    </div>
  )
}
