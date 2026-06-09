'use client'

import { create } from 'zustand'
import { apiFetch, type ApiUser } from '@/lib/api-client'

interface AuthStore {
  user: ApiUser | null
  status: 'loading' | 'authenticated' | 'guest'
  error: string
  initialized: boolean

  init(): Promise<void>
  login(email: string, password: string): Promise<void>
  register(input: { email: string; password: string; name?: string }): Promise<void>
  logout(): Promise<void>
  forgotPassword(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  status: 'loading',
  error: '',
  initialized: false,

  async init() {
    if (get().initialized) return
    set({ status: 'loading', error: '' })
    try {
      const data = await apiFetch<{ user: ApiUser }>('/api/auth/me')
      set({ user: data.user, status: 'authenticated', initialized: true })
    } catch {
      set({ user: null, status: 'guest', initialized: true })
    }
  },

  async login(email, password) {
    set({ status: 'loading', error: '' })
    try {
      const data = await apiFetch<{ user: ApiUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }, false)
      set({ user: data.user, status: 'authenticated', initialized: true })
    } catch (error) {
      set({ user: null, status: 'guest', error: error instanceof Error ? error.message : String(error), initialized: true })
      throw error
    }
  },

  async register(input) {
    set({ status: 'loading', error: '' })
    try {
      const data = await apiFetch<{ user: ApiUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      }, false)
      set({ user: data.user, status: 'authenticated', initialized: true })
    } catch (error) {
      set({ user: null, status: 'guest', error: error instanceof Error ? error.message : String(error), initialized: true })
      throw error
    }
  },

  async logout() {
    await apiFetch<{ ok: true }>('/api/auth/logout', { method: 'POST' }, false).catch(() => undefined)
    set({ user: null, status: 'guest', error: '', initialized: true })
  },

  async forgotPassword(email) {
    await apiFetch<{ ok: true }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }, false)
  },

  async resetPassword(token, password) {
    await apiFetch<{ ok: true }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }, false)
  },
}))
