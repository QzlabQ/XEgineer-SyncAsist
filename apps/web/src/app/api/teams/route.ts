import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'

const TeamCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const teams = await prisma.team.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: 'desc' },
    include: {
      members: { select: { id: true, role: true, user: { select: { id: true, email: true, name: true } } } },
      _count: { select: { articles: true } },
    },
  })

  return NextResponse.json({
    teams: teams.map(team => ({
      id: team.id,
      name: team.name,
      createdAt: team.createdAt.getTime(),
      updatedAt: team.updatedAt.getTime(),
      articleCount: team._count.articles,
      myRole: team.members.find(member => member.user.id === user.id)?.role ?? 'VIEWER',
      members: team.members.map(member => ({
        id: member.id,
        role: member.role,
        user: member.user,
      })),
    })),
  })
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const parsed = TeamCreateSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('团队名称不能为空')

  const team = await prisma.$transaction(async tx => {
    const created = await tx.team.create({
      data: {
        name: parsed.data.name,
        createdById: user.id,
      },
    })
    await tx.teamMember.create({
      data: {
        teamId: created.id,
        userId: user.id,
        role: 'OWNER',
      },
    })
    return created
  })

  return NextResponse.json({
    team: {
      id: team.id,
      name: team.name,
      myRole: 'OWNER',
      createdAt: team.createdAt.getTime(),
      updatedAt: team.updatedAt.getTime(),
      articleCount: 0,
      members: [{ id: '', role: 'OWNER', user }],
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
