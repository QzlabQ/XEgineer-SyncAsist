import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookies, refreshAccessToken, setAccessCookie } from '@/lib/server/auth'
import { unauthorized } from '@/lib/server/responses'

export async function POST(request: NextRequest) {
  const refreshed = await refreshAccessToken(request)
  if (!refreshed) {
    const response = unauthorized()
    clearSessionCookies(response)
    return response
  }

  const response = NextResponse.json({ user: refreshed.user })
  setAccessCookie(response, refreshed.accessToken)
  return response
}
