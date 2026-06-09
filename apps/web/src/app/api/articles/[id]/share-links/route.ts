import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { createOpaqueToken, hashToken } from '@/lib/server/password'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { normalizeArticleRole, requireArticleRole } from '@/lib/server/permissions'

const ShareLinkCreateSchema = z.object({
  role: z.enum(['EDITOR', 'VIEWER']).default('VIEWER'),
  expiresInDays: z.number().int().positive().max(365).optional(),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const { id } = await context.params
  const access = await requireArticleRole(user.id, id, 'OWNER')
  if (!access) return jsonError('只有 Owner 可以查看分享链接', 403)

  const links = await prisma.articleShareLink.findMany({
    where: { articleId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      role: true,
      enabled: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, email: true, name: true } },
    },
  })

  return NextResponse.json({
    links: links.map(link => ({
      id: link.id,
      role: link.role,
      enabled: link.enabled,
      expiresAt: link.expiresAt?.getTime() ?? null,
      lastUsedAt: link.lastUsedAt?.getTime() ?? null,
      createdAt: link.createdAt.getTime(),
      createdBy: link.createdBy,
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
  if (!access) return jsonError('只有 Owner 可以创建分享链接', 403)

  const parsed = ShareLinkCreateSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('分享链接参数格式不正确')

  const token = createOpaqueToken()
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null

  const link = await prisma.articleShareLink.create({
    data: {
      articleId: id,
      tokenHash: hashToken(token),
      role: normalizeArticleRole(parsed.data.role),
      expiresAt,
      createdById: user.id,
    },
  })

  return NextResponse.json({
    link: {
      id: link.id,
      role: link.role,
      enabled: link.enabled,
      expiresAt: link.expiresAt?.getTime() ?? null,
      createdAt: link.createdAt.getTime(),
      url: `${getAppUrl()}/share/${token}`,
    },
  })
}

function getAppUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3210').replace(/\/$/, '')
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
