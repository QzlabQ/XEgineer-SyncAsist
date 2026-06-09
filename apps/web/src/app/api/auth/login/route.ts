import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, setSessionCookies } from '@/lib/server/auth'
import { verifyPassword } from '@/lib/server/password'
import { prisma } from '@/lib/server/prisma'
import { handleApiError, jsonError } from '@/lib/server/responses'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const parsed = LoginSchema.safeParse(await safeJson(request))
    if (!parsed.success) return jsonError('邮箱或密码错误', 401)

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.trim().toLowerCase() },
    })

    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return jsonError('邮箱或密码错误', 401)
    }

    const publicUser = { id: user.id, email: user.email, name: user.name }
    const response = NextResponse.json({ user: publicUser })
    setSessionCookies(response, await createSession(publicUser))
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
