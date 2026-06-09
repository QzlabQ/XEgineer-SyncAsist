import { ApiError, apiFetch } from './api-client'
import { db, type ArticleRecord, type PlatformConfigRecord, type PublishRecord } from './db'

export interface SyncDebugInfo {
  phase: string
  message: string
  lastRunAt: number
  endpoint?: string
  error?: string
  counts?: {
    articles: number
    articlePush: number
    platformConfigs: number
    configPush: number
    publishHistory: number
    historyPush: number
  }
  mappings?: {
    articles: number
    platformConfigs: number
    publishHistory: number
  }
  samples?: {
    articles: Array<Record<string, unknown>>
    platformConfigs: Array<Record<string, unknown>>
    publishHistory: Array<Record<string, unknown>>
  }
}

type SyncDebugReporter = (info: SyncDebugInfo) => void

interface BootstrapResponse {
  articles: Array<Omit<ArticleRecord, 'id' | 'syncStatus' | 'lastSyncedAt' | 'syncError'> & { remoteId: string }>
  platformConfigs: Array<{ remoteId: string; articleRemoteId: string; platform: string; config: unknown; updatedAt: number }>
  publishHistory: Array<Omit<PublishRecord, 'id' | 'articleId'> & { remoteId: string; articleRemoteId?: string | null }>
}

interface PushResponse {
  articleMappings: Array<{ localId?: number; remoteId: string; updatedAt: number }>
  configMappings: Array<{ localId?: number; remoteId: string }>
  historyMappings: Array<{ localId?: number; remoteId: string }>
}

export async function syncLocalToCloud(report?: SyncDebugReporter): Promise<void> {
  const [articles, platformConfigs, publishHistory] = await Promise.all([
    db.articles.toArray(),
    db.platformConfigs.toArray(),
    db.publishHistory.toArray(),
  ])

  const articlePayload = articles
    .filter(article => !article.remoteId || article.syncStatus === 'dirty' || article.syncStatus === 'error')
    .map(toArticlePayload)

  const configPayload = platformConfigs.map(row => ({
    localId: row.id,
    remoteId: row.remoteId,
    articleId: row.articleId,
    articleRemoteId: articles.find(article => article.id === row.articleId)?.remoteId,
    platform: row.platform,
    config: parseConfig(row.config),
  }))

  const historyPayload = publishHistory
    .filter(row => !row.remoteId)
    .map(row => ({
      localId: row.id,
      remoteId: row.remoteId,
      articleId: row.articleId,
      articleRemoteId: articles.find(article => article.id === row.articleId)?.remoteId,
      platform: row.platform,
      platformName: row.platformName,
      publishedAt: row.publishedAt,
      url: row.url,
      postId: row.postId,
      isDraft: row.isDraft,
      success: row.success,
      error: row.error,
      message: row.message,
    }))

  const counts = {
    articles: articles.length,
    articlePush: articlePayload.length,
    platformConfigs: platformConfigs.length,
    configPush: configPayload.length,
    publishHistory: publishHistory.length,
    historyPush: historyPayload.length,
  }
  const samples = {
    articles: articlePayload.slice(0, 3).map(sampleArticle),
    platformConfigs: configPayload.slice(0, 3).map(samplePlatformConfig),
    publishHistory: historyPayload.slice(0, 3).map(samplePublishHistory),
  }

  reportSync(report, {
    phase: 'prepare',
    message: '已读取本地 IndexedDB，准备同步云端',
    counts,
    samples,
  })

  if (articlePayload.length || configPayload.length || historyPayload.length) {
    const endpoint = 'POST /api/sync/push'
    reportSync(report, {
      phase: 'push',
      endpoint,
      message: '正在上传本地新增或变更数据',
      counts,
      samples,
    })

    let pushed: PushResponse
    try {
      pushed = await apiFetch<PushResponse>('/api/sync/push', {
        method: 'POST',
        body: JSON.stringify({
          articles: articlePayload,
          platformConfigs: configPayload,
          publishHistory: historyPayload,
        }),
      })
    } catch (error) {
      reportSync(report, {
        phase: 'push-error',
        endpoint,
        message: describeError(error),
        error: describeError(error),
        counts,
        samples,
      })
      throw error
    }

    reportSync(report, {
      phase: 'push-ok',
      endpoint,
      message: '本地数据已上传，正在回写远端 ID',
      counts,
      mappings: {
        articles: pushed.articleMappings.length,
        platformConfigs: pushed.configMappings.length,
        publishHistory: pushed.historyMappings.length,
      },
    })
    await applyPushMappings(pushed)
  }

  reportSync(report, {
    phase: 'bootstrap',
    endpoint: 'GET /api/sync/bootstrap',
    message: '正在拉取云端最新数据',
    counts,
  })

  let bootstrap: BootstrapResponse
  try {
    bootstrap = await apiFetch<BootstrapResponse>('/api/sync/bootstrap')
  } catch (error) {
    reportSync(report, {
      phase: 'bootstrap-error',
      endpoint: 'GET /api/sync/bootstrap',
      message: describeError(error),
      error: describeError(error),
      counts,
    })
    throw error
  }

  reportSync(report, {
    phase: 'merge',
    message: '云端数据已拉取，正在合并到本地缓存',
    counts: {
      ...counts,
      articles: bootstrap.articles.length,
      platformConfigs: bootstrap.platformConfigs.length,
      publishHistory: bootstrap.publishHistory.length,
    },
  })
  await mergeBootstrap(bootstrap)

  reportSync(report, {
    phase: 'done',
    message: '云同步完成',
    counts: {
      ...counts,
      articles: bootstrap.articles.length,
      platformConfigs: bootstrap.platformConfigs.length,
      publishHistory: bootstrap.publishHistory.length,
    },
  })
}

