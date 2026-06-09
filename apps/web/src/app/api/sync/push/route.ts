import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { requireArticleRole } from '@/lib/server/permissions'

const numberLike = z.preprocess(value => {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return value
}, z.number().finite().optional())

const timestampLike = z.preprocess(value => {
  if (value === null || value === undefined || value === '') return undefined
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return value
}, z.number().finite().optional())

const booleanLike = z.preprocess(value => {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  return value
}, z.boolean().optional())

const stringArrayLike = z.preprocess(value => {
  if (value === null || value === undefined || value === '') return undefined
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string')
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter(item => typeof item === 'string')
    } catch {
      // fall back to comma-separated legacy values
    }
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }
  return value
}, z.array(z.string()).optional())

const nullableStringLike = z.preprocess(value => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}, z.string().nullable().optional())

const ArticleSchema = z.object({
  localId: numberLike.nullish(),
  remoteId: nullableStringLike,
  title: nullableStringLike,
  tiptapJSON: nullableStringLike,
  cover: nullableStringLike,
  summary: nullableStringLike,
  tags: stringArrayLike.nullish(),
  categories: stringArrayLike.nullish(),
  createdAt: timestampLike.nullish(),
  updatedAt: timestampLike.nullish(),
})

const ConfigSchema = z.object({
  localId: numberLike.nullish(),
  remoteId: nullableStringLike,
  articleId: numberLike.nullish(),
  articleRemoteId: nullableStringLike,
  platform: nullableStringLike,
  config: z.unknown().optional(),
})

const HistorySchema = z.object({
  localId: numberLike.nullish(),
  remoteId: nullableStringLike,
  articleId: numberLike.nullish(),
  articleRemoteId: nullableStringLike,
  platform: nullableStringLike,
  platformName: nullableStringLike,
  publishedAt: timestampLike.nullish(),
  url: nullableStringLike,
  postId: nullableStringLike,
  isDraft: booleanLike.nullish(),
  success: booleanLike.nullish(),
  error: nullableStringLike,
  message: nullableStringLike,
})

const PushSchema = z.object({
  articles: z.array(ArticleSchema).optional(),
  platformConfigs: z.array(ConfigSchema).optional(),
  publishHistory: z.array(HistorySchema).optional(),
})

const emptyDoc = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const parsed = PushSchema.safeParse(await safeJson(request))
  if (!parsed.success) {
    console.warn('[XEgineer Sync] Invalid push payload:', parsed.error.issues)
    return jsonError(`同步数据格式不正确：${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('；')}`)
  }

  const articleMappings: Array<{ localId?: number; remoteId: string; updatedAt: number }> = []
  const configMappings: Array<{ localId?: number; remoteId: string }> = []
  const historyMappings: Array<{ localId?: number; remoteId: string }> = []
  const localToRemote = new Map<number, string>()

  for (const article of parsed.data.articles ?? []) {
    const record = await upsertArticle(user.id, article)
    if (!record) return jsonError('无权编辑共享文章，请确认当前账号权限', 403)
    if (typeof article.localId === 'number') localToRemote.set(article.localId, record.id)
    articleMappings.push({
      localId: article.localId ?? undefined,
      remoteId: record.id,
      updatedAt: record.updatedAt.getTime(),
    })
  }

  for (const config of parsed.data.platformConfigs ?? []) {
    const articleRemoteId = config.articleRemoteId || (typeof config.articleId === 'number' ? localToRemote.get(config.articleId) : undefined)
    if (!articleRemoteId) continue
    if (!config.platform) {
      console.warn('[XEgineer Sync] Skip platform config without platform:', {
        localId: config.localId,
        remoteId: config.remoteId,
        articleId: config.articleId,
        articleRemoteId,
      })
      continue
    }

    const access = await requireArticleRole(user.id, articleRemoteId, 'EDITOR')
    if (!access) continue

    const record = await prisma.platformConfig.upsert({
      where: { articleId_platform: { articleId: access.article.id, platform: config.platform } },
      update: {
        config: toPrismaJson(config.config),
        userId: user.id,
      },
      create: {
        userId: user.id,
        articleId: access.article.id,
        platform: config.platform,
        config: toPrismaJson(config.config),
      },
    })
    configMappings.push({ localId: config.localId ?? undefined, remoteId: record.id })
  }

  for (const item of parsed.data.publishHistory ?? []) {
    const articleRemoteId = item.articleRemoteId || (typeof item.articleId === 'number' ? localToRemote.get(item.articleId) : undefined)
    const access = articleRemoteId ? await requireArticleRole(user.id, articleRemoteId, 'EDITOR') : null
    if (articleRemoteId && !access) continue
    const platform = item.platform || 'unknown'

    const data = {
      userId: user.id,
      articleId: access?.article.id ?? null,
      platform,
      platformName: item.platformName || platform,
      publishedAt: new Date(normalizeTimestamp(item.publishedAt)),
      url: item.url ?? null,
      postId: item.postId ?? null,
      isDraft: item.isDraft ?? true,
      success: item.success ?? false,
      error: item.error ?? null,
      message: item.message ?? null,
    }

    const record = item.remoteId
      ? await updateOrCreatePublishHistory(user.id, item.remoteId, data)
      : await prisma.publishHistory.create({ data })

    historyMappings.push({ localId: item.localId ?? undefined, remoteId: record.id })
  }

  return NextResponse.json({ articleMappings, configMappings, historyMappings })
}

async function upsertArticle(userId: string, article: z.infer<typeof ArticleSchema>) {
  const data = {
    userId,
    title: article.title || '无标题文章',
    tiptapJSON: article.tiptapJSON || emptyDoc,
    cover: article.cover ?? null,
    summary: article.summary ?? null,
    tags: article.tags ?? [],
    categories: article.categories ?? [],
    createdAt: article.createdAt ? new Date(article.createdAt) : undefined,
    updatedAt: article.updatedAt ? new Date(article.updatedAt) : undefined,
  }

  const existing = article.remoteId
    ? await requireArticleRole(userId, article.remoteId, 'EDITOR')
    : null

  if (existing) {
    return prisma.article.update({
      where: { id: existing.article.id },
      data: {
        title: data.title,
        tiptapJSON: data.tiptapJSON,
        cover: data.cover,
        summary: data.summary,
        tags: data.tags,
        categories: data.categories,
        updatedAt: data.updatedAt,
      },
    })
  }

  return prisma.article.create({ data })
}

async function updateOrCreatePublishHistory(
  userId: string,
  remoteId: string,
  data: Prisma.PublishHistoryUncheckedCreateInput
) {
  const existing = await prisma.publishHistory.findFirst({ where: { id: remoteId, userId } })
  if (!existing) return prisma.publishHistory.create({ data })
  return prisma.publishHistory.update({ where: { id: existing.id }, data })
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  if (value === undefined) return {}
  return value as Prisma.InputJsonValue
}

function normalizeTimestamp(value: number | null | undefined): number {
  return Number.isFinite(value) ? value as number : Date.now()
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
