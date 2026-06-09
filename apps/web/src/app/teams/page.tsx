'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Trash2, Users } from 'lucide-react'
import {
  addTeamMember,
  createTeam,
  listTeams,
  removeTeamMember,
  updateTeamMember,
  type CollaborationRole,
  type TeamRecord,
} from '@/lib/collaboration-api'
import { AccountMenu } from '@/components/Auth/AccountMenu'

export default function TeamsPage() {
  const router = useRouter()
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [teamName, setTeamName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<CollaborationRole>('EDITOR')

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await listTeams()
      setTeams(data.teams)
      setSelectedId(current => current || data.teams[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!teamName.trim()) return
    setError('')
    try {
      const data = await createTeam(teamName.trim())
      setTeamName('')
      await refresh()
      setSelectedId(data.team.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleAddMember(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || !memberEmail.trim()) return
    setError('')
    try {
      await addTeamMember(selected.id, { email: memberEmail.trim(), role: memberRole })
      setMemberEmail('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const selected = useMemo(
    () => teams.find(team => team.id === selectedId) ?? teams[0],
    [selectedId, teams]
  )
  const canManage = selected?.myRole === 'OWNER'

  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      <header className="bg-[var(--bg-surface)] border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/articles')}
            className="p-2 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-gray-100 rounded-md"
            title="返回文章"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-[var(--fg-primary)]">团队空间</h1>
            <p className="text-xs text-[var(--fg-tertiary)]">Owner / Editor / Viewer</p>
          </div>
        </div>
        <AccountMenu />
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-[18rem_minmax(0,1fr)] gap-6 px-6 py-8">
        <aside className="space-y-4">
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              value={teamName}
              onChange={event => setTeamName(event.target.value)}
              placeholder="新团队"
              className="min-w-0 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <button type="submit" className="inline-flex w-10 items-center justify-center rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]" title="创建团队">
              <Plus size={16} />
            </button>
          </form>

          <div className="space-y-2">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-[var(--fg-tertiary)]">
                <Loader2 size={14} className="animate-spin" />
                加载中
              </div>
            )}
            {!loading && teams.length === 0 && (
              <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-10 text-center text-sm text-[var(--fg-tertiary)]">
                暂无团队
              </div>
            )}
            {teams.map(team => (
              <button
                key={team.id}
                type="button"
                onClick={() => setSelectedId(team.id)}
                className={`w-full rounded-md border px-4 py-3 text-left transition-colors ${
                  selected?.id === team.id ? 'border-blue-300 bg-blue-50' : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[var(--fg-primary)]">{team.name}</span>
                  <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] text-[var(--fg-tertiary)]">{team.myRole}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--fg-tertiary)]">{team.articleCount} 篇文章 · {team.members.length} 人</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {selected ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-[var(--fg-primary)]">{selected.name}</h2>
                  <p className="text-sm text-[var(--fg-tertiary)]">当前权限：{selected.myRole}</p>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--fg-secondary)]">
                  <Users size={15} />
                  {selected.members.length} 成员
                </div>
              </div>

              {canManage && (
                <form onSubmit={handleAddMember} className="grid grid-cols-[minmax(0,1fr)_8rem_5rem] gap-2">
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={event => setMemberEmail(event.target.value)}
                    placeholder="成员邮箱"
                    className="min-w-0 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <select
                    value={memberRole}
                    onChange={event => setMemberRole(event.target.value as CollaborationRole)}
                    className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="VIEWER">Viewer</option>
                    <option value="OWNER">Owner</option>
                  </select>
                  <button type="submit" className="rounded-md bg-[var(--accent)] text-sm text-white hover:bg-[var(--accent-hover)]">邀请</button>
                </form>
              )}

              <div className="overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <div className="grid grid-cols-[minmax(0,1fr)_8rem_7rem] border-b border-gray-100 px-4 py-3 text-xs font-medium text-[var(--fg-tertiary)]">
                  <span>成员</span>
                  <span>角色</span>
                  <span className="text-right">操作</span>
                </div>
                {selected.members.map(member => (
                  <div key={member.id} className="grid grid-cols-[minmax(0,1fr)_8rem_7rem] items-center border-b border-gray-50 px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-[var(--fg-primary)]">{member.user.name || member.user.email}</div>
                      <div className="truncate text-xs text-[var(--fg-tertiary)]">{member.user.email}</div>
                    </div>
                    {canManage ? (
                      <select
                        value={member.role}
                        onChange={event => void updateTeamMember(selected.id, member.id, event.target.value as CollaborationRole).then(refresh).catch(err => setError(err instanceof Error ? err.message : String(err)))}
                        className="w-28 rounded-md border border-[var(--border-default)] px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
                      >
                        <option value="OWNER">Owner</option>
                        <option value="EDITOR">Editor</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    ) : (
                      <span className="text-sm text-[var(--fg-secondary)]">{member.role}</span>
                    )}
                    <div className="flex justify-end">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void removeTeamMember(selected.id, member.id).then(refresh).catch(err => setError(err instanceof Error ? err.message : String(err)))}
                          className="p-1.5 text-[var(--fg-tertiary)] hover:text-red-600 hover:bg-red-50 rounded-md"
                          title="移除成员"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <div className="border-b border-gray-100 px-4 py-3 text-xs font-medium text-[var(--fg-tertiary)]">团队文章</div>
                {selected.articleCount === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-[var(--fg-tertiary)]">暂无文章</div>
                )}
                {selected.articleCount > 0 && (
                  <div className="px-4 py-8 text-center text-sm text-[var(--fg-tertiary)]">文章会在云同步后出现在文章列表</div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-20 text-center text-sm text-[var(--fg-tertiary)]">
              请选择或创建团队
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
