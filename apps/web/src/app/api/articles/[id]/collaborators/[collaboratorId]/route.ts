import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { normalizeArticleRole, requireArticleRole } from '@/lib/server/permissions'

const CollaboratorPatchSchema = z.object({
  role: z.enum(['OWNER', 'EDITOR', 'VIEWER']),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; collaboratorId: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id, collaboratorId } = await context.params
  const access = await requireArticleRole(user.id, id, 'OWNER')
  if (!access) return jsonError('只有 Owner 可以修改协作者权限', 403)

  const parsed = CollaboratorPatchSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('协作者角色格式不正确')

  const existing = await prisma.articleCollaborator.findFirst({ where: { id: collaboratorId, articleId: id } })
  if (!existing) return jsonError('协作者不存在', 404)

  const collaborator = await prisma.articleCollaborator.update({
    where: { id: collaboratorId },
    data: { role: normalizeArticleRole(parsed.data.role) },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
      invitedBy: { select: { id: true, email: true, name: true } },
    },
  })

  return NextResponse.json({
    collaborator: {
      id: collaborator.id,
      role: collaborator.role,
      createdAt: collaborator.createdAt.getTime(),
      user: collaborator.user,
      invitedBy: collaborator.invitedBy,
    },
  })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; collaboratorId: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id, collaboratorId } = await context.params
  const access = await requireArticleRole(user.id, id, 'OWNER')
  if (!access) return jsonError('只有 Owner 可以移除协作者', 403)

  const existing = await prisma.articleCollaborator.findFirst({ where: { id: collaboratorId, articleId: id } })
  if (!existing) return jsonError('协作者不存在', 404)

  await prisma.articleCollaborator.delete({ where: { id: collaboratorId } })
  return NextResponse.json({ ok: true })
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
