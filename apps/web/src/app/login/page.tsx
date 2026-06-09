'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, Suspense, useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useArticleStore } from '@/stores/article'

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell title="登录 XEgineer" subtitle="登录后自动同步本地文章到云端">加载中...</AuthShell>}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const login = useAuthStore(state => state.login)
  const syncWithCloud = useArticleStore(state => state.syncWithCloud)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email, password)
      await syncWithCloud()
      router.push(searchParams.get('next') || '/articles')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="登录 XEgineer" subtitle="登录后自动同步本地文章到云端">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput label="邮箱" type="email" value={email} onChange={setEmail} />
        <AuthInput label="密码" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
          登录
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/register" className="text-blue-600 hover:underline">注册账号</Link>
        <Link href="/forgot-password" className="text-gray-500 hover:text-blue-600">忘记密码</Link>
      </div>
    </AuthShell>
  )
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-gray-500">{subtitle}</p>
        {children}
      </div>
    </main>
  )
}

function AuthInput({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        required
      />
    </label>
  )
}
