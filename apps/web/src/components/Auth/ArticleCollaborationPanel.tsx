'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Link2, Loader2, Trash2, Users, X } from 'lucide-react'
import type { ArticleRecord } from '@/lib/db'
import { db } from '@/lib/db'
import {
  addArticleCollaborator,
  assignArticleTeam,
  createShareLink,
  deleteShareLink,
  getArticleCollaborators,
  getShareLinks,
  listTeams,
  removeArticleCollaborator,
  updateArticleCollaborator,
  type CollaborationRole,
  type CollaboratorRecord,
  type ShareLinkRecord,
  type TeamRecord,
} from '@/lib/collaboration-api'
import { useArticleStore } from '@/stores/article'

interface ArticleCollaborationPanelProps {
  article: ArticleRecord
  open: boolean
  onClose: () => void
}

export function ArticleCollaborationPanel({ article, open, onClose }: ArticleCollaborationPanelProps) {
  const loadArticles = useArticleStore(state => state.loadArticles)
  const loadArticle = useArticleStore(state => state.loadArticle)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ownerName, setOwnerName] = useState(article.ownerName ?? '')
  const [myRole, setMyRole] = useState<CollaborationRole>(article.permissionRole ?? 'OWNER')
  const [collaborators, setCollaborators] = useState<CollaboratorRecord[]>([])
  const [links, setLinks] = useState<ShareLinkRecord[]>([])
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [email, setEmail] = useState('')
  const [collaboratorRole, setCollaboratorRole] = useState<CollaborationRole>('EDITOR')
  const [linkRole, setLinkRole] = useState<Exclude<CollaborationRole, 'OWNER'>>('VIEWER')
  const [expiresInDays, setExpiresInDays] = useState('30')
  const [copied, setCopied] = useState(false)

  const canManage = myRole === 'OWNER'
  const remoteId = article.remoteId

  useEffect(() => {
    if (!open || !remoteId) return
    void refresh()
  }, [open, remoteId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    if (!remoteId) return
    setLoading(true)
    setError('')
    try {
      const [collabData, teamData] = await Promise.all([
        getArticleCollaborators(remoteId),
        listTeams().catch(() => ({ teams: [] })),
      ])
      setOwnerName(collabData.owner.name || collabData.owner.email)
      setMyRole(collabData.myRole)
      setCollaborators(collabData.collaborators)
      setTeams(teamData.teams)
      if (collabData.myRole === 'OWNER') {
        const shareData = await getShareLinks(remoteId)
        setLinks(shareData.links)
      } else {
        setLinks([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCollaborator(event: React.FormEvent) {
    event.preventDefault()
    if (!remoteId || !email.trim()) return
    setError('')
    try {
      await addArticleCollaborator(remoteId, { email: email.trim(), role: collaboratorRole })
      setEmail('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleCreateLink() {
    if (!remoteId) return
    setError('')
    try {
      const days = Number(expiresInDays)
      const data = await createShareLink(remoteId, {
        role: linkRole,
        expiresInDays: Number.isFinite(days) && days > 0 ? days : undefined,
      })
      setLinks(current => [data.link, ...current])
      if (data.link.url) await copyText(data.link.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleAssignTeam(teamId: string) {
    if (!remoteId || !article.id) return
    setError('')
    try {
      const value = teamId || null
      const response = await assignArticleTeam(remoteId, value)
      await db.articles.update(article.id, {
        teamId: response.article.teamId ?? undefined,
        teamName: response.article.teamName ?? undefined,
        updatedAt: response.article.updatedAt,
      })
      await loadArticle(article.id)
      await loadArticles()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard?.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const teamOptions = useMemo(
    () => teams.filter(team => team.myRole === 'OWNER'),
    [teams]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex justify-end" onMouseDown={onClose}>
      <aside
        className="h-full w-[28rem] max-w-[calc(100vw-1rem)] bg-white shadow-xl border-l border-gray-200 overflow-y-auto"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Users size={18} className="text-blue-600" />
            <div>
              <h2 className="font-semibold text-gray-900">协作与权限</h2>
              <p className="text-xs text-gray-400 truncate">Owner: {ownerName || article.ownerName || '当前用户'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg" title="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!remoteId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              这篇文章还没有云端 ID，请先登录并同步。
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">当前权限</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs ${rolePill(myRole)}`}>{roleLabel(myRole)}</span>
            </div>
            <div className="text-xs text-gray-500">
              {article.teamName ? `团队空间：${article.teamName}` : '未加入团队空间'}
            </div>
          </section>

          {canManage && (
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">团队空间</h3>
              <select
                value={article.teamId ?? ''}
                onChange={event => void handleAssignTeam(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              >
                <option value="">个人文章</option>
                {teamOptions.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">协作者</h3>
              {loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
            </div>

            {canManage && (
              <form onSubmit={handleAddCollaborator} className="grid grid-cols-[minmax(0,1fr)_6.5rem_4rem] gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="邮箱"
                  className="min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
                <select
                  value={collaboratorRole}
                  onChange={event => setCollaboratorRole(event.target.value as CollaborationRole)}
                  className="rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:border-blue-400"
                >
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <button type="submit" className="rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700">添加</button>
              </form>
            )}

            <div className="space-y-2">
              {collaborators.length === 0 && <div className="text-sm text-gray-400">暂无协作者</div>}
              {collaborators.map(collaborator => (
                <div key={collaborator.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-gray-900">{collaborator.user.name || collaborator.user.email}</div>
                    <div className="truncate text-xs text-gray-400">{collaborator.user.email}</div>
                  </div>
                  {canManage ? (
                    <select
                      value={collaborator.role}
                      onChange={event => {
                        if (!remoteId) return
                        void updateArticleCollaborator(remoteId, collaborator.id, event.target.value as CollaborationRole).then(refresh).catch(err => setError(err instanceof Error ? err.message : String(err)))
                      }}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${rolePill(collaborator.role)}`}>{roleLabel(collaborator.role)}</span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!remoteId) return
                        void removeArticleCollaborator(remoteId, collaborator.id).then(refresh).catch(err => setError(err instanceof Error ? err.message : String(err)))
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="移除"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {canManage && (
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">分享链接</h3>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)_4rem] gap-2">
                <select
                  value={linkRole}
                  onChange={event => setLinkRole(event.target.value as Exclude<CollaborationRole, 'OWNER'>)}
                  className="rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:border-blue-400"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                </select>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={expiresInDays}
                  onChange={event => setExpiresInDays(event.target.value)}
                  className="min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  title="有效天数"
                />
                <button type="button" onClick={() => void handleCreateLink()} className="rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700">
                  创建
                </button>
              </div>
              {copied && (
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <Check size={13} />
                  已复制链接
                </div>
              )}
              <div className="space-y-2">
                {links.length === 0 && <div className="text-sm text-gray-400">暂无分享链接</div>}
                {links.map(link => (
                  <div key={link.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                    <Link2 size={14} className="text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-900">{roleLabel(link.role)}</div>
                      <div className="text-xs text-gray-400">
                        {link.expiresAt ? `${new Date(link.expiresAt).toLocaleDateString('zh-CN')} 到期` : '长期有效'}
                      </div>
                    </div>
                    {link.url && (
                      <button type="button" onClick={() => void copyText(link.url!)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="复制">
                        <Copy size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!remoteId) return
                        void deleteShareLink(remoteId, link.id).then(refresh).catch(err => setError(err instanceof Error ? err.message : String(err)))
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}

function roleLabel(role: CollaborationRole): string {
  if (role === 'OWNER') return 'Owner'
  if (role === 'EDITOR') return 'Editor'
  return 'Viewer'
}

function rolePill(role: CollaborationRole): string {
  if (role === 'OWNER') return 'bg-blue-50 text-blue-700'
  if (role === 'EDITOR') return 'bg-emerald-50 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}
