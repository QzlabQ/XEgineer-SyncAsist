import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { requireArticleRole } from '@/lib/server/permissions'

const ArticlePatchSchema = z.object({
  title: z.string(),
  tiptapJSON: z.string(),
  cover: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const parsed = ArticlePatchSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('文章数据格式不正确')

  const access = await requireArticleRole(user.id, id, 'EDITOR')
  if (!access) return jsonError('无权编辑这篇文章', 403)

  const article = await prisma.article.update({
    where: { id },
    data: {
      title: parsed.data.title || '无标题文章',
      tiptapJSON: parsed.data.tiptapJSON,
      cover: parsed.data.cover ?? null,
      summary: parsed.data.summary ?? null,
      tags: parsed.data.tags ?? [],
      categories: parsed.data.categories ?? [],
    },
  })

  return NextResponse.json({
    article: {
      remoteId: article.id,
      updatedAt: article.updatedAt.getTime(),
      permissionRole: access.role,
    },
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const access = await requireArticleRole(user.id, id, 'VIEWER')
  if (!access) return jsonError('文章不存在或无权访问', 404)

  const { article, role } = access
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
      permissionRole: role,
    },
  })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const access = await requireArticleRole(user.id, id, 'OWNER')
  if (!access) return jsonError('只有 Owner 可以删除文章', 403)

  await prisma.article.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
