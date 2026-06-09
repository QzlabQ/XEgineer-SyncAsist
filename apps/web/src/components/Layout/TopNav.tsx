'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, List, Settings, Save, Loader2, Send, History, Users } from 'lucide-react'
import { useArticleStore } from '@/stores/article'
import { usePublishStore } from '@/stores/publish'
import { AccountMenu } from '@/components/Auth/AccountMenu'

export function TopNav() {
  const router = useRouter()
  const { current, saveStatus } = useArticleStore()
  const { platforms, setShowPublishDialog } = usePublishStore()
  const selectedCount = platforms.filter(p => p.selected).length
  const canPublish = Boolean(current && current.permissionRole !== 'VIEWER')

  return (
    <header className="relative z-30 h-12 flex items-center justify-between px-4 border-b border-gray-200 bg-white flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 font-semibold text-gray-900">
          <PenLine size={18} className="text-blue-600" />
          <span>XEgineer</span>
        </div>
        <nav className="flex items-center gap-1">
          <button
            onClick={() => router.push('/articles')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <List size={14} />
            文章列表
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Settings size={14} />
            设置
          </button>
          <button
            onClick={() => router.push('/history')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <History size={14} />
            发布历史
          </button>
          <button
            onClick={() => router.push('/teams')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Users size={14} />
            团队
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <AccountMenu />

        {/* Save status */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          {saveStatus === 'saving' && <><Loader2 size={12} className="animate-spin" /> 保存中...</>}
          {saveStatus === 'saved' && <><Save size={12} /> 已保存</>}
          {saveStatus === 'error' && <span className="text-red-400">保存失败</span>}
        </div>

        {/* Publish button */}
        <button
          onClick={() => setShowPublishDialog(true)}
          disabled={!canPublish}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={current?.permissionRole === 'VIEWER' ? 'Viewer 不能发布共享文章' : '发布'}
        >
          <Send size={14} />
          发布{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
      </div>
    </header>
  )
}
