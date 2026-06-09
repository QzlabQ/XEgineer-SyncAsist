import { apiFetch } from './api-client'

export type AiWriteMode = 'rewrite' | 'summary' | 'titles' | 'tags' | 'continue' | 'expand' | 'shorten' | 'chat'
export type AiTone = 'professional' | 'casual' | 'xiaohongshu'
export type AiImageMode = 'cover' | 'inline' | 'chat'
export type AiImageStyle = 'realistic' | 'illustration' | 'flat' | 'tech' | 'xiaohongshu'

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiWriteRequest {
  mode: AiWriteMode
  articleRemoteId?: string
  title: string
  plainText: string
  selectionText?: string
  tone?: AiTone
  userPrompt?: string
  messages?: AiChatMessage[]
}

export type AiWriteResult =
  | string
  | { titles: string[] }
  | { tags: string[] }

export async function requestAiWrite(input: AiWriteRequest) {
  return apiFetch<{ result: AiWriteResult; usage?: unknown }>('/api/ai/write', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface AiImageRequest {
  mode: AiImageMode
  articleRemoteId?: string
  title: string
  plainText: string
  selectionText?: string
  style?: AiImageStyle
  userPrompt?: string
  messages?: AiChatMessage[]
}

export interface AiImageResult {
  dataUrl: string
  mimeType: string
  prompt: string
  provider: string
  model: string
}

export async function requestAiImage(input: AiImageRequest) {
  return apiFetch<{ images: AiImageResult[]; usage?: unknown }>('/api/ai/image', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