export async function syncArticleByLocalId(localId: number, report?: SyncDebugReporter): Promise<void> {
  const article = await db.articles.get(localId)
  if (!article) {
    reportSync(report, {
      phase: 'article-missing',
      message: `未找到本地文章：${localId}`,
    })
    return
  }

  if (article.remoteId) {
    const endpoint = `PATCH /api/articles/${article.remoteId}`
    reportSync(report, {
      phase: 'article-patch',
      endpoint,
      message: '正在保存单篇文章到云端',
      samples: { articles: [sampleArticle(toArticlePayload(article))], platformConfigs: [], publishHistory: [] },
    })

    let response: { article: { remoteId: string; updatedAt: number } }
    try {
      response = await apiFetch<{ article: { remoteId: string; updatedAt: number } }>(`/api/articles/${article.remoteId}`, {
        method: 'PATCH',
        body: JSON.stringify(toArticlePayload(article)),
      })
    } catch (error) {
      reportSync(report, {
        phase: 'article-patch-error',
        endpoint,
        message: describeError(error),
        error: describeError(error),
        samples: { articles: [sampleArticle(toArticlePayload(article))], platformConfigs: [], publishHistory: [] },
      })
      throw error
    }

    await db.articles.update(localId, {
      remoteId: response.article.remoteId,
      updatedAt: response.article.updatedAt,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      syncError: undefined,
    })
    return
  }

  const endpoint = 'POST /api/sync/push'
  reportSync(report, {
    phase: 'article-create',
    endpoint,
    message: '正在创建云端文章',
    samples: { articles: [sampleArticle(toArticlePayload(article))], platformConfigs: [], publishHistory: [] },
  })

  let pushed: PushResponse
  try {
    pushed = await apiFetch<PushResponse>('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ articles: [toArticlePayload(article)] }),
    })
  } catch (error) {
    reportSync(report, {
      phase: 'article-create-error',
      endpoint,
      message: describeError(error),
      error: describeError(error),
      samples: { articles: [sampleArticle(toArticlePayload(article))], platformConfigs: [], publishHistory: [] },
    })
    throw error
  }

  await applyPushMappings(pushed)
}

