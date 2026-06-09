'use client'

import { create } from 'zustand'
import { getAllRenderers } from '@xegineer/renderer'
import type { MetaField, PlatformConfig, PlatformRenderer } from '@xegineer/renderer'
import { db } from '@/lib/db'
import { getExtensionBridge } from '@/lib/extension-bridge'
import { syncLocalToCloud } from '@/lib/cloud-sync'
import { useAuthStore } from './auth'

export type PublishStatus = 'idle' | 'pending' | 'success' | 'error'

export interface PlatformState {
  id: string
  name: string
  schema: MetaField[]
  selected: boolean
  authStatus: 'unknown' | 'authenticated' | 'unauthenticated'
  username?: string
  publishStatus: PublishStatus
  publishUrl?: string
  publishError?: string
  publishMessage?: string
  config: PlatformConfig
}

interface PublishStore {
  platforms: PlatformState[]
  currentArticleId: number | null
  isPublishing: boolean
  showPublishDialog: boolean

  initPlatforms(): void
  loadConfigs(articleId: number): Promise<void>
  togglePlatform(id: string): void
  updateConfig(id: string, config: Partial<PlatformConfig>): void
  checkAuth(id: string): Promise<void>
  checkAllAuth(): Promise<void>
  publish(articleId: number, getPayload: (platformId: string) => Record<string, unknown>): Promise<void>
  publishOne(articleId: number, platformId: string, getPayload: (platformId: string) => Record<string, unknown>): Promise<void>
  setShowPublishDialog(v: boolean): void
  resetPublishStatus(): void
}

export const usePublishStore = create<PublishStore>((set, get) => ({
  platforms: [],
  currentArticleId: null,
  isPublishing: false,
  showPublishDialog: false,

  initPlatforms() {
    set(s => ({ platforms: createPlatformStates(s.platforms) }))
  },

  async loadConfigs(articleId) {
    if (!get().platforms.length) {
      get().initPlatforms()
    }

    const rows = await db.platformConfigs.where('articleId').equals(articleId).toArray()
    const configs = new Map<string, PlatformConfig>()

    for (const row of rows) {
      try {
        configs.set(row.platform, JSON.parse(row.config) as PlatformConfig)
      } catch {
        configs.set(row.platform, defaultConfig())
      }
    }

    set(s => ({
      currentArticleId: articleId,
      platforms: createPlatformStates(s.platforms).map(p => ({
        ...p,
        config: { ...defaultConfig(), ...(configs.get(p.id) ?? {}) },
      })),
    }))
  },

  togglePlatform(id) {
    set(s => ({
      platforms: s.platforms.map(p =>
        p.id === id ? { ...p, selected: !p.selected } : p
      ),
    }))
  },

  updateConfig(id, config) {
    let nextConfig: PlatformConfig | null = null
    set(s => ({
      platforms: s.platforms.map(p => {
        if (p.id !== id) return p
        nextConfig = { ...p.config, ...config }
        return { ...p, config: nextConfig }
      }),
    }))

    const articleId = get().currentArticleId
    if (articleId && nextConfig) {
      void persistPlatformConfig(articleId, id, nextConfig)
    }
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
        p.selected ? { ...p, publishStatus: 'pending' as const, publishUrl: undefined, publishError: undefined, publishMessage: undefined } : p
      ),
    }))

    await Promise.all(selected.map(async (platform) => {
      try {
        const payload = getPayload(platform.id)

        const result = await bridge.publish(platform.id, payload)
        set(s => ({
          platforms: s.platforms.map(p =>
            p.id === platform.id
              ? { ...p, publishStatus: result.success ? 'success' : 'error', publishUrl: result.url, publishError: result.error, publishMessage: result.message }
              : p
          ),
        }))
        await recordPublishResult(articleId, platform, result)
      } catch (e) {
        const error = String(e)
        set(s => ({
          platforms: s.platforms.map(p =>
            p.id === platform.id
              ? { ...p, publishStatus: 'error', publishError: error, publishMessage: undefined }
              : p
          ),
        }))
        await db.publishHistory.add({
          cacheOwnerId: currentCacheOwnerId(),
          articleId,
          platform: platform.id,
          platformName: platform.name,
          publishedAt: Date.now(),
          isDraft: platform.config.isDraft ?? true,
          success: false,
          error,
        })
        await syncIfAuthenticated()
      }
    }))

    set({ isPublishing: false })
  },

  async publishOne(articleId, platformId, getPayload) {
    if (!getExtensionBridge()) return
    const bridge = getExtensionBridge()!
    const platform = get().platforms.find(p => p.id === platformId)
    if (!platform) return

    set({ isPublishing: true })
    set(s => ({
      platforms: s.platforms.map(p =>
        p.id === platformId ? { ...p, publishStatus: 'pending' as const, publishUrl: undefined, publishError: undefined, publishMessage: undefined } : p
      ),
    }))

    try {
      const payload = getPayload(platform.id)

      const result = await bridge.publish(platform.id, payload)
      set(s => ({
        platforms: s.platforms.map(p =>
          p.id === platform.id
            ? { ...p, publishStatus: result.success ? 'success' : 'error', publishUrl: result.url, publishError: result.error, publishMessage: result.message }
            : p
        ),
      }))
      await recordPublishResult(articleId, platform, result)
    } catch (e) {
      const error = String(e)
      set(s => ({
        platforms: s.platforms.map(p =>
          p.id === platform.id
            ? { ...p, publishStatus: 'error', publishError: error, publishMessage: undefined }
            : p
        ),
      }))
      await db.publishHistory.add({
        cacheOwnerId: currentCacheOwnerId(),
        articleId,
        platform: platform.id,
        platformName: platform.name,
        publishedAt: Date.now(),
        isDraft: platform.config.isDraft ?? true,
        success: false,
        error,
      })
      await syncIfAuthenticated()
    } finally {
      set({ isPublishing: false })
    }
  },

  setShowPublishDialog(v) {
    set({ showPublishDialog: v })
  },

  resetPublishStatus() {
    set(s => ({
      platforms: s.platforms.map(p => ({ ...p, publishStatus: 'idle', publishUrl: undefined, publishError: undefined, publishMessage: undefined })),
    }))
  },
}))

