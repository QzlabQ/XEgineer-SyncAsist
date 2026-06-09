'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useArticleStore } from '@/stores/article'

export default function RegisterPage() {
  const router = useRouter()
  const register = useAuthStore(state => state.register)
  const syncWithCloud = useArticleStore(state => state.syncWithCloud)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await register({ name, email, password })
      await syncWithCloud()
      router.push('/articles')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--fg-primary)]">注册 XEgineer</h1>
        <p className="mt-1 mb-6 text-sm text-[var(--fg-tertiary)]">创建账号后会自动上传本地文章。</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthInput label="昵称" type="text" value={name} onChange={setName} required={false} />
          <AuthInput label="邮箱" type="email" value={email} onChange={setEmail} />
          <AuthInput label="密码" type="password" value={password} onChange={setPassword} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            注册并同步
          </button>
        </form>
        <p className="mt-4 text-sm text-[var(--fg-tertiary)]">
          已有账号？<Link href="/login" className="text-[var(--accent)] hover:underline">去登录</Link>
        </p>
      </div>
    </main>
  )
}

function AuthInput({ label, type, value, onChange, required = true }: { label: string; type: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm text-[var(--fg-secondary)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
        required={required}
        minLength={type === 'password' ? 8 : undefined}
      />
    </label>
  )
}
