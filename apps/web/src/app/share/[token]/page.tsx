'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowRight, Loader2, LogIn, Share2 } from 'lucide-react'
import { acceptShareLink, getSharePreview, type CollaborationRole } from '@/lib/collaboration-api'
import { useAuthStore } from '@/stores/auth'

interface SharePreview {
  role: CollaborationRole
  expiresAt?: number | null
  article: {
    remoteId: string
    title: string
    ownerName: string
  }
}

export default function SharePage() {
  const params = useParams()
  const router = useRouter()
  const token = String(params.token || '')
  const { user, status, init } = useAuthStore()
  const [preview, setPreview] = useState<SharePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    getSharePreview(token)
      .then(data => setPreview(data.share))
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [token])

  async function handleAccept() {
    setAccepting(true)
    setError('')
    try {
      const localId = await acceptShareLink(token)
      router.replace(`/editor/${localId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <Share2 size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">文章分享</h1>
            <p className="text-sm text-gray-400">XEgineer 协作邀请</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
            <Loader2 size={15} className="animate-spin" />
            加载中
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <div className="text-sm text-gray-400">文章</div>
              <div className="mt-1 font-medium text-gray-900">{preview.article.title || '无标题文章'}</div>
              <div className="mt-2 text-xs text-gray-400">Owner：{preview.article.ownerName}</div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-sm">
              <span className="text-gray-500">邀请权限</span>
              <span className="font-medium text-[var(--accent-text)]">{preview.role}</span>
            </div>
            {preview.expiresAt && (
              <div className="text-xs text-gray-400">
                有效期至 {new Date(preview.expiresAt).toLocaleString('zh-CN', { hour12: false })}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error || '分享链接无效'}
          </div>
        )}

        {error && preview && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {status === 'guest' || !user ? (
            <button
              type="button"
              onClick={() => router.push(`/login?next=/share/${token}`)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm text-white hover:bg-[var(--accent-hover)]"
            >
              <LogIn size={15} />
              登录后接受
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleAccept()}
              disabled={!preview || accepting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {accepting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              接受并打开
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
