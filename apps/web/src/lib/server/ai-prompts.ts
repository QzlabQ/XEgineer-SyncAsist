import type { DeepSeekMessage } from './deepseek'

export type AiWriteMode = 'rewrite' | 'summary' | 'titles' | 'tags' | 'continue' | 'expand' | 'shorten' | 'chat'
export type AiTone = 'professional' | 'casual' | 'xiaohongshu'

export interface AiPromptInput {
  mode: AiWriteMode
  title?: string
  plainText: string
  selectionText?: string
  tone?: AiTone
  userPrompt?: string
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
}

const SYSTEM_PROMPT = [
  '你是 XEgineer 的中文内容编辑助手。',
  '你帮助内容创作者完成多平台发布前的写作优化。',
  '必须保留用户提供的事实，不编造数据、引用、链接、平台政策或不存在的经历。',
  '除非用户明确要求，不要解释你的处理过程。',
  '输出使用中文，保持清晰、自然、可直接用于文章。',
].join('\n')

const MAX_CONTEXT_CHARS = 12000
const MAX_SELECTION_CHARS = 6000
const MAX_CHAT_MESSAGES = 8

export function buildAiMessages(input: AiPromptInput): { messages: DeepSeekMessage[]; json: boolean } {
  const target = truncate(input.selectionText?.trim() || input.plainText.trim(), MAX_SELECTION_CHARS)
  const article = truncate(input.plainText.trim(), MAX_CONTEXT_CHARS)
  const title = input.title?.trim() || '无标题文章'

  if (input.mode === 'chat') {
    return {
      json: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `当前文章标题：${title}`,
            `当前文章正文：\n${article || '（暂无正文）'}`,
            '接下来用户会基于这篇文章与你对话。',
          ].join('\n\n'),
        },
        ...sanitizeChatMessages(input.messages),
        { role: 'user', content: input.userPrompt?.trim() || '请给出写作建议。' },
      ],
    }
  }

  const taskPrompt = buildTaskPrompt(input.mode, target, title, input.tone)
  return {
    json: input.mode === 'titles' || input.mode === 'tags',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `当前文章标题：${title}`,
          `当前文章全文上下文：\n${article || '（暂无正文）'}`,
          `本次处理文本：\n${target || article || '（暂无正文）'}`,
          taskPrompt,
        ].join('\n\n'),
      },
    ],
  }
}

function buildTaskPrompt(mode: Exclude<AiWriteMode, 'chat'>, target: string, title: string, tone?: AiTone): string {
  switch (mode) {
    case 'rewrite':
      return `请将“本次处理文本”一键改写为${toneLabel(tone)}风格。保持事实和核心结构，不添加解释，只输出改写后的正文。`
    case 'summary':
      return '请为当前文章生成 120 字以内摘要，适合多平台发布。只输出摘要文本。'
    case 'titles':
      return `请基于标题“${title}”和文章内容生成 3-5 个中文标题候选。返回严格 JSON：{"titles":["标题1","标题2"]}。标题要清晰、有吸引力，但不要夸张或虚构。`
    case 'tags':
      return '请基于文章内容推荐 3-8 个中文标签。返回严格 JSON：{"tags":["标签1","标签2"]}。标签应简短，不带 #。'
    case 'continue':
      return '请顺着“本次处理文本”和全文上下文继续写 1-3 段，保持原文语气和结构。只输出续写正文。'
    case 'expand':
      return '请扩写“本次处理文本”，补充论述、例子和过渡，但不要编造事实。只输出扩写后的正文。'
    case 'shorten':
      return '请缩写“本次处理文本”，保留核心信息，让表达更紧凑。只输出缩写后的正文。'
  }
}

function toneLabel(tone: AiTone | undefined): string {
  if (tone === 'casual') return '轻松自然'
  if (tone === 'xiaohongshu') return '小红书种草'
  return '专业清晰'
}

function sanitizeChatMessages(messages: AiPromptInput['messages']): DeepSeekMessage[] {
  return (messages ?? [])
    .slice(-MAX_CHAT_MESSAGES)
    .filter(message => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
    .map(message => ({
      role: message.role,
      content: truncate(message.content.trim(), 2000),
    }))
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n\n（内容已截断）`
}
