import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callDeepSeek } from '@/lib/server/deepseek'
import { buildAiMessages } from '@/lib/server/ai-prompts'
import { getAuthUser } from '@/lib/server/auth'
import { requireArticleRole } from '@/lib/server/permissions'
import { handleApiError, jsonError, unauthorized } from '@/lib/server/responses'

const AiWriteSchema = z.object({
  mode: z.enum(['rewrite', 'summary', 'titles', 'tags', 'continue', 'expand', 'shorten', 'chat']),
  articleRemoteId: z.string().optional(),
  title: z.string().optional(),
  plainText: z.string().default(''),
  selectionText: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'xiaohongshu']).optional(),
  userPrompt: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()

    const parsed = AiWriteSchema.safeParse(await safeJson(request))
    if (!parsed.success) return jsonError('AI 请求参数格式不正确')

    if (parsed.data.articleRemoteId) {
      const access = await requireArticleRole(user.id, parsed.data.articleRemoteId, 'VIEWER')
      if (!access) return jsonError('文章不存在或无权使用 AI', 403)
    }

    const prompt = buildAiMessages(parsed.data)
    const response = await callDeepSeek(prompt.messages, { json: prompt.json })
    const result = normalizeResult(parsed.data.mode, response.content)

    return NextResponse.json({
      result,
      usage: response.usage ?? null,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('DeepSeek API Key 未配置')) {
      return jsonError(error.message, 503)
    }
    if (error instanceof Error && error.message.startsWith('DeepSeek')) {
      return jsonError(error.message, 502)
    }
    return handleApiError(error)
  }
}

function normalizeResult(mode: z.infer<typeof AiWriteSchema>['mode'], content: string): unknown {
  const text = content.trim()
  if (mode !== 'titles' && mode !== 'tags') return text

  const parsed = parseJsonObject(text)
  if (mode === 'titles') {
    const titles = Array.isArray(parsed?.titles)
      ? parsed.titles.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
      : []
    return { titles }
  }

  const tags = Array.isArray(parsed?.tags)
    ? parsed.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
    : []
  return { tags }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    const match = value.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0])
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
