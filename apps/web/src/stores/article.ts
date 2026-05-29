'use client'

import { create } from 'zustand'
import { db } from '@/lib/db'
import type { ArticleRecord } from '@/lib/db'

interface ArticleStore {
  articles: ArticleRecord[]
  currentId: number | null
  current: ArticleRecord | null
  saveStatus: 'saved' | 'saving' | 'error'

  loadArticles(): Promise<void>
  loadArticle(id: number): Promise<void>
  createArticle(): Promise<number>
  updateTitle(title: string): void
  updateContent(json: string): void
  updateMeta(patch: Partial<Pick<ArticleRecord, 'cover' | 'summary' | 'tags' | 'categories'>>): void
  saveNow(): Promise<void>
  deleteArticle(id: number): Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useArticleStore = create<ArticleStore>((set, get) => ({
  articles: [],
  currentId: null,
  current: null,
  saveStatus: 'saved',

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
    })
    await get().loadArticles()
    await get().loadArticle(id as number)
    return id as number
  },

  updateTitle(title) {
    const { current } = get()
    if (!current) return
    const updated = { ...current, title }
    set({ current: updated, saveStatus: 'saving' })
    scheduleSave(get)
  },

  updateContent(tiptapJSON) {
    const { current } = get()
    if (!current) return
    const updated = { ...current, tiptapJSON }
    set({ current: updated, saveStatus: 'saving' })
    scheduleSave(get)
  },

  updateMeta(patch) {
    const { current } = get()
    if (!current) return
    const updated = { ...current, ...patch }
    set({ current: updated, saveStatus: 'saving' })
    scheduleSave(get)
  },

  async saveNow() {
    const { current } = get()
    if (!current?.id) return
    try {
      await db.articles.update(current.id, { ...current, updatedAt: Date.now() })
      set({ saveStatus: 'saved' })
      await get().loadArticles()
    } catch {
      set({ saveStatus: 'error' })
    }
  },

  async deleteArticle(id) {
    await db.articles.delete(id)
    const { currentId } = get()
    if (currentId === id) set({ currentId: null, current: null })
    await get().loadArticles()
  },
}))

function scheduleSave(get: () => ArticleStore) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => get().saveNow(), 2000)
}
