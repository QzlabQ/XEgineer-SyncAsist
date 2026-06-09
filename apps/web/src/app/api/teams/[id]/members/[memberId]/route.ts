import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { canManageTeam, getTeamRole, normalizeTeamRole } from '@/lib/server/permissions'

const TeamMemberPatchSchema = z.object({
  role: z.enum(['OWNER', 'EDITOR', 'VIEWER']),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; memberId: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id, memberId } = await context.params
  const myRole = await getTeamRole(user.id, id)
  if (!canManageTeam(myRole)) return jsonError('只有团队 Owner 可以修改成员权限', 403)

  const parsed = TeamMemberPatchSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('成员角色格式不正确')

  const existing = await prisma.teamMember.findFirst({ where: { id: memberId, teamId: id } })
  if (!existing) return jsonError('成员不存在', 404)
  if (existing.role === 'OWNER' && parsed.data.role !== 'OWNER') {
    const ownerCount = await prisma.teamMember.count({ where: { teamId: id, role: 'OWNER' } })
    if (ownerCount <= 1) return jsonError('团队至少需要保留一个 Owner', 400)
  }

  const member = await prisma.teamMember.update({
    where: { id: memberId },
    data: { role: normalizeTeamRole(parsed.data.role) },
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; memberId: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id, memberId } = await context.params
  const myRole = await getTeamRole(user.id, id)
  if (!canManageTeam(myRole)) return jsonError('只有团队 Owner 可以移除成员', 403)

  const existing = await prisma.teamMember.findFirst({ where: { id: memberId, teamId: id } })
  if (!existing) return jsonError('成员不存在', 404)
  if (existing.role === 'OWNER') {
    const ownerCount = await prisma.teamMember.count({ where: { teamId: id, role: 'OWNER' } })
    if (ownerCount <= 1) return jsonError('团队至少需要保留一个 Owner', 400)
  }

  await prisma.teamMember.delete({ where: { id: memberId } })
  return NextResponse.json({ ok: true })
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
