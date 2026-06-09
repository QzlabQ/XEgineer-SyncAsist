import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hashPassword, hashToken } from '@/lib/server/password'
import { prisma } from '@/lib/server/prisma'
import { jsonError } from '@/lib/server/responses'

const ResetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
})

export async function POST(request: NextRequest) {
  const parsed = ResetSchema.safeParse(await safeJson(request))
  if (!parsed.success) return jsonError('重置链接无效或密码不足 8 位')

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  })

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
    return jsonError('重置链接无效或已过期', 400)
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])

  return NextResponse.json({ ok: true })
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
