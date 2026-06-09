import { apiFetch, type ApiUser } from './api-client'
import { db, type ArticleRecord } from './db'
import { useAuthStore } from '@/stores/auth'

export type CollaborationRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export interface CollaboratorRecord {
  id: string
  role: CollaborationRole
  createdAt: number
  user: ApiUser
  invitedBy?: ApiUser | null
}

export interface ShareLinkRecord {
  id: string
  role: CollaborationRole
  enabled: boolean
  expiresAt?: number | null
  lastUsedAt?: number | null
  createdAt: number
  createdBy?: ApiUser
  url?: string
}

export interface TeamRecord {
  id: string
  name: string
  myRole: CollaborationRole
  articleCount: number
  createdAt: number
  updatedAt: number
  members: Array<{ id: string; role: CollaborationRole; user: ApiUser }>
}

export async function getArticleCollaborators(remoteId: string) {
  return apiFetch<{ owner: ApiUser; myRole: CollaborationRole; collaborators: CollaboratorRecord[] }>(`/api/articles/${remoteId}/collaborators`)
}

export async function addArticleCollaborator(remoteId: string, input: { email: string; role: CollaborationRole }) {
  return apiFetch<{ collaborator: CollaboratorRecord }>(`/api/articles/${remoteId}/collaborators`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateArticleCollaborator(remoteId: string, collaboratorId: string, role: CollaborationRole) {
  return apiFetch<{ collaborator: CollaboratorRecord }>(`/api/articles/${remoteId}/collaborators/${collaboratorId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export async function removeArticleCollaborator(remoteId: string, collaboratorId: string) {
  return apiFetch<{ ok: true }>(`/api/articles/${remoteId}/collaborators/${collaboratorId}`, { method: 'DELETE' })
}

export async function getShareLinks(remoteId: string) {
  return apiFetch<{ links: ShareLinkRecord[] }>(`/api/articles/${remoteId}/share-links`)
}

export async function createShareLink(remoteId: string, input: { role: Exclude<CollaborationRole, 'OWNER'>; expiresInDays?: number }) {
  return apiFetch<{ link: ShareLinkRecord }>(`/api/articles/${remoteId}/share-links`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function deleteShareLink(remoteId: string, linkId: string) {
  return apiFetch<{ ok: true }>(`/api/articles/${remoteId}/share-links/${linkId}`, { method: 'DELETE' })
}

export async function listTeams() {
  return apiFetch<{ teams: TeamRecord[] }>('/api/teams')
}

export async function createTeam(name: string) {
  return apiFetch<{ team: TeamRecord }>('/api/teams', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function addTeamMember(teamId: string, input: { email: string; role: CollaborationRole }) {
  return apiFetch<{ member: TeamRecord['members'][number] }>(`/api/teams/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateTeamMember(teamId: string, memberId: string, role: CollaborationRole) {
  return apiFetch<{ member: TeamRecord['members'][number] }>(`/api/teams/${teamId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export async function removeTeamMember(teamId: string, memberId: string) {
  return apiFetch<{ ok: true }>(`/api/teams/${teamId}/members/${memberId}`, { method: 'DELETE' })
}

export async function assignArticleTeam(remoteId: string, teamId: string | null) {
  return apiFetch<{ article: { remoteId: string; teamId?: string | null; teamName?: string | null; updatedAt: number } }>(`/api/articles/${remoteId}/team`, {
    method: 'PATCH',
    body: JSON.stringify({ teamId }),
  })
}

export async function getSharePreview(token: string) {
  return apiFetch<{ share: { role: CollaborationRole; expiresAt?: number | null; article: { remoteId: string; title: string; ownerName: string } } }>(`/api/share-links/${token}`, {}, false)
}

export async function acceptShareLink(token: string): Promise<number> {
  const response = await apiFetch<{ article: ArticleRecord & { remoteId: string } }>(`/api/share-links/${token}`, {
    method: 'POST',
  })
  return upsertRemoteArticle(response.article)
}

async function upsertRemoteArticle(article: ArticleRecord & { remoteId: string }): Promise<number> {
  const existing = await db.articles.where('remoteId').equals(article.remoteId).first()
  const record = {
    remoteId: article.remoteId,
    title: article.title,
    tiptapJSON: article.tiptapJSON,
    cover: article.cover ?? undefined,
    summary: article.summary ?? undefined,
    tags: article.tags ?? [],
    categories: article.categories ?? [],
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    ownerId: article.ownerId,
    ownerName: article.ownerName,
    teamId: article.teamId ?? undefined,
    teamName: article.teamName ?? undefined,
    permissionRole: article.permissionRole,
    cacheOwnerId: useAuthStore.getState().user?.id,
    syncStatus: 'synced' as const,
    lastSyncedAt: Date.now(),
    syncError: undefined,
  }

  if (existing?.id) {
    await db.articles.update(existing.id, record)
    return existing.id
  }

  return db.articles.add(record) as Promise<number>
}
