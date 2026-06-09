interface ArkImageData {
  b64_json?: string
  url?: string
  revised_prompt?: string
  prompt?: string
}

interface ArkImageResponse {
  data?: ArkImageData[]
  usage?: unknown
  error?: {
    message?: string
    type?: string
  }
}

export interface ArkGeneratedImage {
  dataUrl: string
  mimeType: string
  prompt: string
  provider: string
  model: string
}

export async function generateArkImages(prompt: string): Promise<{ images: ArkGeneratedImage[]; usage?: unknown }> {
  const apiKey = process.env.ARK_API_KEY
  if (!apiKey) {
    throw new Error('火山方舟 API Key 未配置：请设置 ARK_API_KEY')
  }

  const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const model = process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        response_format: 'b64_json',
        output_format: 'png',
        size: '2K',
        watermark: false,
        n: 1,
      }),
    })

    const data = await safeJson(response)
    if (!response.ok) {
      const message = data?.error?.message || `火山方舟生图请求失败：${response.status}`
      throw new Error(message.startsWith('火山方舟') ? message : `火山方舟生图请求失败：${message}`)
    }

    const images = await normalizeImages(data?.data, prompt, model, controller.signal)
    if (!images.length) throw new Error('火山方舟未返回有效图片')

    return {
      images,
      usage: data?.usage,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('火山方舟生图请求超时，请稍后重试')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function normalizeImages(items: ArkImageData[] | undefined, prompt: string, model: string, signal: AbortSignal): Promise<ArkGeneratedImage[]> {
  const images: ArkGeneratedImage[] = []
  for (const item of items ?? []) {
    let dataUrl = normalizeDataUrl(item.b64_json, 'image/png')
    if (!dataUrl && item.url) {
      dataUrl = await dataUrlFromUrl(item.url, signal)
    }
    if (!dataUrl) continue

    images.push({
      dataUrl,
      mimeType: mimeTypeFromDataUrl(dataUrl),
      prompt: item.revised_prompt || item.prompt || prompt,
      provider: 'volcengine-ark',
      model,
    })
  }
  return images
}

function normalizeDataUrl(value: string | undefined, mimeType: string): string | null {
  if (!value) return null
  if (value.startsWith('data:image/')) return value
  return `data:${mimeType};base64,${value.replace(/\s/g, '')}`
}

async function dataUrlFromUrl(url: string, signal: AbortSignal): Promise<string | null> {
  if (url.startsWith('data:image/')) return url

  const response = await fetch(url, { signal })
  if (!response.ok) return null

  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/png'
  const buffer = Buffer.from(await response.arrayBuffer())
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function mimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/)
  return match?.[1] || 'image/png'
}

async function safeJson(response: Response): Promise<ArkImageResponse | null> {
  try {
    return await response.json() as ArkImageResponse
  } catch {
    return null
  }
}
