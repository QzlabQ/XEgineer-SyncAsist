import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/prisma'
import { jsonError, unauthorized } from '@/lib/server/responses'
import { requireArticleRole } from '@/lib/server/permissions'

const CollaborationPatchSchema = z.object({
  ydocStateBase64: z.string().optional(),
  version: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  tiptapJSON: z.string().optional(),
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

  const snapshot = await prisma.collaborationSnapshot.findUnique({
    where: { articleId: id },
    select: { ydocState: true, version: true, updatedAt: true, updatedById: true },
  })

  return NextResponse.json({
    collaboration: {
      articleRemoteId: id,
      permissionRole: access.role,
      version: snapshot?.version ?? 0,
      updatedAt: snapshot?.updatedAt.getTime() ?? access.article.updatedAt.getTime(),
      updatedById: snapshot?.updatedById ?? null,
      ydocStateBase64: snapshot?.ydocState ? Buffer.from(snapshot.ydocState).toString('base64') : null,
      article: {
        title: access.article.title,
        tiptapJSON: access.article.tiptapJSON,
        updatedAt: access.article.updatedAt.getTime(),
      },
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
  const access = await requireArticleRole(user.id, id, 'EDITOR')
  if (!access) return jsonError('只有 Editor 或 Owner 可以写入协作状态', 403)

  const parsed = CollaborationPatchSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('协作状态格式不正确')

  if (parsed.data.title !== undefined || parsed.data.tiptapJSON !== undefined) {
    await prisma.article.update({
      where: { id },
      data: {
        title: parsed.data.title ?? access.article.title,
        tiptapJSON: parsed.data.tiptapJSON ?? access.article.tiptapJSON,
      },
    })
  }

  const snapshot = await prisma.collaborationSnapshot.upsert({
    where: { articleId: id },
    update: {
      ydocState: parseBase64(parsed.data.ydocStateBase64),
      version: { increment: 1 },
      updatedById: user.id,
    },
    create: {
      articleId: id,
      ydocState: parseBase64(parsed.data.ydocStateBase64),
      version: parsed.data.version ?? 1,
      updatedById: user.id,
    },
  })

  return NextResponse.json({
    collaboration: {
      articleRemoteId: id,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt.getTime(),
    },
  })
}

function parseBase64(value: string | undefined): Buffer | undefined {
  if (!value) return undefined
  return Buffer.from(value, 'base64')
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
