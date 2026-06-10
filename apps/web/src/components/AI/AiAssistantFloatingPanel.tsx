'use client'

import { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Bot, Check, Clipboard, Download, FileText, Hash, Heading, Image as ImageIcon, ImagePlus,
  MessageSquare, Minimize2, Paintbrush, PenLine, Plus, Send, Sparkles, Wand2,
} from 'lucide-react'
import { DotmSquare3 } from '@/components/ui/dotm-square-3'
import { InlineSpinner } from '@/components/ui/inline-spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ArticleRecord } from '@/lib/db'
import {
  requestAiImage,
  requestAiWrite,
  type AiChatMessage,
  type AiImageMode,
  type AiImageResult,
  type AiImageStyle,
  type AiTone,
  type AiWriteMode,
  type AiWriteResult,
} from '@/lib/ai-client'
import { plainTextFromTiptapJSON, textToTiptapContent, textToTiptapDoc, type TextSelectionSnapshot } from '@/lib/tiptap-text'

type PanelTab = 'write' | 'image'
type WriteResultKind = 'text' | 'summary' | 'titles' | 'tags' | 'chat'

interface AiAssistantFloatingPanelProps {
  article: ArticleRecord
  editor: Editor | null
  selection: TextSelectionSnapshot | null
  canEdit: boolean
  onTitleApply: (title: string) => void
  onMetaApply: (patch: Partial<Pick<ArticleRecord, 'cover' | 'summary' | 'tags'>>) => void
  onPlatformMetaApply: (patch: Partial<Pick<ArticleRecord, 'cover' | 'summary' | 'tags'>>) => Promise<void>
}

interface PendingWriteResult {
  kind: WriteResultKind
  mode: AiWriteMode
  result: AiWriteResult
}

interface PendingImageResult {
  mode: AiImageMode
  image: AiImageResult
}

const WRITE_ACTIONS: Array<{ mode: Exclude<AiWriteMode, 'chat'>; label: string; icon: React.ReactNode }> = [
  { mode: 'titles', label: '标题', icon: <Heading size={14} /> },
  { mode: 'summary', label: '摘要', icon: <FileText size={14} /> },
  { mode: 'tags', label: '标签', icon: <Hash size={14} /> },
  { mode: 'rewrite', label: '改写', icon: <Wand2 size={14} /> },
  { mode: 'continue', label: '续写', icon: <Plus size={14} /> },
  { mode: 'expand', label: '扩写', icon: <PenLine size={14} /> },
  { mode: 'shorten', label: '缩写', icon: <Minimize2 size={14} /> },
]

const IMAGE_ACTIONS: Array<{ mode: Exclude<AiImageMode, 'chat'>; label: string; icon: React.ReactNode }> = [
  { mode: 'cover', label: '封面图', icon: <ImageIcon size={14} /> },
  { mode: 'inline', label: '正文配图', icon: <ImagePlus size={14} /> },
]

