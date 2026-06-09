'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Editor } from '@tiptap/core'
import { Users, Loader2 } from 'lucide-react'
import { useArticleStore } from '@/stores/article'
import { usePublishStore } from '@/stores/publish'
import { DotmSquare3 } from '@/components/ui/dotm-square-3'
import { TopNav } from '@/components/Layout/TopNav'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { PreviewPanel } from '@/components/Preview/PreviewPanel'
import { PublishDialog } from '@/components/PublishPanel/PublishDialog'
import { ArticleCollaborationPanel } from '@/components/Auth/ArticleCollaborationPanel'
import { AiAssistantFloatingPanel } from '@/components/AI/AiAssistantFloatingPanel'
import type { TextSelectionSnapshot } from '@/lib/tiptap-text'

// Tiptap must be client-only
const RichEditor = dynamic(() => import('@/components/Editor/RichEditor').then(m => ({ default: m.RichEditor })), {
  ssr: false,
  loading: () => <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400"><Loader2 size={24} className="animate-spin text-blue-500" /><span className="text-sm">加载编辑器...</span></div>,
})

export default function EditorPage() {
  const params = useParams()
  const id = Number(params.id)
  const { current, loadArticle, updateTitle, updateContent, updateMeta, saveNow } = useArticleStore()
  const { setShowPublishDialog, applyConfigToAllPlatforms } = usePublishStore()
  const [showPreview, setShowPreview] = useState(true)
  const [showCollaboration, setShowCollaboration] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [selection, setSelection] = useState<TextSelectionSnapshot | null>(null)

  useEffect(() => {
    if (id) loadArticle(id)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleContentChange = useCallback((json: string) => {
    if (current?.permissionRole === 'VIEWER') return
    updateContent(json)
  }, [current?.permissionRole, updateContent])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      if (e.key === 's') {
        e.preventDefault()
        void saveNow()
        return
      }

      if (e.key === 'p' && e.shiftKey) {
        e.preventDefault()
        setShowPublishDialog(true)
        return
      }

      if (e.key === '\\') {
        e.preventDefault()
        setShowPreview(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveNow, setShowPublishDialog])

  if (!current) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <DotmSquare3 width={64} height={64} className="text-blue-600" />
        <p className="text-sm text-gray-400">加载文章中...</p>
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
          <div className="relative z-20 bg-white px-8 pt-8 pb-2 flex-shrink-0">
            <div className="flex items-start gap-3">
              <input
                type="text"
                value={current.title}
                onChange={e => updateTitle(e.target.value)}
                disabled={current.permissionRole === 'VIEWER'}
                placeholder="文章标题"
                className="min-w-0 flex-1 text-3xl font-bold text-gray-900 placeholder-gray-300 border-none outline-none bg-transparent disabled:text-gray-500"
              />
              {current.remoteId && (
                <button
                  type="button"
                  onClick={() => setShowCollaboration(true)}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  title="协作与权限"
                >
                  <Users size={15} />
                  {current.permissionRole === 'VIEWER' ? '只读' : '协作'}
                </button>
              )}
            </div>
            {(current.permissionRole || current.teamName || current.ownerName) && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <span>{current.permissionRole || 'OWNER'}</span>
                {current.teamName && <span>团队：{current.teamName}</span>}
                {current.ownerName && <span>Owner：{current.ownerName}</span>}
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <RichEditor
              content={current.tiptapJSON}
              onChange={handleContentChange}
              editable={current.permissionRole !== 'VIEWER'}
              onEditorReady={setEditor}
              onSelectionChange={setSelection}
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
      <ArticleCollaborationPanel
        article={current}
        open={showCollaboration}
        onClose={() => setShowCollaboration(false)}
      />
      <AiAssistantFloatingPanel
        article={current}
        editor={editor}
        selection={selection}
        canEdit={current.permissionRole !== 'VIEWER'}
        onTitleApply={updateTitle}
        onMetaApply={updateMeta}
        onPlatformMetaApply={applyConfigToAllPlatforms}
      />
    </div>
  )
}