function defaultConfig(): PlatformConfig {
  return { isDraft: true, tags: [], categories: [] }
}

function createPlatformStates(previous: PlatformState[] = []): PlatformState[] {
  const renderers = getAllRenderers()
  return renderers.map((r: PlatformRenderer) => {
    const prev = previous.find(p => p.id === r.platformId)
    return {
      id: r.platformId,
      name: r.platformName,
      schema: r.metaSchema,
      selected: prev?.selected ?? false,
      authStatus: prev?.authStatus ?? 'unknown',
      username: prev?.username,
      publishStatus: prev?.publishStatus ?? 'idle',
      publishUrl: prev?.publishUrl,
      publishError: prev?.publishError,
      publishMessage: prev?.publishMessage,
      config: { ...defaultConfig(), ...(prev?.config ?? {}) },
    }
  })
}

async function persistPlatformConfig(articleId: number, platform: string, config: PlatformConfig) {
  const existing = await db.platformConfigs
    .where('[articleId+platform]')
    .equals([articleId, platform])
    .first()

  const record = { articleId, platform, config: JSON.stringify(config), cacheOwnerId: currentCacheOwnerId() }
  if (existing?.id) {
    await db.platformConfigs.update(existing.id, { ...record, updatedAt: Date.now() })
  } else {
    await db.platformConfigs.add({ ...record, updatedAt: Date.now() })
  }
  await syncIfAuthenticated()
}

async function recordPublishResult(
  articleId: number,
  platform: PlatformState,
  result: { success: boolean; url?: string; postId?: string; isDraft?: boolean; error?: string; message?: string }
) {
  await db.publishHistory.add({
    cacheOwnerId: currentCacheOwnerId(),
    articleId,
    platform: platform.id,
    platformName: platform.name,
    publishedAt: Date.now(),
    url: result.url,
    postId: result.postId,
    isDraft: result.isDraft ?? platform.config.isDraft ?? true,
    success: result.success,
    error: result.error,
    message: result.message,
  })
  await syncIfAuthenticated()
}

async function syncIfAuthenticated() {
  const user = useAuthStore.getState().user
  if (!user) return
  try {
    await syncLocalToCloud(undefined, user.id)
  } catch {
    // Publishing should not fail just because cloud sync is temporarily unavailable.
  }
}

function currentCacheOwnerId(): string {
  return useAuthStore.getState().user?.id ?? 'guest'
}
