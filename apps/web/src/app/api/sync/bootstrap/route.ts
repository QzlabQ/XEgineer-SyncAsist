import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { unauthorized } from '@/lib/server/responses'
import { articleAccessInclude, getAccessibleArticleWhere, resolveArticleRole } from '@/lib/server/permissions'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const articles = await prisma.article.findMany({
    where: getAccessibleArticleWhere(user.id),
    include: articleAccessInclude(user.id),
    orderBy: { updatedAt: 'desc' },
  })
  const accessibleArticleIds = articles.map(article => article.id)

  const [platformConfigs, publishHistory] = await Promise.all([
    prisma.platformConfig.findMany({
      where: { userId: user.id, articleId: { in: accessibleArticleIds } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.publishHistory.findMany({
      where: {
        userId: user.id,
        OR: [
          { articleId: null },
          { articleId: { in: accessibleArticleIds } },
        ],
      },
      orderBy: { publishedAt: 'desc' },
    }),
  ])

  return NextResponse.json({
    articles: articles.map(article => ({
      remoteId: article.id,
      title: article.title,
      tiptapJSON: article.tiptapJSON,
      cover: article.cover,
      summary: article.summary,
      tags: article.tags,
      categories: article.categories,
      createdAt: article.createdAt.getTime(),
      updatedAt: article.updatedAt.getTime(),
      ownerId: article.userId,
      ownerName: article.user.name || article.user.email,
      teamId: article.team?.id ?? null,
      teamName: article.team?.name ?? null,
      permissionRole: resolveArticleRole(article, user.id) ?? 'VIEWER',
    })),
    platformConfigs: platformConfigs.map(config => ({
      remoteId: config.id,
      articleRemoteId: config.articleId,
      platform: config.platform,
      config: config.config,
      updatedAt: config.updatedAt.getTime(),
    })),
    publishHistory: publishHistory.map(record => ({
      remoteId: record.id,
      articleRemoteId: record.articleId,
      platform: record.platform,
      platformName: record.platformName,
      publishedAt: record.publishedAt.getTime(),
      url: record.url,
      postId: record.postId,
      isDraft: record.isDraft,
      success: record.success,
      error: record.error,
      message: record.message,
    })),
  })
}
