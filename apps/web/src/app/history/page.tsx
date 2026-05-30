'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle, ExternalLink, History, XCircle } from 'lucide-react'
import { db, type PublishRecord } from '@/lib/db'

interface HistoryItem extends PublishRecord {
  articleTitle: string
}

export default function HistoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[]>([])

  useEffect(() => {
    void loadHistory()
  }, [])

  const loadHistory = async () => {
    const records = await db.publishHistory.orderBy('publishedAt').reverse().toArray()
    const articleIds = Array.from(new Set(records.map(record => record.articleId)))
    const articles = await db.articles.bulkGet(articleIds)
    const titleMap = new Map<number, string>()

    articles.forEach(article => {
      if (article?.id) titleMap.set(article.id, article.title)
    })

    setItems(records.map(record => ({
      ...record,
      articleTitle: titleMap.get(record.articleId) ?? '已删除文章',
    })))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold text-gray-900">发布历史</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <History size={46} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">还没有发布记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <article key={item.id} className="bg-white border border-gray-200 rounded-lg px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.success ? (
                        <CheckCircle size={15} className="text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle size={15} className="text-red-500 flex-shrink-0" />
                      )}
                      <h2 className="text-sm font-medium text-gray-900 truncate">{item.articleTitle}</h2>
                    </div>
                    <p className="text-xs text-gray-500">
                      {item.platformName} · {item.isDraft ? '草稿' : '已发布'} · {new Date(item.publishedAt).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {item.error && (
                      <p className="text-xs text-red-500 mt-2 line-clamp-2">{item.error}</p>
                    )}
                    {item.message && (
                      <p className="text-xs text-amber-600 mt-2 line-clamp-2 inline-flex items-start gap-1">
                        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                        <span>{item.message}</span>
                      </p>
                    )}
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 flex-shrink-0"
                    >
                      查看
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
