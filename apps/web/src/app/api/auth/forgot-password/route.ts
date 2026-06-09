import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendPasswordResetEmail } from '@/lib/server/mail'
import { createOpaqueToken, hashToken } from '@/lib/server/password'
import { prisma } from '@/lib/server/prisma'

const ForgotSchema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  const parsed = ForgotSchema.safeParse(await safeJson(request))
  if (parsed.success) {
    const email = parsed.data.email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email } })
    if (user) {
      const token = createOpaqueToken()
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      })
      await sendPasswordResetEmail({ email, token })
    }
  }

  return NextResponse.json({ ok: true })
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
