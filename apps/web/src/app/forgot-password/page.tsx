'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

export default function ForgotPasswordPage() {
  const forgotPassword = useAuthStore(state => state.forgotPassword)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--fg-primary)]">找回密码</h1>
        <p className="mt-1 mb-6 text-sm text-[var(--fg-tertiary)]">如果邮箱存在，我们会发送一封重置邮件。</p>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-green-600">重置链接已发送，请检查邮箱。开发环境会同时在服务端日志打印链接。</p>
            <Link href="/login" className="block text-sm text-[var(--accent)] hover:underline">返回登录</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-[var(--fg-secondary)]">邮箱</span>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              发送重置链接
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
