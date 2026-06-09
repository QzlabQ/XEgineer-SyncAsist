export type AiImageMode = 'cover' | 'inline' | 'chat'
export type AiImageStyle = 'realistic' | 'illustration' | 'flat' | 'tech' | 'xiaohongshu'

export interface AiImagePromptInput {
  mode: AiImageMode
  title?: string
  plainText: string
  selectionText?: string
  style?: AiImageStyle
  userPrompt?: string
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
}

const MAX_ARTICLE_CHARS = 5000
const MAX_SELECTION_CHARS = 2500
const MAX_CHAT_MESSAGES = 6

export function buildAiImagePrompt(input: AiImagePromptInput): string {
  const title = input.title?.trim() || '无标题文章'
  const article = truncate(input.plainText.trim(), MAX_ARTICLE_CHARS)
  const selection = truncate(input.selectionText?.trim() || '', MAX_SELECTION_CHARS)
  const style = styleInstruction(input.style)

  if (input.mode === 'chat') {
    return [
      '请根据用户需求生成一张适合文章发布使用的图片。',
      style,
      '画面中不要出现文字、logo、水印、二维码、平台标识或可读字符。',
      '只生成一张完整图片，不要拼图，不要分镜。',
      `文章标题：${title}`,
      `文章正文上下文：${article || '暂无正文'}`,
      chatHistory(input.messages),
      `用户本轮需求：${input.userPrompt?.trim() || '请基于当前文章生成一张配图。'}`,
    ].filter(Boolean).join('\n\n')
  }

  if (input.mode === 'cover') {
    return [
      '请生成一张 16:9 横向文章封面图，适合知乎、B站专栏、公众号等多平台发布。',
      '画面要有明确主题、干净构图和标题留白区域，但图片里不要出现任何文字。',
      '不要生成 logo、水印、二维码、边框或平台 UI。',
      style,
      `文章标题：${title}`,
      `文章正文摘要：${article || '暂无正文'}`,
      '输出应像可直接作为封面的高质量成图。',
    ].join('\n\n')
  }

  return [
    '请生成一张适合作为正文插图的图片，服务于文章段落理解。',
    '如果文本偏知识解释，生成清晰的概念插图；如果文本偏叙事，生成氛围图。',
    '画面中不要出现文字、logo、水印、二维码、平台标识或可读字符。',
    style,
    `文章标题：${title}`,
    `本次重点文本：${selection || article || '暂无正文'}`,
    `全文上下文：${article || '暂无正文'}`,
  ].join('\n\n')
}

function styleInstruction(style: AiImageStyle | undefined): string {
  switch (style) {
    case 'realistic':
      return '视觉风格：真实摄影感，光线自然，细节可信，避免夸张和过度修饰。'
    case 'illustration':
      return '视觉风格：精致商业插画，色彩和谐，细节丰富，适合内容封面与配图。'
    case 'flat':
      return '视觉风格：扁平矢量插画，结构清楚，色块干净，适合解释概念。'
    case 'tech':
      return '视觉风格：现代科技感，清爽明亮，适度使用蓝绿色点缀，避免暗沉赛博风。'
    case 'xiaohongshu':
      return '视觉风格：小红书图文封面感，明亮、轻快、生活化，色彩有吸引力但不过度花哨。'
    default:
      return '视觉风格：精致商业插画，色彩和谐，构图清晰，适合多平台内容发布。'
  }
}

function chatHistory(messages: AiImagePromptInput['messages']): string {
  const history = (messages ?? [])
    .slice(-MAX_CHAT_MESSAGES)
    .filter(message => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${truncate(message.content.trim(), 800)}`)

  return history.length ? `近期图片对话：\n${history.join('\n')}` : ''
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n\n（内容已截断）`
}
