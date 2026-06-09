import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookies, revokeRefreshToken } from '@/lib/server/auth'

export async function POST(request: NextRequest) {
  await revokeRefreshToken(request)
  const response = NextResponse.json({ ok: true })
  clearSessionCookies(response)
  return response
}
