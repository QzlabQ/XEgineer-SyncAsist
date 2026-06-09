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
    <header className="relative z-30 h-12 flex items-center justify-between px-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)] flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 select-none">
          <PenLine size={18} className="text-[var(--accent)]" />
          <span className="font-semibold text-sm text-[var(--fg-primary)] tracking-tight">XEgineer</span>
        </div>
        <nav className="flex items-center gap-0.5">
          {[
            { label: '文章列表', icon: List, path: '/articles' },
            { label: '设置', icon: Settings, path: '/settings' },
            { label: '发布历史', icon: History, path: '/history' },
            { label: '团队', icon: Users, path: '/teams' },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-all duration-[120ms] ease-out active:scale-[0.97]"
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <AccountMenu />

        <div className="flex items-center gap-1.5 text-xs text-[var(--fg-tertiary)] min-w-[64px] justify-end">
          {saveStatus === 'saving' && <><Loader2 size={12} className="animate-spin" /> 保存中...</>}
          {saveStatus === 'saved' && <><Save size={12} /> 已保存</>}
          {saveStatus === 'error' && <span className="text-[var(--error)]">保存失败</span>}
        </div>

        <button
          onClick={() => setShowPublishDialog(true)}
          disabled={!canPublish}
          className="flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all duration-[120ms] ease-out"
          title={current?.permissionRole === 'VIEWER' ? 'Viewer 不能发布共享文章' : '发布'}
        >
          <Send size={14} />
          发布{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
      </div>
    </header>
  )
}
