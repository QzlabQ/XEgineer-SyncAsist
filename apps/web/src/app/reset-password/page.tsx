'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FormEvent, Suspense, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { InlineSpinner } from '@/components/ui/inline-spinner'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--bg-app)]" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const params = useSearchParams()
  const resetPassword = useAuthStore(state => state.resetPassword)
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--fg-primary)]">重置密码</h1>
        <p className="mt-1 mb-6 text-sm text-[var(--fg-tertiary)]">请输入至少 8 位新密码。</p>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-green-600">密码已更新，请重新登录。</p>
            <Link href="/login" className="block text-sm text-[var(--accent)] hover:underline">去登录</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              minLength={8}
              className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
              required
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading || !token}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? <InlineSpinner size={15} /> : <KeyRound size={15} />}
              更新密码
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
