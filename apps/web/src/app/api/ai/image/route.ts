import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildAiImagePrompt } from '@/lib/server/ai-image-prompts'
import { generateArkImages } from '@/lib/server/ark-image'
import { getAuthUser } from '@/lib/server/auth'
import { requireArticleRole } from '@/lib/server/permissions'
import { handleApiError, jsonError, unauthorized } from '@/lib/server/responses'

const AiImageSchema = z.object({
  mode: z.enum(['cover', 'inline', 'chat']),
  articleRemoteId: z.string().optional(),
  title: z.string().optional(),
  plainText: z.string().default(''),
  selectionText: z.string().optional(),
  style: z.enum(['realistic', 'illustration', 'flat', 'tech', 'xiaohongshu']).optional(),
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

    const parsed = AiImageSchema.safeParse(await safeJson(request))
    if (!parsed.success) return jsonError('AI 图片请求参数格式不正确')
    if (parsed.data.mode === 'chat' && !parsed.data.userPrompt?.trim()) {
      return jsonError('请输入图片生成需求')
    }

    if (parsed.data.articleRemoteId) {
      const access = await requireArticleRole(user.id, parsed.data.articleRemoteId, 'VIEWER')
      if (!access) return jsonError('文章不存在或无权使用 AI 图片', 403)
    }

    const prompt = buildAiImagePrompt(parsed.data)
    const response = await generateArkImages(prompt)

    return NextResponse.json({
      images: response.images,
      usage: response.usage ?? null,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('ARK_API_KEY')) {
      return jsonError(error.message, 503)
    }
    if (error instanceof Error && error.message.startsWith('火山方舟')) {
      return jsonError(error.message, 502)
    }
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
