'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, Plus, FileText, Trash2, History, Search } from 'lucide-react'
import { useArticleStore } from '@/stores/article'

export default function ArticlesPage() {
  const router = useRouter()
  const { articles, loadArticles, createArticle, deleteArticle } = useArticleStore()
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated')

  useEffect(() => {
    loadArticles()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">我的文章</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/history')}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition-colors"
          >
            <History size={16} />
            发布历史
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            新建文章
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <label className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索标题"
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </label>
          <label className="relative sm:w-44">
            <ArrowUpDown size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={sortBy}
              onChange={event => setSortBy(event.target.value as 'updated' | 'created' | 'title')}
              className="w-full appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="updated">最近更新</option>
              <option value="created">最近创建</option>
              <option value="title">标题 A-Z</option>
            </select>
          </label>
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-20">
            <FileText size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-6">还没有文章，创建第一篇吧</p>
            <button
              onClick={handleCreate}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              新建文章
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleArticles.length === 0 && (
              <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
                <Search size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">没有匹配的文章</p>
              </div>
            )}
            {visibleArticles.map(article => (
              <div
                key={article.id}
                onClick={() => router.push(`/editor/${article.id}`)}
                className="bg-white rounded-xl border border-gray-200 px-5 py-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-medium text-gray-900 truncate">{article.title || '无标题文章'}</h2>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(article.updatedAt).toLocaleString('zh-CN', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(article.id!, e)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all ml-3"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
