'use client'

import { create } from 'zustand'
import { getAllRenderers } from '@xegineer/renderer'
import type { PlatformConfig, PlatformRenderer } from '@xegineer/renderer'
import { db } from '@/lib/db'
import { getExtensionBridge } from '@/lib/extension-bridge'

export type PublishStatus = 'idle' | 'pending' | 'success' | 'error'

export interface PlatformState {
  id: string
  name: string
  selected: boolean
  authStatus: 'unknown' | 'authenticated' | 'unauthenticated'
  username?: string
  publishStatus: PublishStatus
  publishUrl?: string
  publishError?: string
  config: PlatformConfig
}

interface PublishStore {
  platforms: PlatformState[]
  isPublishing: boolean
  showPublishDialog: boolean

  initPlatforms(): void
  togglePlatform(id: string): void
  updateConfig(id: string, config: Partial<PlatformConfig>): void
  checkAuth(id: string): Promise<void>
  checkAllAuth(): Promise<void>
  publish(articleId: number, getPayload: (platformId: string) => Record<string, unknown>): Promise<void>
  setShowPublishDialog(v: boolean): void
  resetPublishStatus(): void
}

export const usePublishStore = create<PublishStore>((set, get) => ({
  platforms: [],
  isPublishing: false,
  showPublishDialog: false,

  initPlatforms() {
    const renderers = getAllRenderers()
    set({
      platforms: renderers.map((r: PlatformRenderer) => ({
        id: r.platformId,
        name: r.platformName,
        selected: false,
        authStatus: 'unknown' as const,
        publishStatus: 'idle' as const,
        config: { isDraft: true, tags: [], categories: [] },
      })),
    })
  },

  togglePlatform(id) {
    set(s => ({
      platforms: s.platforms.map(p =>
        p.id === id ? { ...p, selected: !p.selected } : p
      ),
    }))
  },

  updateConfig(id, config) {
    set(s => ({
      platforms: s.platforms.map(p =>
        p.id === id ? { ...p, config: { ...p.config, ...config } } : p
      ),
    }))
  },

  async checkAuth(id) {
    const bridge = getExtensionBridge()
    if (!bridge) return
    try {
      const result = await bridge.checkAuth(id)
      set(s => ({
        platforms: s.platforms.map(p =>
          p.id === id
            ? { ...p, authStatus: result.isAuthenticated ? 'authenticated' : 'unauthenticated', username: result.username }
            : p
        ),
      }))
    } catch {
      set(s => ({
        platforms: s.platforms.map(p =>
          p.id === id ? { ...p, authStatus: 'unauthenticated' } : p
        ),
      }))
    }
  },

  async checkAllAuth() {
    const { platforms } = get()
    await Promise.all(platforms.map(p => get().checkAuth(p.id)))
  },

  async publish(articleId, getPayload) {
    if (!getExtensionBridge()) return
    const bridge = getExtensionBridge()!
    const selected = get().platforms.filter(p => p.selected)
    if (!selected.length) return

    set({ isPublishing: true })
    set(s => ({
      platforms: s.platforms.map(p =>
        p.selected ? { ...p, publishStatus: 'pending' as const } : p
      ),
    }))

    await Promise.all(selected.map(async (platform) => {
      try {
        const payload = getPayload(platform.id)
        const result = await bridge.publish(platform.id, payload)
        set(s => ({
          platforms: s.platforms.map(p =>
            p.id === platform.id
              ? { ...p, publishStatus: result.success ? 'success' : 'error', publishUrl: result.url, publishError: result.error }
              : p
          ),
        }))
        if (result.success) {
          await db.publishHistory.add({
            articleId,
            platform: platform.id,
            platformName: platform.name,
            publishedAt: Date.now(),
            url: result.url,
            postId: result.postId,
            isDraft: result.isDraft,
            success: true,
          })
        }
      } catch (e) {
        set(s => ({
          platforms: s.platforms.map(p =>
            p.id === platform.id
              ? { ...p, publishStatus: 'error', publishError: String(e) }
              : p
          ),
        }))
      }
    }))

    set({ isPublishing: false })
  },

  setShowPublishDialog(v) {
    set({ showPublishDialog: v })
  },

  resetPublishStatus() {
    set(s => ({
      platforms: s.platforms.map(p => ({ ...p, publishStatus: 'idle', publishUrl: undefined, publishError: undefined })),
    }))
  },
}))
