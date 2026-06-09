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
    const articles = await db.articles.orderBy('updatedAt').reverse().toArray()
    set({ articles })
  },

  async loadArticle(id) {
    const article = await db.articles.get(id)
    if (article) set({ currentId: id, current: article })
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
    })
    if (isCloudEnabled()) {
      await syncLocalArticle(id as number, set, get)
    }
    await get().loadArticles()
    await get().loadArticle(id as number)
    return id as number
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
    if (!isCloudEnabled()) return
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
      await syncLocalToCloud(syncDebug => set({ syncDebug }))
      await get().loadArticles()
      const { currentId } = get()
      if (currentId) await get().loadArticle(currentId)
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
  if (!useAuthStore.getState().user) {
    return { ...article, syncStatus: article.remoteId ? 'dirty' : 'local' }
  }
  return { ...article, syncStatus: 'dirty', syncError: undefined }
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
    await syncArticleByLocalId(id, syncDebug => set({ syncDebug }))
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
