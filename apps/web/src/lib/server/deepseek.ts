type DeepSeekRole = 'system' | 'user' | 'assistant'

export interface DeepSeekMessage {
  role: DeepSeekRole
  content: string
}

interface DeepSeekChoice {
  message?: {
    content?: string
  }
}

interface DeepSeekResponse {
  choices?: DeepSeekChoice[]
  usage?: unknown
  error?: {
    message?: string
    type?: string
  }
}

export async function callDeepSeek(messages: DeepSeekMessage[], options: { json?: boolean } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('DeepSeek API Key 未配置：请设置 DEEPSEEK_API_KEY')
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })

    const data = await safeJson(response)
    if (!response.ok) {
      const message = data?.error?.message || `DeepSeek 请求失败：${response.status}`
      throw new Error(message)
    }

    const content = data?.choices?.[0]?.message?.content
    if (!content) throw new Error('DeepSeek 未返回有效内容')

    return {
      content,
      usage: data.usage,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('DeepSeek 请求超时，请稍后重试')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function safeJson(response: Response): Promise<DeepSeekResponse | null> {
  try {
    return await response.json() as DeepSeekResponse
  } catch {
    return null
  }
}
