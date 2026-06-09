'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useArticleStore } from '@/stores/article'

export function AppBootstrap() {
  const { user, status, init } = useAuthStore()
  const syncWithCloud = useArticleStore(state => state.syncWithCloud)
  const clearSessionCache = useArticleStore(state => state.clearSessionCache)
  const syncedUserId = useRef<string | null>(null)
  const cleanedGuestCache = useRef(false)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (status !== 'authenticated' || !user) return
    if (syncedUserId.current === user.id) return
    syncedUserId.current = user.id
    cleanedGuestCache.current = false
    void syncWithCloud()
  }, [status, syncWithCloud, user])

  useEffect(() => {
    if (status !== 'guest') return
    if (cleanedGuestCache.current) return
    cleanedGuestCache.current = true
    syncedUserId.current = null
    void clearSessionCache(null)
  }, [clearSessionCache, status])

  return null
}
