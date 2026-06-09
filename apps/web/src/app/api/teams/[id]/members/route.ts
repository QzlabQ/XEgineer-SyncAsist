import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { canManageTeam, getTeamRole, normalizeTeamRole } from '@/lib/server/permissions'

const TeamMemberCreateSchema = z.object({
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
  const role = await getTeamRole(user.id, id)
  if (!role) return jsonError('团队不存在或无权访问', 404)

  const members = await prisma.teamMember.findMany({
    where: { teamId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  })

  return NextResponse.json({
    members: members.map(member => ({
      id: member.id,
      role: member.role,
      createdAt: member.createdAt.getTime(),
      user: member.user,
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
  const myRole = await getTeamRole(user.id, id)
  if (!canManageTeam(myRole)) return jsonError('只有团队 Owner 可以邀请成员', 403)

  const parsed = TeamMemberCreateSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('成员邮箱或角色格式不正确')

  const target = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, email: true, name: true },
  })
  if (!target) return jsonError('该邮箱尚未注册，暂不能加入团队', 404)

  const member = await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: id, userId: target.id } },
    update: { role: normalizeTeamRole(parsed.data.role), invitedById: user.id },
    create: {
      teamId: id,
      userId: target.id,
      role: normalizeTeamRole(parsed.data.role),
      invitedById: user.id,
    },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  })

  return NextResponse.json({
    member: {
      id: member.id,
      role: member.role,
      createdAt: member.createdAt.getTime(),
      user: member.user,
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
