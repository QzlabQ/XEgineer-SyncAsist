import { NextResponse } from 'next/server'

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorized(): NextResponse {
  return jsonError('未登录或登录已过期', 401)
}

export function handleApiError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[XEgineer API]', error)

  if (message.includes('Environment variable not found: DATABASE_URL')) {
    return jsonError('数据库未配置：请设置 DATABASE_URL 并运行 Prisma migration', 503)
  }

  if (message.includes("Can't reach database server") || message.includes('ECONNREFUSED')) {
    return jsonError('数据库未连接：请确认 PostgreSQL 已启动并且 DATABASE_URL 正确', 503)
  }

  if (message.includes('does not exist in the current database')) {
    return jsonError('数据库表尚未创建：请运行 yarn workspace @xegineer/web run prisma:migrate', 503)
  }

  return jsonError('服务器内部错误，请查看服务端日志', 500)
}
