import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'

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

  const existing = await prisma.article.findFirst({ where: { id, userId: user.id } })
  if (!existing) return jsonError('文章不存在', 404)

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
  const existing = await prisma.article.findFirst({ where: { id, userId: user.id } })
  if (!existing) return jsonError('文章不存在', 404)

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
