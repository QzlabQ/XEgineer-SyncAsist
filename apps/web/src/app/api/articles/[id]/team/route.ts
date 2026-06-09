import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { canManageTeam, getTeamRole, requireArticleRole } from '@/lib/server/permissions'

const ArticleTeamSchema = z.object({
  teamId: z.string().nullable(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const access = await requireArticleRole(user.id, id, 'OWNER')
  if (!access) return jsonError('只有 Owner 可以移动文章到团队空间', 403)

  const parsed = ArticleTeamSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('团队参数格式不正确')

  if (parsed.data.teamId) {
    const teamRole = await getTeamRole(user.id, parsed.data.teamId)
    if (!canManageTeam(teamRole)) return jsonError('只有团队 Owner 可以把文章加入该团队', 403)
  }

  const article = await prisma.article.update({
    where: { id },
    data: { teamId: parsed.data.teamId },
    include: { team: { select: { id: true, name: true } } },
  })

  return NextResponse.json({
    article: {
      remoteId: article.id,
      teamId: article.team?.id ?? null,
      teamName: article.team?.name ?? null,
      updatedAt: article.updatedAt.getTime(),
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
