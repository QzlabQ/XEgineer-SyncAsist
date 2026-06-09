import { NextRequest, NextResponse } from 'next/server'
import type { ArticleRole } from '@prisma/client'
import { getAuthUser } from '@/lib/server/auth'
import { hashToken } from '@/lib/server/password'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { articleAccessInclude, resolveArticleRole } from '@/lib/server/permissions'

const roleRank: Record<ArticleRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  const link = await findUsableLink(token)
  if (!link) return jsonError('分享链接无效或已过期', 404)

  return NextResponse.json({
    share: {
      role: link.role,
      expiresAt: link.expiresAt?.getTime() ?? null,
      article: {
        remoteId: link.article.id,
        title: link.article.title,
        ownerName: link.article.user.name || link.article.user.email,
      },
    },
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { token } = await context.params
  const link = await findUsableLink(token)
  if (!link) return jsonError('分享链接无效或已过期', 404)

  if (link.article.userId !== user.id) {
    const existing = await prisma.articleCollaborator.findUnique({
      where: { articleId_userId: { articleId: link.articleId, userId: user.id } },
      select: { role: true },
    })
    const role = existing && roleRank[existing.role] >= roleRank[link.role] ? existing.role : link.role
    await prisma.articleCollaborator.upsert({
      where: { articleId_userId: { articleId: link.articleId, userId: user.id } },
      update: { role, invitedById: link.createdById },
      create: {
        articleId: link.articleId,
        userId: user.id,
        role,
        invitedById: link.createdById,
      },
    })
  }

  await prisma.articleShareLink.update({
    where: { id: link.id },
    data: { lastUsedAt: new Date() },
  })

  const article = await prisma.article.findUnique({
    where: { id: link.articleId },
    include: articleAccessInclude(user.id),
  })
  if (!article) return jsonError('文章不存在', 404)

  return NextResponse.json({
    article: {
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
    },
  })
}

async function findUsableLink(token: string) {
  const link = await prisma.articleShareLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      article: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  })
  if (!link || !link.enabled) return null
  if (link.expiresAt && link.expiresAt <= new Date()) return null
  return link
}
