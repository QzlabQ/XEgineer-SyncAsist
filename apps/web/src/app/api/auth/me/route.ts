import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/server/auth'
import { unauthorized } from '@/lib/server/responses'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  return NextResponse.json({ user })
}
