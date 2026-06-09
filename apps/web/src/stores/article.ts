'use client'

import { create } from 'zustand'
import { db } from '@/lib/db'
import type { ArticleRecord } from '@/lib/db'
import { deleteRemoteArticle, syncArticleByLocalId, syncLocalToCloud } from '@/lib/cloud-sync'
import type { SyncDebugInfo } from '@/lib/cloud-sync'
import { useAuthStore } from './auth'

interface ArticleStore {
  articles: ArticleRecord[]
  currentId: number | null
  current: ArticleRecord | null
  saveStatus: 'saved' | 'saving' | 'error'
  syncStatus: 'idle' | 'syncing' | 'error'
  syncError: string
  syncDebug: SyncDebugInfo | null

  loadArticles(): Promise<void>
  loadArticle(id: number): Promise<void>
  createArticle(): Promise<number>
  clearSessionCache(keepUserId?: string | null): Promise<void>
  resetLocalState(): void
  updateTitle(title: string): void
  updateContent(json: string): void
  updateMeta(patch: Partial<Pick<ArticleRecord, 'cover' | 'summary' | 'tags' | 'categories'>>): void
  saveNow(): Promise<void>
  syncWithCloud(): Promise<void>
  deleteArticle(id: number): Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useArticleStore = create<ArticleStore>((set, get) => ({
  articles: [],
  currentId: null,
  current: null,
  saveStatus: 'saved',
  syncStatus: 'idle',
  syncError: '',
  syncDebug: null,

  async loadArticles() {
    const cacheOwnerId = currentCacheOwnerId()
    const rows = await db.articles.orderBy('updatedAt').reverse().toArray()
    const articles = rows.filter(article => isVisibleArticle(article, cacheOwnerId))
    set({ articles })
  },

  async loadArticle(id) {
    const article = await db.articles.get(id)
    if (article && isVisibleArticle(article, currentCacheOwnerId())) {
      set({ currentId: id, current: article })
    } else {
      set({ currentId: null, current: null })
    }
  },

  async createArticle() {
    const now = Date.now()
    const id = await db.articles.add({
      title: '无标题文章',
      tiptapJSON: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      tags: [],
      categories: [],
      createdAt: now,
      updatedAt: now,
      syncStatus: isCloudEnabled() ? 'dirty' : 'local',
      permissionRole: isCloudEnabled() ? 'OWNER' : undefined,
      cacheOwnerId: currentCacheOwnerId() ?? 'guest',
    })
    if (isCloudEnabled()) {
      await syncLocalArticle(id as number, set, get)
    }
    await get().loadArticles()
    await get().loadArticle(id as number)
    return id as number
  },

  async clearSessionCache(keepUserId = null) {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    const articles = await db.articles.toArray()
    const removeArticleIds = articles
      .filter(article => shouldRemoveForAuthBoundary(article, keepUserId))
      .map(article => article.id)
      .filter((id): id is number => typeof id === 'number')

    await db.transaction('rw', db.articles, db.platformConfigs, db.publishHistory, async () => {
      if (removeArticleIds.length) {
        await Promise.all(removeArticleIds.map(id => db.platformConfigs.where('articleId').equals(id).delete()))
        await Promise.all(removeArticleIds.map(id => db.publishHistory.where('articleId').equals(id).delete()))
        await db.articles.bulkDelete(removeArticleIds)
      }

      const [configs, history] = await Promise.all([
        db.platformConfigs.toArray(),
        db.publishHistory.toArray(),
      ])
      const removeConfigIds = configs
        .filter(row => shouldRemoveOwnedCache(row.cacheOwnerId, keepUserId))
        .map(row => row.id)
        .filter((id): id is number => typeof id === 'number')
      const removeHistoryIds = history
        .filter(row => shouldRemoveOwnedCache(row.cacheOwnerId, keepUserId))
        .map(row => row.id)
        .filter((id): id is number => typeof id === 'number')

      if (removeConfigIds.length) await db.platformConfigs.bulkDelete(removeConfigIds)
      if (removeHistoryIds.length) await db.publishHistory.bulkDelete(removeHistoryIds)
    })

    set({
      articles: [],
      currentId: null,
      current: null,
      saveStatus: 'saved',
      syncStatus: 'idle',
      syncError: '',
      syncDebug: null,
    })
    await get().loadArticles()
  },

  resetLocalState() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    set({
      articles: [],
      currentId: null,
      current: null,
      saveStatus: 'saved',
      syncStatus: 'idle',
      syncError: '',
      syncDebug: null,
    })
  },

  updateTitle(title) {
    const { current } = get()
    if (!current) return
    const updated = markDirty({ ...current, title })
    set({ current: updated, saveStatus: 'saving' })
    scheduleSave(get)
  },

  updateContent(tiptapJSON) {
    const { current } = get()
    if (!current) return
    const updated = markDirty({ ...current, tiptapJSON })
    set({ current: updated, saveStatus: 'saving' })
    scheduleSave(get)
  },

  updateMeta(patch) {
    const { current } = get()
    if (!current) return
    const updated = markDirty({ ...current, ...patch })
    set({ current: updated, saveStatus: 'saving' })
    scheduleSave(get)
  },

  async saveNow() {
    const { current } = get()
    if (!current?.id) return
    if (current.permissionRole === 'VIEWER') {
      const message = 'Viewer 只能查看文章，不能保存修改'
      set({ saveStatus: 'error', syncStatus: 'error', syncError: message })
      return
    }
    try {
      const updated: ArticleRecord = markDirty({ ...current, updatedAt: Date.now() })
      await db.articles.put(updated)
      set({ current: updated })

      if (isCloudEnabled()) {
        await syncLocalArticle(current.id, set, get)
        const synced = await db.articles.get(current.id)
        if (synced) set({ current: synced })
      }

      set({ saveStatus: 'saved' })
      await get().loadArticles()
    } catch (error) {
      if (current.id) {
        await db.articles.update(current.id, {
          syncStatus: 'error',
          syncError: error instanceof Error ? error.message : String(error),
        })
      }
      set({ saveStatus: 'error' })
    }
  },

  async syncWithCloud() {
    const user = useAuthStore.getState().user
    if (!user) return
    const previousCurrentId = get().currentId
    set({
      syncStatus: 'syncing',
      syncError: '',
      syncDebug: {
        phase: 'start',
        message: '开始云同步',
        lastRunAt: Date.now(),
      },
    })
    try {
      await get().clearSessionCache(user.id)
      await syncLocalToCloud(syncDebug => set({ syncDebug }), user.id)
      await get().loadArticles()
      if (previousCurrentId) await get().loadArticle(previousCurrentId)
      set(state => ({
        syncStatus: 'idle',
        syncError: '',
        syncDebug: {
          ...(state.syncDebug ?? {}),
          phase: 'done',
          message: '云同步完成',
          lastRunAt: Date.now(),
        },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set(state => ({
        syncStatus: 'error',
        syncError: message,
        syncDebug: {
          ...(state.syncDebug ?? {}),
          phase: state.syncDebug?.phase ?? 'error',
          message,
          error: message,
          lastRunAt: Date.now(),
        },
      }))
    }
  },

  async deleteArticle(id) {
    const article = await db.articles.get(id)
    if (isCloudEnabled() && article?.remoteId) {
      await deleteRemoteArticle(article.remoteId)
    }

    await db.transaction('rw', db.articles, db.platformConfigs, async () => {
      await db.platformConfigs.where('articleId').equals(id).delete()
      await db.articles.delete(id)
    })
    const { currentId } = get()
    if (currentId === id) set({ currentId: null, current: null })
    await get().loadArticles()
  },
}))

function scheduleSave(get: () => ArticleStore) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => get().saveNow(), 2000)
}

function markDirty(article: ArticleRecord): ArticleRecord {
  if (article.permissionRole === 'VIEWER') return article
  if (!useAuthStore.getState().user) {
    return { ...article, syncStatus: article.remoteId ? 'dirty' : 'local', cacheOwnerId: article.cacheOwnerId ?? 'guest' }
  }
  return { ...article, syncStatus: 'dirty', syncError: undefined, cacheOwnerId: currentCacheOwnerId() ?? article.cacheOwnerId }
}

async function syncLocalArticle(
  id: number,
  set: (partial: Partial<ArticleStore>) => void,
  get: () => ArticleStore
): Promise<void> {
  set({
    syncStatus: 'syncing',
    syncError: '',
    syncDebug: {
      phase: 'article-start',
      message: `开始同步本地文章：${id}`,
      lastRunAt: Date.now(),
    },
  })
  try {
    await syncArticleByLocalId(id, syncDebug => set({ syncDebug }), currentCacheOwnerId() ?? undefined)
    set({ syncStatus: 'idle', syncError: '' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.articles.update(id, {
      syncStatus: 'error',
      syncError: message,
    })
    const previous = get().syncDebug
    set({
      syncStatus: 'error',
      syncError: message,
      syncDebug: {
        ...(previous ?? {}),
        phase: previous?.phase ?? 'article-error',
        message,
        error: message,
        lastRunAt: Date.now(),
      },
    })
    throw error
  }
}

function isCloudEnabled(): boolean {
  return Boolean(useAuthStore.getState().user)
}

function currentCacheOwnerId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

function isVisibleArticle(article: ArticleRecord, userId: string | null): boolean {
  if (!userId) {
    return article.cacheOwnerId === 'guest' || isLegacyGuestDraft(article)
  }

  return article.cacheOwnerId === userId ||
    (!article.cacheOwnerId && article.ownerId === userId) ||
    isLegacyGuestDraft(article)
}

function isLegacyGuestDraft(article: ArticleRecord): boolean {
  return !article.cacheOwnerId && !article.remoteId && !article.ownerId && !article.permissionRole
}

function shouldRemoveForAuthBoundary(article: ArticleRecord, keepUserId: string | null): boolean {
  if (isLegacyGuestDraft(article) || article.cacheOwnerId === 'guest') return false
  if (!keepUserId) return isCloudBackedArticle(article)
  if (article.cacheOwnerId === keepUserId) return false
  if (!article.cacheOwnerId && article.ownerId === keepUserId) return false
  return isCloudBackedArticle(article)
}

function shouldRemoveOwnedCache(cacheOwnerId: string | undefined, keepUserId: string | null): boolean {
  if (!cacheOwnerId || cacheOwnerId === 'guest') return false
  return !keepUserId || cacheOwnerId !== keepUserId
}

function isCloudBackedArticle(article: ArticleRecord): boolean {
  return Boolean(article.remoteId || article.ownerId || article.permissionRole || (article.cacheOwnerId && article.cacheOwnerId !== 'guest'))
}