export async function deleteRemoteArticle(remoteId: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/articles/${remoteId}`, { method: 'DELETE' })
}

async function applyPushMappings(response: PushResponse): Promise<void> {
  await Promise.all([
    ...response.articleMappings
      .filter(item => typeof item.localId === 'number')
      .map(item => db.articles.update(item.localId!, {
        remoteId: item.remoteId,
        updatedAt: item.updatedAt,
        syncStatus: 'synced' as const,
        lastSyncedAt: Date.now(),
        syncError: undefined,
      })),
    ...response.configMappings
      .filter(item => typeof item.localId === 'number')
      .map(item => db.platformConfigs.update(item.localId!, { remoteId: item.remoteId })),
    ...response.historyMappings
      .filter(item => typeof item.localId === 'number')
      .map(item => db.publishHistory.update(item.localId!, { remoteId: item.remoteId })),
  ])
}

async function mergeBootstrap(data: BootstrapResponse): Promise<void> {
  const localArticles = await db.articles.toArray()

  for (const remote of data.articles) {
    const existing = localArticles.find(article => article.remoteId === remote.remoteId)
    const record = {
      remoteId: remote.remoteId,
      title: remote.title,
      tiptapJSON: remote.tiptapJSON,
      cover: remote.cover ?? undefined,
      summary: remote.summary ?? undefined,
      tags: remote.tags ?? [],
      categories: remote.categories ?? [],
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
      syncStatus: 'synced' as const,
      lastSyncedAt: Date.now(),
      syncError: undefined,
    }

    if (existing?.id) {
      await db.articles.update(existing.id, record)
    } else {
      await db.articles.add(record)
    }
  }

  const refreshedArticles = await db.articles.toArray()

  for (const remote of data.platformConfigs) {
    const article = refreshedArticles.find(item => item.remoteId === remote.articleRemoteId)
    if (!article?.id) continue

    const existingByRemote = remote.remoteId
      ? (await db.platformConfigs.toArray()).find(item => item.remoteId === remote.remoteId)
      : undefined
    const existing = existingByRemote ?? await db.platformConfigs.where('[articleId+platform]').equals([article.id, remote.platform]).first()
    const record = {
      remoteId: remote.remoteId,
      articleId: article.id,
      platform: remote.platform,
      config: JSON.stringify(remote.config ?? {}),
      updatedAt: remote.updatedAt,
    }

    if (existing?.id) await db.platformConfigs.update(existing.id, record)
    else await db.platformConfigs.add(record)
  }

  const existingHistory = await db.publishHistory.toArray()
  for (const remote of data.publishHistory) {
    if (existingHistory.some(item => item.remoteId === remote.remoteId)) continue
    const article = remote.articleRemoteId
      ? refreshedArticles.find(item => item.remoteId === remote.articleRemoteId)
      : undefined

    await db.publishHistory.add({
      remoteId: remote.remoteId,
      articleId: article?.id ?? 0,
      platform: remote.platform,
      platformName: remote.platformName,
      publishedAt: remote.publishedAt,
      url: remote.url ?? undefined,
      postId: remote.postId ?? undefined,
      isDraft: remote.isDraft,
      success: remote.success,
      error: remote.error ?? undefined,
      message: remote.message ?? undefined,
    })
  }
}

function toArticlePayload(article: ArticleRecord) {
  return {
    localId: article.id,
    remoteId: article.remoteId,
    title: article.title,
    tiptapJSON: article.tiptapJSON,
    cover: article.cover,
    summary: article.summary,
    tags: article.tags,
    categories: article.categories,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  }
}

function parseConfig(config: string): unknown {
  try {
    return JSON.parse(config)
  } catch {
    return {}
  }
}

function reportSync(report: SyncDebugReporter | undefined, info: Omit<SyncDebugInfo, 'lastRunAt'>): void {
  report?.({ ...info, lastRunAt: Date.now() })
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (${error.status} ${error.url})`
  return error instanceof Error ? error.message : String(error)
}

function sampleArticle(article: ReturnType<typeof toArticlePayload>): Record<string, unknown> {
  return {
    localId: article.localId,
    remoteId: article.remoteId,
    title: article.title,
    hasContent: Boolean(article.tiptapJSON),
    createdAtType: typeof article.createdAt,
    updatedAtType: typeof article.updatedAt,
    syncFields: {
      tags: Array.isArray(article.tags) ? article.tags.length : typeof article.tags,
      categories: Array.isArray(article.categories) ? article.categories.length : typeof article.categories,
    },
  }
}

function samplePlatformConfig(config: {
  localId?: number
  remoteId?: string
  articleId: number
  articleRemoteId?: string
  platform: string
  config: unknown
}): Record<string, unknown> {
  return {
    localId: config.localId,
    remoteId: config.remoteId,
    articleId: config.articleId,
    articleRemoteId: config.articleRemoteId,
    platform: config.platform,
    configType: typeof config.config,
  }
}

function samplePublishHistory(history: {
  localId?: number
  remoteId?: string
  articleId: number
  articleRemoteId?: string
  platform: string
  publishedAt: number
  isDraft: boolean
  success: boolean
}): Record<string, unknown> {
  return {
    localId: history.localId,
    remoteId: history.remoteId,
    articleId: history.articleId,
    articleRemoteId: history.articleRemoteId,
    platform: history.platform,
    publishedAtType: typeof history.publishedAt,
    isDraftType: typeof history.isDraft,
    successType: typeof history.success,
  }
}
