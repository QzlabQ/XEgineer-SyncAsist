'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, Plus, FileText, Trash2, History, Search, AlertTriangle, X, Users } from 'lucide-react'
import { useArticleStore } from '@/stores/article'
import { getExtensionBridge } from '@/lib/extension-bridge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccountMenu } from '@/components/Auth/AccountMenu'

export default function ArticlesPage() {
  const router = useRouter()
  const { articles, loadArticles, createArticle, deleteArticle } = useArticleStore()
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated')
  const [extensionMissing, setExtensionMissing] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    loadArticles()
    checkExtension()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkExtension = async () => {
    const bridge = getExtensionBridge()
    if (!bridge) return
    const installed = await bridge.isInstalled()
    if (!installed) setExtensionMissing(true)
  }

  const handleCreate = async () => {
    const id = await createArticle()
    router.push(`/editor/${id}`)
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确认删除这篇文章？')) return
    await deleteArticle(id)
  }

  const visibleArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return articles
      .filter(article => !normalizedQuery || article.title.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh-CN')
        if (sortBy === 'created') return b.createdAt - a.createdAt
        return b.updatedAt - a.updatedAt
      })
  }, [articles, query, sortBy])

  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      <header className="bg-[var(--bg-surface)] border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--fg-primary)] tracking-tight">我的文章</h1>
        <div className="flex items-center gap-2">
          <AccountMenu />
          <button
            onClick={() => router.push('/history')}
            className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-all duration-[120ms] ease-out active:scale-[0.97]"
          >
            <History size={15} />
            发布历史
          </button>
          <button
            onClick={() => router.push('/teams')}
            className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-all duration-[120ms] ease-out active:scale-[0.97]"
          >
            <Users size={15} />
            团队
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] active:scale-[0.97] transition-all duration-[120ms] ease-out"
          >
            <Plus size={15} />
            新建文章
          </button>
        </div>
      </header>

      {/* Extension missing banner */}
      {extensionMissing && !bannerDismissed && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle size={15} className="flex-shrink-0 text-amber-500" />
            <span>未检测到 XEgineer 扩展，发布功能不可用。</span>
            <button
              onClick={() => router.push('/setup')}
              className="underline font-medium hover:text-amber-900"
            >
              查看安装指南
            </button>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="p-1 text-amber-500 hover:text-amber-700 rounded flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <label className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索标题"
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all duration-[120ms] ease-out placeholder:text-[var(--fg-tertiary)] hover:border-[var(--border-hover)]"
            />
          </label>
          <div className="relative sm:w-44">
            <ArrowUpDown size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)] z-10 pointer-events-none" />
            <Select value={sortBy} onValueChange={v => setSortBy(v as 'updated' | 'created' | 'title')}>
              <SelectTrigger className="w-full pl-9 h-auto py-2 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">最近更新</SelectItem>
                <SelectItem value="created">最近创建</SelectItem>
                <SelectItem value="title">标题 A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-20">
            <FileText size={48} className="mx-auto text-[var(--fg-muted)] mb-4" />
            <p className="text-[var(--fg-tertiary)] mb-6 text-sm">还没有文章，创建第一篇吧</p>
            <button
              onClick={handleCreate}
              className="px-5 py-2.5 text-[13px] font-medium bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] active:scale-[0.97] transition-all duration-[120ms] ease-out"
            >
              新建文章
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleArticles.length === 0 && (
              <div className="text-center py-16 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg">
                <Search size={32} className="mx-auto text-[var(--fg-muted)] mb-3" />
                <p className="text-sm text-[var(--fg-tertiary)]">没有匹配的文章</p>
              </div>
            )}
            {visibleArticles.map(article => (
              <div
                key={article.id}
                onClick={() => router.push(`/editor/${article.id}`)}
                className="stagger-item bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] px-5 py-4 cursor-pointer hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)] active:scale-[0.995] transition-all duration-[160ms] ease-out group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-medium text-[var(--fg-primary)] truncate text-[15px]">{article.title || '无标题文章'}</h2>
                    <p className="text-xs text-[var(--fg-tertiary)] mt-1.5">
                      {new Date(article.updatedAt).toLocaleString('zh-CN', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                      <span className={`ml-2 ${syncStatusClass(article.syncStatus)}`}>
                        {syncStatusText(article.syncStatus)}
                      </span>
                      {article.permissionRole && (
                        <span className="ml-2 text-[var(--accent)]">{roleText(article.permissionRole)}</span>
                      )}
                      {article.teamName && (
                        <span className="ml-2 text-gray-400">{article.teamName}</span>
                      )}
                    </p>
                  </div>
                  {(article.permissionRole === undefined || article.permissionRole === 'OWNER') && (
                    <button
                      onClick={(e) => handleDelete(article.id!, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--fg-tertiary)] hover:text-[var(--error)] hover:bg-[var(--error-soft)] rounded-md transition-all duration-[120ms] ease-out ml-3"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function roleText(role: string): string {
  if (role === 'OWNER') return 'Owner'
  if (role === 'EDITOR') return 'Editor'
  return 'Viewer'
}

function syncStatusText(status: string | undefined): string {
  if (status === 'synced') return '已同步'
  if (status === 'dirty') return '待同步'
  if (status === 'error') return '同步失败'
  return '本地草稿'
}

function syncStatusClass(status: string | undefined): string {
  if (status === 'synced') return 'text-green-500'
  if (status === 'dirty') return 'text-amber-500'
  if (status === 'error') return 'text-red-500'
  return 'text-gray-400'
}
