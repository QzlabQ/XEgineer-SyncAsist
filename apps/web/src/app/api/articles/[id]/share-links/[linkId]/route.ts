import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { requireArticleRole } from '@/lib/server/permissions'

const ShareLinkPatchSchema = z.object({
  enabled: z.boolean(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; linkId: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id, linkId } = await context.params
  const access = await requireArticleRole(user.id, id, 'OWNER')
  if (!access) return jsonError('只有 Owner 可以修改分享链接', 403)

  const parsed = ShareLinkPatchSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('分享链接参数格式不正确')

  const existing = await prisma.articleShareLink.findFirst({ where: { id: linkId, articleId: id } })
  if (!existing) return jsonError('分享链接不存在', 404)

  const link = await prisma.articleShareLink.update({
    where: { id: linkId },
    data: { enabled: parsed.data.enabled },
  })

  return NextResponse.json({ link: { id: link.id, enabled: link.enabled } })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; linkId: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id, linkId } = await context.params
  const access = await requireArticleRole(user.id, id, 'OWNER')
  if (!access) return jsonError('只有 Owner 可以删除分享链接', 403)

  const existing = await prisma.articleShareLink.findFirst({ where: { id: linkId, articleId: id } })
  if (!existing) return jsonError('分享链接不存在', 404)

  await prisma.articleShareLink.delete({ where: { id: linkId } })
  return NextResponse.json({ ok: true })
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
