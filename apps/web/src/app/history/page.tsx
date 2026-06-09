'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, CalendarClock, CheckCircle, ExternalLink, History, XCircle } from 'lucide-react'
import { db, type PublishRecord, type ScheduledPublishRecord } from '@/lib/db'
import { getExtensionBridge, type ScheduledPublishJob } from '@/lib/extension-bridge'
import { useAuthStore } from '@/stores/auth'

interface HistoryItem extends PublishRecord {
  articleTitle: string
}

type ScheduledResults = NonNullable<ScheduledPublishJob['results']>

export default function HistoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [scheduledItems, setScheduledItems] = useState<ScheduledPublishRecord[]>([])
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null)
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)

  useEffect(() => {
    void loadData()
    const timer = window.setInterval(() => {
      void loadData()
    }, 5000)

    return () => window.clearInterval(timer)
  }, [])

  const loadData = async () => {
    await syncScheduledJobs()

    const scheduled = await db.scheduledPublishes.orderBy('scheduledAt').toArray()
    setScheduledItems(scheduled.reverse())

    const cacheOwnerId = useAuthStore.getState().user?.id ?? 'guest'
    const allArticles = await db.articles.toArray()
    const visibleArticleIds = new Set(
      allArticles
        .filter(article => isVisibleArticleForHistory(article, cacheOwnerId))
        .map(article => article.id)
        .filter((id): id is number => typeof id === 'number')
    )
    const records = (await db.publishHistory.orderBy('publishedAt').reverse().toArray())
      .filter(record => visibleArticleIds.has(record.articleId) || record.cacheOwnerId === cacheOwnerId)
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

  const syncScheduledJobs = async () => {
    const bridge = getExtensionBridge()
    if (!bridge) return

    try {
      const jobs = await bridge.listScheduledPublishes()
      const localRows = await db.scheduledPublishes.toArray()
      const localByJobId = new Map(localRows.map(row => [row.jobId, row]))

      await Promise.all(jobs.map(job => {
        const existing = localByJobId.get(job.id)
        const row = {
          jobId: job.id,
          articleId: job.articleId ?? 0,
          articleTitle: job.articleTitle,
          platforms: job.targets.map(target => target.platformId),
          platformNames: job.targets.map(target => target.platformName),
          scheduledAt: job.scheduledAt,
          createdAt: job.createdAt,
          status: job.status,
          results: JSON.stringify(job.results ?? []),
          error: job.error,
        }

        return existing?.id
          ? db.scheduledPublishes.update(existing.id, row)
          : db.scheduledPublishes.add(row)
      }))
    } catch {
      // Extension may be unavailable on this page load; keep local schedule records.
    }
  }

  const handleCancel = async (jobId: string) => {
    const bridge = getExtensionBridge()
    if (!bridge) return

    setCancellingJobId(jobId)
    try {
      const job = await bridge.cancelScheduledPublish(jobId)
      const existing = await db.scheduledPublishes.where('jobId').equals(jobId).first()
      if (existing?.id) {
        await db.scheduledPublishes.update(existing.id, {
          status: job.status,
          results: JSON.stringify(job.results ?? []),
          error: job.error,
        })
      }
      await loadData()
    } finally {
      setCancellingJobId(null)
    }
  }

  const handleRetry = async (jobId: string) => {
    const bridge = getExtensionBridge()
    if (!bridge) return

    setRetryingJobId(jobId)
    try {
      const job = await bridge.retryScheduledPublish(jobId)
      const existing = await db.scheduledPublishes.where('jobId').equals(jobId).first()
      if (existing?.id) {
        await db.scheduledPublishes.update(existing.id, {
          status: job.status,
          results: JSON.stringify(job.results ?? []),
          error: job.error,
        })
      }
      await loadData()
    } finally {
      setRetryingJobId(null)
    }
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
        {scheduledItems.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">定时发布</h2>
            <div className="space-y-3">
              {scheduledItems.map(item => (
                <ScheduledPublishCard
                  key={item.jobId}
                  item={item}
                  cancelling={cancellingJobId === item.jobId}
                  retrying={retryingJobId === item.jobId}
                  onCancel={() => handleCancel(item.jobId)}
                  onRetry={() => handleRetry(item.jobId)}
                />
              ))}
            </div>
          </section>
        )}

        {items.length > 0 && (
          <h2 className="text-sm font-semibold text-gray-700 mb-3">普通发布</h2>
        )}

        {items.length === 0 && scheduledItems.length === 0 ? (
          <div className="text-center py-20">
            <History size={46} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">还没有发布记录</p>
          </div>
        ) : items.length > 0 ? (
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
                      {item.isDraft ? '查看草稿' : '查看'}
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  )
}

function ScheduledPublishCard({
  item,
  cancelling,
  retrying,
  onCancel,
  onRetry,
}: {
  item: ScheduledPublishRecord
  cancelling: boolean
  retrying: boolean
  onCancel: () => void
  onRetry: () => void
}) {
  const results = parseScheduledResults(item.results)
  const links = results.filter(result => result.url)

  return (
    <article className="bg-white border border-gray-200 rounded-lg px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock size={15} className={scheduleIconClass(item.status)} />
            <h3 className="text-sm font-medium text-gray-900 truncate">{item.articleTitle}</h3>
            <span className={scheduleBadgeClass(item.status)}>{scheduleStatusText(item.status, results)}</span>
          </div>
          <p className="text-xs text-gray-500">
            {item.platformNames.join('、')} · {new Date(item.scheduledAt).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          {results.length > 0 && (
            <div className="mt-2 space-y-1">
              {results.map(result => (
                <p key={result.platformId} className={scheduledResultClass(result)}>
                  {result.platformName} · {scheduledResultText(result)}
                </p>
              ))}
            </div>
          )}
          {item.error && (
            <p className="text-xs text-red-500 mt-2 line-clamp-2">{item.error}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {links.map(result => (
            <a
              key={`${result.platformId}-${result.url}`}
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              {links.length > 1 ? `${result.platformName} ` : ''}{result.isDraft ? '查看草稿' : '查看'}
              <ExternalLink size={12} />
            </a>
          ))}

          {(item.status === 'scheduled' || item.status === 'draft_ready') && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-40"
            >
              {cancelling ? '取消中...' : '取消'}
            </button>
          )}

          {item.status === 'error' && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-40"
            >
              {retrying ? '重试中...' : '重试'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function scheduleStatusText(
  status: ScheduledPublishRecord['status'],
  results: ScheduledResults = []
): string {
  const hasDraft = results.some(result => result.success && result.isDraft)
  const map: Record<ScheduledPublishRecord['status'], string> = {
    scheduled: '等待中',
    draft_ready: '草稿待发布',
    running: '发布中',
    publishing: '发布中',
    success: hasDraft ? '完成/仍有草稿' : '已发布',
    error: results.some(result => result.isDraft) ? '未完全发布' : '失败',
    cancelled: '已取消',
  }
  return map[status]
}

function scheduledResultText(result: ScheduledResults[number]): string {
  if (result.success && !result.isDraft) return '已发布'
  if (result.success && result.isDraft) return '草稿已创建'
  if (result.isDraft && result.postId) return `仍是草稿 · ${result.error ?? '未完成自动发布'}`
  if (result.isDraft) return `草稿创建失败 · ${result.error ?? '无法纳入定时发布'}`
  return result.error ?? '失败'
}

function scheduledResultClass(result: ScheduledResults[number]): string {
  if (result.success && !result.isDraft) return 'text-xs text-gray-500'
  if (result.isDraft && result.postId) return 'text-xs text-amber-600'
  return 'text-xs text-red-500'
}

function parseScheduledResults(results?: string): ScheduledResults {
  if (!results) return []
  try {
    const parsed = JSON.parse(results)
    return Array.isArray(parsed) ? parsed as ScheduledResults : []
  } catch {
    return []
  }
}

function scheduleBadgeClass(status: ScheduledPublishRecord['status']): string {
  const base = 'text-[11px] px-1.5 py-0.5 rounded-full'
  switch (status) {
    case 'scheduled':
    case 'draft_ready':
      return `${base} bg-blue-50 text-blue-600`
    case 'running':
    case 'publishing':
      return `${base} bg-amber-50 text-amber-600`
    case 'success':
      return `${base} bg-green-50 text-green-600`
    case 'error':
      return `${base} bg-red-50 text-red-600`
    case 'cancelled':
      return `${base} bg-gray-100 text-gray-500`
  }
}

function scheduleIconClass(status: ScheduledPublishRecord['status']): string {
  switch (status) {
    case 'success':
      return 'text-green-500 flex-shrink-0'
    case 'error':
      return 'text-red-500 flex-shrink-0'
    case 'cancelled':
      return 'text-gray-400 flex-shrink-0'
    case 'publishing':
    case 'running':
      return 'text-amber-500 flex-shrink-0'
    default:
      return 'text-blue-500 flex-shrink-0'
  }
}

function isVisibleArticleForHistory(
  article: { cacheOwnerId?: string; remoteId?: string; ownerId?: string; permissionRole?: string },
  cacheOwnerId: string
): boolean {
  if (cacheOwnerId === 'guest') {
    return article.cacheOwnerId === 'guest' || (!article.cacheOwnerId && !article.remoteId && !article.ownerId && !article.permissionRole)
  }
  return article.cacheOwnerId === cacheOwnerId ||
    (!article.cacheOwnerId && article.ownerId === cacheOwnerId) ||
    (!article.cacheOwnerId && !article.remoteId && !article.ownerId && !article.permissionRole)
}