export function AiAssistantFloatingPanel({
  article,
  editor,
  selection,
  canEdit,
  onTitleApply,
  onMetaApply,
  onPlatformMetaApply,
}: AiAssistantFloatingPanelProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PanelTab>('write')

  const [tone, setTone] = useState<AiTone>('professional')
  const [writeLoadingMode, setWriteLoadingMode] = useState<AiWriteMode | null>(null)
  const [writeError, setWriteError] = useState('')
  const [writePending, setWritePending] = useState<PendingWriteResult | null>(null)
  const [writeCopied, setWriteCopied] = useState(false)
  const [writeChatInput, setWriteChatInput] = useState('')
  const [writeMessages, setWriteMessages] = useState<AiChatMessage[]>([])

  const [imageStyle, setImageStyle] = useState<AiImageStyle>('illustration')
  const [imageLoadingMode, setImageLoadingMode] = useState<AiImageMode | null>(null)
  const [imageError, setImageError] = useState('')
  const [imagePending, setImagePending] = useState<PendingImageResult | null>(null)
  const [imagePromptCopied, setImagePromptCopied] = useState(false)
  const [imageChatInput, setImageChatInput] = useState('')
  const [imageMessages, setImageMessages] = useState<AiChatMessage[]>([])

  const plainText = useMemo(() => plainTextFromTiptapJSON(article.tiptapJSON), [article.tiptapJSON])
  const targetLabel = selection?.text ? '选区' : '全文'
  const writeResultText = writePending ? stringifyWriteResult(writePending.result) : ''

  async function runWriteAction(mode: Exclude<AiWriteMode, 'chat'>) {
    setWriteLoadingMode(mode)
    setWriteError('')
    try {
      const response = await requestAiWrite({
        mode,
        articleRemoteId: article.remoteId,
        title: article.title,
        plainText,
        selectionText: selection?.text,
        tone,
      })
      setWritePending({ kind: writeKindFromMode(mode), mode, result: response.result })
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err))
    } finally {
      setWriteLoadingMode(null)
    }
  }

  async function sendWriteChat() {
    const content = writeChatInput.trim()
    if (!content) return
    const nextMessages = [...writeMessages, { role: 'user' as const, content }]
    setWriteMessages(nextMessages)
    setWriteChatInput('')
    setWriteLoadingMode('chat')
    setWriteError('')
    try {
      const response = await requestAiWrite({
        mode: 'chat',
        articleRemoteId: article.remoteId,
        title: article.title,
        plainText,
        selectionText: selection?.text,
        userPrompt: content,
        messages: writeMessages,
      })
      const answer = stringifyWriteResult(response.result)
      setWriteMessages([...nextMessages, { role: 'assistant', content: answer }])
      setWritePending({ kind: 'chat', mode: 'chat', result: answer })
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err))
    } finally {
      setWriteLoadingMode(null)
    }
  }

  async function runImageAction(mode: Exclude<AiImageMode, 'chat'>) {
    setImageLoadingMode(mode)
    setImageError('')
    try {
      const response = await requestAiImage({
        mode,
        articleRemoteId: article.remoteId,
        title: article.title,
        plainText,
        selectionText: selection?.text,
        style: imageStyle,
      })
      const image = response.images[0]
      if (!image) throw new Error('未生成图片')
      setImagePending({ mode, image })
    } catch (err) {
      setImageError(err instanceof Error ? err.message : String(err))
    } finally {
      setImageLoadingMode(null)
    }
  }

  async function sendImageChat() {
    const content = imageChatInput.trim()
    if (!content) return
    const nextMessages = [...imageMessages, { role: 'user' as const, content }]
    setImageMessages(nextMessages)
    setImageChatInput('')
    setImageLoadingMode('chat')
    setImageError('')
    try {
      const response = await requestAiImage({
        mode: 'chat',
        articleRemoteId: article.remoteId,
        title: article.title,
        plainText,
        selectionText: selection?.text,
        style: imageStyle,
        userPrompt: content,
        messages: imageMessages,
      })
      const image = response.images[0]
      if (!image) throw new Error('未生成图片')
      setImageMessages([...nextMessages, { role: 'assistant', content: '已生成图片，可在上方预览。' }])
      setImagePending({ mode: 'chat', image })
    } catch (err) {
      setImageError(err instanceof Error ? err.message : String(err))
    } finally {
      setImageLoadingMode(null)
    }
  }

  function applyTextResult(text: string) {
    if (!editor || !canEdit) return

    if (writePending?.mode === 'continue') {
      const pos = selection?.to ?? editor.state.selection.to ?? editor.state.doc.content.size
      editor.chain().focus().setTextSelection(pos).insertContent(textToTiptapContent(text)).run()
      return
    }

    if (selection) {
      editor.chain().focus().setTextSelection({ from: selection.from, to: selection.to }).deleteSelection().insertContent(textToTiptapContent(text)).run()
      return
    }

    editor.commands.setContent(textToTiptapDoc(text), true)
  }

  function insertImageResult(image: AiImageResult) {
    if (!editor || !canEdit) return
    const pos = editor.state.selection.to ?? editor.state.doc.content.size
    editor.chain().focus().setTextSelection(pos).insertContent({ type: 'image', attrs: { src: image.dataUrl } }).run()
  }

  async function applyMetaPatch(
    patch: Partial<Pick<ArticleRecord, 'cover' | 'summary' | 'tags'>>,
    errorTarget: PanelTab
  ) {
    if (!canEdit) return
    onMetaApply(patch)
    try {
      await onPlatformMetaApply(patch)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (errorTarget === 'image') setImageError(message)
      else setWriteError(message)
    }
  }

  async function copyWriteResult(value: string) {
    await navigator.clipboard?.writeText(value)
    setWriteCopied(true)
    window.setTimeout(() => setWriteCopied(false), 1200)
  }

  async function copyImagePrompt(value: string) {
    await navigator.clipboard?.writeText(value)
    setImagePromptCopied(true)
    window.setTimeout(() => setImagePromptCopied(false), 1200)
  }

  function downloadImage(image: AiImageResult) {
    const link = document.createElement('a')
    link.href = image.dataUrl
    link.download = `xegineer-ai-image-${Date.now()}.${imageExtension(image.mimeType)}`
    link.click()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[80] inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg hover:bg-[var(--accent-hover)]"
        title="AI 助手"
      >
        <Sparkles size={20} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-[80] w-[25rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <Bot size={17} />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">AI 助手</div>
            <div className="text-[11px] text-gray-400">{tab === 'write' ? `${targetLabel} · DeepSeek` : `${targetLabel} · Seedream`}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          title="隐藏"
        >
          <Minimize2 size={15} />
        </button>
      </div>

      <div className="max-h-[75vh] overflow-y-auto p-4">
        <div className="mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-xs">
          <button
            type="button"
            onClick={() => setTab('write')}
            className={`h-8 rounded-md ${tab === 'write' ? 'bg-white text-[var(--accent-text)] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            写作
          </button>
          <button
            type="button"
            onClick={() => setTab('image')}
            className={`h-8 rounded-md ${tab === 'image' ? 'bg-white text-[var(--accent-text)] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            图片
          </button>
        </div>

        {tab === 'write' ? (
          <>
            {writeError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {writeError}
              </div>
            )}

            <div className="mb-3 flex items-center gap-2">
              <Select value={tone} onValueChange={v => setTone(v as AiTone)}>
                <SelectTrigger className="h-auto w-auto min-w-[5rem] py-1.5 px-2.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">专业</SelectItem>
                  <SelectItem value="casual">轻松</SelectItem>
                  <SelectItem value="xiaohongshu">小红书</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-[var(--fg-tertiary)]">{selection?.text ? `${selection.text.length} 字选区` : `${plainText.length} 字全文`}</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {WRITE_ACTIONS.map(action => (
                <button
                  key={action.mode}
                  type="button"
                  onClick={() => void runWriteAction(action.mode)}
                  disabled={Boolean(writeLoadingMode)}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:border-[var(--accent)]/20 hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)] disabled:opacity-50"
                >
                  {writeLoadingMode === action.mode ? <InlineSpinner size={14} /> : action.icon}
                  {action.label}
                </button>
              ))}
            </div>

            {writePending && (
              <section className="mt-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                  <span className="text-xs font-medium text-gray-500">结果预览</span>
                  <button
                    type="button"
                    onClick={() => void copyWriteResult(writeResultText)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    title="复制"
                  >
                    {writeCopied ? <Check size={13} /> : <Clipboard size={13} />}
                    {writeCopied ? '已复制' : '复制'}
                  </button>
                </div>
                <div className="max-h-52 overflow-auto px-3 py-3 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
                  {renderWriteResult(writePending.result, writePending.kind, {
                    canEdit,
                    onTitleApply,
                    onMetaApply: patch => void applyMetaPatch(patch, 'write'),
                  })}
                </div>
                {(writePending.kind === 'text' || writePending.kind === 'chat') && (
                  <div className="border-t border-gray-100 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => applyTextResult(writeResultText)}
                      disabled={!canEdit || !writeResultText}
                      className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    >
                      {writePending.mode === 'continue' ? '插入正文' : selection ? '替换选区' : '替换全文'}
                    </button>
                  </div>
                )}
              </section>
            )}

            <ChatBox
              messages={writeMessages}
              input={writeChatInput}
              setInput={setWriteChatInput}
              loading={writeLoadingMode === 'chat'}
              disabled={Boolean(writeLoadingMode)}
              placeholder="问问这篇文章..."
              onSend={() => void sendWriteChat()}
            />
          </>
        ) : (
          <>
            {imageError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {imageError}
              </div>
            )}

            <div className="mb-3 flex items-center gap-2">
              <Paintbrush size={14} className="text-[var(--fg-tertiary)]" />
              <Select value={imageStyle} onValueChange={v => setImageStyle(v as AiImageStyle)}>
                <SelectTrigger className="h-auto min-w-0 flex-1 py-1.5 px-2.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="illustration">商业插画</SelectItem>
                  <SelectItem value="realistic">真实摄影</SelectItem>
                  <SelectItem value="flat">扁平矢量</SelectItem>
                  <SelectItem value="tech">科技感</SelectItem>
                  <SelectItem value="xiaohongshu">小红书</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-400">{selection?.text ? `${selection.text.length} 字选区` : `${plainText.length} 字全文`}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {IMAGE_ACTIONS.map(action => (
                <button
                  key={action.mode}
                  type="button"
                  onClick={() => void runImageAction(action.mode)}
                  disabled={Boolean(imageLoadingMode)}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:border-[var(--accent)]/20 hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)] disabled:opacity-50"
                >
                  {imageLoadingMode === action.mode ? <InlineSpinner size={14} /> : action.icon}
                  {action.label}
                </button>
              ))}
            </div>

            {imagePending && (
              <section className="mt-4 overflow-hidden rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                  <span className="text-xs font-medium text-gray-500">图片预览</span>
                  <span className="text-[11px] text-gray-400">{imagePending.image.model}</span>
                </div>
                <div className="bg-gray-50 p-3">
                  <img
                    src={imagePending.image.dataUrl}
                    alt="AI 生成图片"
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void applyMetaPatch({ cover: imagePending.image.dataUrl }, 'image')}
                    disabled={!canEdit}
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    设为封面
                  </button>
                  <button
                    type="button"
                    onClick={() => insertImageResult(imagePending.image)}
                    disabled={!canEdit || !editor}
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    插入正文
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyImagePrompt(imagePending.image.prompt)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    {imagePromptCopied ? <Check size={13} /> : <Clipboard size={13} />}
                    {imagePromptCopied ? '已复制' : '复制提示词'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadImage(imagePending.image)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    <Download size={13} />
                    下载图片
                  </button>
                </div>
                <div className="max-h-24 overflow-auto border-t border-gray-100 px-3 py-2 text-[11px] leading-5 text-gray-400">
                  {imagePending.image.prompt}
                </div>
              </section>
            )}

            <ChatBox
              messages={imageMessages}
              input={imageChatInput}
              setInput={setImageChatInput}
              loading={imageLoadingMode === 'chat'}
              disabled={Boolean(imageLoadingMode)}
              placeholder="描述你想生成的图片..."
              onSend={() => void sendImageChat()}
            />
          </>
        )}
      </div>
    </div>
  )
}

