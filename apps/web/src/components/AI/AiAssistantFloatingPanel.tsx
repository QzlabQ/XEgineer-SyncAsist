'use client'

import { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Bot, Check, Clipboard, FileText, Hash, Heading, Loader2, MessageSquare, Minimize2,
  PenLine, Plus, Send, Sparkles, Wand2,
} from 'lucide-react'
import type { ArticleRecord } from '@/lib/db'
import { requestAiWrite, type AiChatMessage, type AiTone, type AiWriteMode, type AiWriteResult } from '@/lib/ai-client'
import { plainTextFromTiptapJSON, textToTiptapContent, textToTiptapDoc, type TextSelectionSnapshot } from '@/lib/tiptap-text'

type ResultKind = 'text' | 'summary' | 'titles' | 'tags' | 'chat'

interface AiAssistantFloatingPanelProps {
  article: ArticleRecord
  editor: Editor | null
  selection: TextSelectionSnapshot | null
  canEdit: boolean
  onTitleApply: (title: string) => void
  onMetaApply: (patch: Partial<Pick<ArticleRecord, 'summary' | 'tags'>>) => void
}

interface PendingResult {
  kind: ResultKind
  mode: AiWriteMode
  result: AiWriteResult
}

const ACTIONS: Array<{ mode: Exclude<AiWriteMode, 'chat'>; label: string; icon: React.ReactNode }> = [
  { mode: 'titles', label: '标题', icon: <Heading size={14} /> },
  { mode: 'summary', label: '摘要', icon: <FileText size={14} /> },
  { mode: 'tags', label: '标签', icon: <Hash size={14} /> },
  { mode: 'rewrite', label: '改写', icon: <Wand2 size={14} /> },
  { mode: 'continue', label: '续写', icon: <Plus size={14} /> },
  { mode: 'expand', label: '扩写', icon: <PenLine size={14} /> },
  { mode: 'shorten', label: '缩写', icon: <Minimize2 size={14} /> },
]

export function AiAssistantFloatingPanel({
  article,
  editor,
  selection,
  canEdit,
  onTitleApply,
  onMetaApply,
}: AiAssistantFloatingPanelProps) {
  const [open, setOpen] = useState(false)
  const [tone, setTone] = useState<AiTone>('professional')
  const [loadingMode, setLoadingMode] = useState<AiWriteMode | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<PendingResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<AiChatMessage[]>([])

  const plainText = useMemo(() => plainTextFromTiptapJSON(article.tiptapJSON), [article.tiptapJSON])
  const targetLabel = selection?.text ? '选区' : '全文'

  async function runAction(mode: Exclude<AiWriteMode, 'chat'>) {
    setLoadingMode(mode)
    setError('')
    try {
      const response = await requestAiWrite({
        mode,
        articleRemoteId: article.remoteId,
        title: article.title,
        plainText,
        selectionText: selection?.text,
        tone,
      })
      setPending({ kind: kindFromMode(mode), mode, result: response.result })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingMode(null)
    }
  }

  async function sendChat() {
    const content = chatInput.trim()
    if (!content) return
    const nextMessages = [...messages, { role: 'user' as const, content }]
    setMessages(nextMessages)
    setChatInput('')
    setLoadingMode('chat')
    setError('')
    try {
      const response = await requestAiWrite({
        mode: 'chat',
        articleRemoteId: article.remoteId,
        title: article.title,
        plainText,
        selectionText: selection?.text,
        userPrompt: content,
        messages,
      })
      const answer = stringifyResult(response.result)
      setMessages([...nextMessages, { role: 'assistant', content: answer }])
      setPending({ kind: 'chat', mode: 'chat', result: answer })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingMode(null)
    }
  }

  function applyTextResult(text: string) {
    if (!editor || !canEdit) return

    if (pending?.mode === 'continue') {
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

  async function copyResult(value: string) {
    await navigator.clipboard?.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[80] inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
        title="AI 写作助手"
      >
        <Sparkles size={20} />
      </button>
    )
  }

  const resultText = pending ? stringifyResult(pending.result) : ''

  return (
    <div className="fixed bottom-6 right-6 z-[80] w-[25rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Bot size={17} />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">AI 写作</div>
            <div className="text-[11px] text-gray-400">{targetLabel} · DeepSeek</div>
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
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <select
            value={tone}
            onChange={event => setTone(event.target.value as AiTone)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
            title="改写风格"
          >
            <option value="professional">专业</option>
            <option value="casual">轻松</option>
            <option value="xiaohongshu">小红书</option>
          </select>
          <span className="text-xs text-gray-400">{selection?.text ? `${selection.text.length} 字选区` : `${plainText.length} 字全文`}</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {ACTIONS.map(action => (
            <button
              key={action.mode}
              type="button"
              onClick={() => void runAction(action.mode)}
              disabled={Boolean(loadingMode)}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
            >
              {loadingMode === action.mode ? <Loader2 size={14} className="animate-spin" /> : action.icon}
              {action.label}
            </button>
          ))}
        </div>

        {pending && (
          <section className="mt-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <span className="text-xs font-medium text-gray-500">结果预览</span>
              <button
                type="button"
                onClick={() => void copyResult(resultText)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                title="复制"
              >
                {copied ? <Check size={13} /> : <Clipboard size={13} />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <div className="max-h-52 overflow-auto px-3 py-3 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
              {renderResult(pending.result, pending.kind, {
                canEdit,
                onTitleApply,
                onMetaApply,
              })}
            </div>
            {(pending.kind === 'text' || pending.kind === 'chat') && (
              <div className="border-t border-gray-100 px-3 py-2">
                <button
                  type="button"
                  onClick={() => applyTextResult(resultText)}
                  disabled={!canEdit || !resultText}
                  className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {pending.mode === 'continue' ? '插入正文' : selection ? '替换选区' : '替换全文'}
                </button>
              </div>
            )}
          </section>
        )}

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
                  message.role === 'user' ? 'ml-8 bg-blue-600 text-white' : 'mr-8 bg-white text-gray-700 border border-gray-200'
                }`}
              >
                {message.content}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={chatInput}
              onChange={event => setChatInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void sendChat()
                }
              }}
              rows={2}
              placeholder="问问这篇文章..."
              className="min-w-0 flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() => void sendChat()}
              disabled={Boolean(loadingMode) || !chatInput.trim()}
              className="inline-flex w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              title="发送"
            >
              {loadingMode === 'chat' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function kindFromMode(mode: AiWriteMode): ResultKind {
  if (mode === 'summary') return 'summary'
  if (mode === 'titles') return 'titles'
  if (mode === 'tags') return 'tags'
  return 'text'
}

function stringifyResult(result: AiWriteResult): string {
  if (typeof result === 'string') return result
  if ('titles' in result) return result.titles.join('\n')
  return result.tags.join('、')
}

function renderResult(
  result: AiWriteResult,
  kind: ResultKind,
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
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
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
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50"
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
          <span key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{tag}</span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => handlers.onMetaApply({ tags: result.tags })}
        disabled={!handlers.canEdit || result.tags.length === 0}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
      >
        应用标签
      </button>
    </div>
  )
}
