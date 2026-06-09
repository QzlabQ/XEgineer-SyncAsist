import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { normalizeArticleRole, requireArticleRole } from '@/lib/server/permissions'

const CollaboratorCreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'EDITOR', 'VIEWER']).default('VIEWER'),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const access = await requireArticleRole(user.id, id, 'VIEWER')
  if (!access) return jsonError('文章不存在或无权访问', 404)

  const collaborators = await prisma.articleCollaborator.findMany({
    where: { articleId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
      invitedBy: { select: { id: true, email: true, name: true } },
    },
  })

  return NextResponse.json({
    owner: access.article.user,
    myRole: access.role,
    collaborators: collaborators.map(collaborator => ({
      id: collaborator.id,
      role: collaborator.role,
      createdAt: collaborator.createdAt.getTime(),
      user: collaborator.user,
      invitedBy: collaborator.invitedBy,
    })),
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const access = await requireArticleRole(user.id, id, 'OWNER')
  if (!access) return jsonError('只有 Owner 可以添加协作者', 403)

  const parsed = CollaboratorCreateSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('协作者邮箱或角色格式不正确')

  const target = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, email: true, name: true },
  })
  if (!target) return jsonError('该邮箱尚未注册，暂不能添加为协作者', 404)
  if (target.id === access.article.userId) return jsonError('文章创建者已经是 Owner', 400)

  const collaborator = await prisma.articleCollaborator.upsert({
    where: { articleId_userId: { articleId: id, userId: target.id } },
    update: { role: normalizeArticleRole(parsed.data.role), invitedById: user.id },
    create: {
      articleId: id,
      userId: target.id,
      role: normalizeArticleRole(parsed.data.role),
      invitedById: user.id,
    },
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

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