function ChatBox({
  messages,
  input,
  setInput,
  loading,
  disabled,
  placeholder,
  onSend,
}: {
  messages: AiChatMessage[]
  input: string
  setInput: (value: string) => void
  loading: boolean
  disabled: boolean
  placeholder: string
  onSend: () => void
}) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
        <MessageSquare size={13} />
        对话
      </div>
      <div className="mb-2 max-h-44 space-y-2 overflow-auto rounded-lg bg-gray-50 p-2">
        {messages.length === 0 && <div className="px-1 py-4 text-center text-xs text-gray-400">暂无对话</div>}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-lg px-2.5 py-2 text-xs leading-5 ${
              message.role === 'user' ? 'ml-8 bg-[var(--accent)] text-white' : 'mr-8 bg-white text-gray-700 border border-gray-200'
            }`}
          >
            {message.content}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              onSend()
            }
          }}
          rows={2}
          placeholder={placeholder}
          className="min-w-0 flex-1 resize-none rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all duration-[120ms] ease-out hover:border-[var(--border-hover)] placeholder:text-[var(--fg-tertiary)]"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !input.trim()}
          className="inline-flex w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          title="发送"
        >
          {loading ? <InlineSpinner size={15} /> : <Send size={15} />}
        </button>
      </div>
      {loading && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <DotmSquare3 size={28} />
          <span className="text-xs text-gray-400">AI 正在思考...</span>
        </div>
      )}
    </section>
  )
}

function writeKindFromMode(mode: AiWriteMode): WriteResultKind {
  if (mode === 'summary') return 'summary'
  if (mode === 'titles') return 'titles'
  if (mode === 'tags') return 'tags'
  return 'text'
}

function stringifyWriteResult(result: AiWriteResult): string {
  if (typeof result === 'string') return result
  if ('titles' in result) return result.titles.join('\n')
  return result.tags.join('、')
}

function renderWriteResult(
  result: AiWriteResult,
  kind: WriteResultKind,
  handlers: {
    canEdit: boolean
    onTitleApply: (title: string) => void
    onMetaApply: (patch: Partial<Pick<ArticleRecord, 'summary' | 'tags'>>) => void
  }
) {
  if (typeof result === 'string') {
    if (kind === 'summary') {
      return (
        <div className="space-y-3">
          <p>{result}</p>
          <button
            type="button"
            onClick={() => handlers.onMetaApply({ summary: result })}
            disabled={!handlers.canEdit}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            应用摘要
          </button>
        </div>
      )
    }
    return result
  }

  if ('titles' in result) {
    return (
      <div className="space-y-2">
        {result.titles.length === 0 && <span className="text-gray-400">未生成标题</span>}
        {result.titles.map(title => (
          <button
            key={title}
            type="button"
            onClick={() => handlers.onTitleApply(title)}
            disabled={!handlers.canEdit}
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-[var(--accent)]/20 hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            {title}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {result.tags.length === 0 && <span className="text-gray-400">未生成标签</span>}
        {result.tags.map(tag => (
          <span key={tag} className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent-text)]">{tag}</span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => handlers.onMetaApply({ tags: result.tags })}
        disabled={!handlers.canEdit || result.tags.length === 0}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        应用标签
      </button>
    </div>
  )
}

function imageExtension(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  return 'png'
}
