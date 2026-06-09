import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { canManageTeam, getTeamRole } from '@/lib/server/permissions'

const TeamPatchSchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const role = await getTeamRole(user.id, id)
  if (!role) return jsonError('团队不存在或无权访问', 404)

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      },
      articles: {
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, updatedAt: true },
      },
    },
  })
  if (!team) return jsonError('团队不存在', 404)

  return NextResponse.json({
    team: {
      id: team.id,
      name: team.name,
      myRole: role,
      createdAt: team.createdAt.getTime(),
      updatedAt: team.updatedAt.getTime(),
      members: team.members.map(member => ({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt.getTime(),
        user: member.user,
      })),
      articles: team.articles.map(article => ({
        remoteId: article.id,
        title: article.title,
        updatedAt: article.updatedAt.getTime(),
      })),
    },
  })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const role = await getTeamRole(user.id, id)
  if (!canManageTeam(role)) return jsonError('只有团队 Owner 可以修改团队', 403)

  const parsed = TeamPatchSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('团队名称不能为空')

  const team = await prisma.team.update({
    where: { id },
    data: { name: parsed.data.name },
  })

  return NextResponse.json({ team: { id: team.id, name: team.name, updatedAt: team.updatedAt.getTime() } })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const role = await getTeamRole(user.id, id)
  if (!canManageTeam(role)) return jsonError('只有团队 Owner 可以删除团队', 403)

  await prisma.team.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
