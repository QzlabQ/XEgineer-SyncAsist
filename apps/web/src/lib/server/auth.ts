import type { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import { prisma } from './prisma'
import { createOpaqueToken, hashToken } from './password'

const ACCESS_COOKIE = 'xeg_access'
const REFRESH_COOKIE = 'xeg_refresh'
const ACCESS_TTL_SECONDS = 15 * 60
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60

export interface AuthUser {
  id: string
  email: string
  name?: string | null
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
  refreshExpiresAt: Date
}

export async function createSession(user: AuthUser): Promise<SessionTokens> {
  const accessToken = await signAccessToken(user)
  const refreshToken = createOpaqueToken()
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000)

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
    },
  })

  return { accessToken, refreshToken, refreshExpiresAt }
}

export function setSessionCookies(response: NextResponse, tokens: SessionTokens): void {
  setAccessCookie(response, tokens.accessToken)
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: tokens.refreshExpiresAt,
  })
}

export function setAccessCookie(response: NextResponse, accessToken: string): void {
  response.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_TTL_SECONDS,
  })
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  response.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    const userId = typeof payload.sub === 'string' ? payload.sub : ''
    if (!userId) return null

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    })
    return user
  } catch {
    return null
  }
}

export async function refreshAccessToken(request: NextRequest): Promise<{ user: AuthUser; accessToken: string } | null> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return null

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { select: { id: true, email: true, name: true } } },
  })

  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    return null
  }

  return {
    user: stored.user,
    accessToken: await signAccessToken(stored.user),
  }
}

export async function revokeRefreshToken(request: NextRequest): Promise<void> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashToken(refreshToken),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
}

async function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name ?? undefined,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(getJwtSecret())
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'xegineer-dev-secret-change-me' : '')
  if (!secret) {
    throw new Error('JWT_SECRET is required in production')
  }
  return new TextEncoder().encode(secret)
}
