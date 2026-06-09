'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Cloud, Info, Loader2, LogIn, LogOut, RefreshCw, UserCircle, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useArticleStore } from '@/stores/article'

export function AccountMenu() {
  const router = useRouter()
  const [debugOpen, setDebugOpen] = useState(false)
  const { user, status, logout } = useAuthStore()
  const { syncStatus, syncError, syncDebug, syncWithCloud, clearSessionCache } = useArticleStore()

  if (status === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--fg-tertiary)]">
        <Loader2 size={13} className="animate-spin" />
        账号加载中
      </span>
    )
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => router.push('/login')}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-all duration-[120ms] ease-out active:scale-[0.97]"
      >
        <LogIn size={14} />
        登录同步
      </button>
    )
  }

  return (
    <div className="relative flex items-center gap-2">
      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[var(--fg-secondary)] max-w-48 truncate" title={user.email}>
        <UserCircle size={14} />
        {user.name || user.email}
      </span>
      <button
        type="button"
        onClick={() => void syncWithCloud()}
        disabled={syncStatus === 'syncing'}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[var(--accent-text)] bg-[var(--accent-soft)] hover:bg-[var(--accent)]/10 rounded-md disabled:opacity-50 transition-all duration-[120ms] ease-out active:scale-[0.97]"
        title={syncError || '同步云端数据'}
      >
        {syncStatus === 'syncing' ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />}
        {syncStatus === 'error' ? '同步失败' : '云同步'}
      </button>
      {(syncStatus === 'error' || syncDebug) && (
        <button
          type="button"
          onClick={() => setDebugOpen(open => !open)}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="查看同步调试信息"
        >
          <Info size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={() => void syncWithCloud()}
        disabled={syncStatus === 'syncing'}
        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 transition-colors"
        title="重新同步"
      >
        <RefreshCw size={14} />
      </button>
      <button
        type="button"
        onClick={async () => {
          await logout()
          await clearSessionCache(null)
          router.replace('/articles')
          router.refresh()
        }}
        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        title="退出登录"
      >
        <LogOut size={14} />
      </button>
      {debugOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-semibold text-gray-900">同步调试</div>
            <button
              type="button"
              onClick={() => setDebugOpen(false)}
              className="p-1 text-gray-400 hover:text-gray-700 rounded"
              title="关闭"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1.5">
            <DebugRow label="状态" value={syncStatus === 'error' ? '同步失败' : syncStatus === 'syncing' ? '同步中' : '空闲'} />
            <DebugRow label="阶段" value={syncDebug?.phase || '-'} />
            <DebugRow label="接口" value={syncDebug?.endpoint || '-'} />
            <DebugRow label="时间" value={syncDebug?.lastRunAt ? formatDebugTime(syncDebug.lastRunAt) : '-'} />
            <DebugRow label="信息" value={syncDebug?.message || syncError || '暂无错误'} />
            {syncDebug?.error && <DebugRow label="错误" value={syncDebug.error} danger />}
          </div>
          {syncDebug?.counts && (
            <DebugBlock title="数量" data={syncDebug.counts} />
          )}
          {syncDebug?.mappings && (
            <DebugBlock title="远端映射" data={syncDebug.mappings} />
          )}
          {syncDebug?.samples && (
            <DebugBlock title="样例" data={syncDebug.samples} />
          )}
        </div>
      )}
    </div>
  )
}

function DebugRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
      <span className="text-gray-400">{label}</span>
      <span className={`min-w-0 break-words ${danger ? 'text-red-600' : 'text-gray-700'}`}>{value}</span>
    </div>
  )
}

function DebugBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-gray-400">{title}</div>
      <pre className="max-h-48 overflow-auto rounded-md bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function formatDebugTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
