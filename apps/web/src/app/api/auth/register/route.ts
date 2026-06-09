import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, setSessionCookies } from '@/lib/server/auth'
import { hashPassword } from '@/lib/server/password'
import { prisma } from '@/lib/server/prisma'
import { handleApiError, jsonError } from '@/lib/server/responses'

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().max(80).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const parsed = RegisterSchema.safeParse(await safeJson(request))
    if (!parsed.success) return jsonError('请输入有效的邮箱和至少 8 位密码')

    const email = parsed.data.email.trim().toLowerCase()
    const name = parsed.data.name?.trim() || null

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return jsonError('该邮箱已注册', 409)

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(parsed.data.password),
      },
      select: { id: true, email: true, name: true },
    })

    const response = NextResponse.json({ user })
    setSessionCookies(response, await createSession(user))
    return response
  } catch (error) {
    return handleApiError(error)
  }
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
