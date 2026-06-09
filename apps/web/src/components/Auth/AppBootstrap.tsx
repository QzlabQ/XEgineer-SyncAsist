'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useArticleStore } from '@/stores/article'

export function AppBootstrap() {
  const { user, status, init } = useAuthStore()
  const syncWithCloud = useArticleStore(state => state.syncWithCloud)
  const syncedUserId = useRef<string | null>(null)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (status !== 'authenticated' || !user) return
    if (syncedUserId.current === user.id) return
    syncedUserId.current = user.id
    void syncWithCloud()
  }, [status, syncWithCloud, user])

  return null
}
