/**
 * 小红书适配器
 *
 * 前置条件：用户需在浏览器中登录 www.xiaohongshu.com 并访问一次 edith.xiaohongshu.com
 * （小红书 SSO 会自动同步 session 到编辑器子域）
 *
 * Cookie 说明：
 * - web_session：登录 session，domain=.xiaohongshu.com，所有子域共享
 * - 需要在 edith.xiaohongshu.com 也激活 session 才能调用 API
 */
import { CodeAdapter } from '@wechatsync/core/adapters/code-adapter'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core/types'

const HEADER_RULES = [
  {
    urlFilter: '*://edith.xiaohongshu.com/*',
    headers: {
      'Origin': 'https://edith.xiaohongshu.com',
      'Referer': 'https://edith.xiaohongshu.com/',
    },
    resourceTypes: ['xmlhttprequest'],
  },
  {
    urlFilter: '*://www.xiaohongshu.com/api/*',
    headers: {
      'Origin': 'https://www.xiaohongshu.com',
      'Referer': 'https://www.xiaohongshu.com/',
    },
    resourceTypes: ['xmlhttprequest'],
  },
]

export class XiaohongshuAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'xiaohongshu',
    name: '小红书',
    icon: 'https://www.xiaohongshu.com/favicon.ico',
    homepage: 'https://edith.xiaohongshu.com',
    capabilities: ['article', 'draft', 'tags'],
  }

  private userInfo: { userId: string; nickname: string } | null = null

  async checkAuth(): Promise<AuthResult> {
    // Check session cookie on main domain (most reliable)
    let hasSession = false
    if (this.runtime.getCookie) {
      const session = await this.runtime.getCookie('.xiaohongshu.com', 'web_session')
      hasSession = !!session
      if (!hasSession) {
        const s2 = await this.runtime.getCookie('xiaohongshu.com', 'web_session')
        hasSession = !!s2
      }
    }
    if (!hasSession) return { isAuthenticated: false }

    // Try www API for user profile (most users are logged in here)
    return this.withHeaderRules(HEADER_RULES, async () => {
      try {
        const resp = await this.runtime.fetch(
          'https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo',
          {
            credentials: 'include',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          }
        )
        if (resp.ok) {
          const data = await resp.json() as {
            success?: boolean
            data?: {
              user_id?: string; nickname?: string; avatar_url?: string
              basic_info?: { nickname?: string; imageb?: string }
            }
          }
          const d = data.data
          if (data.success && d) {
            const userId = d.user_id ?? ''
            const nickname = d.nickname ?? d.basic_info?.nickname ?? ''
            if (userId) {
              this.userInfo = { userId, nickname }
              return {
                isAuthenticated: true,
                userId,
                username: nickname || undefined,
                avatar: d.avatar_url ?? d.basic_info?.imageb,
              }
            }
          }
        }
      } catch { /* continue */ }

      // Fallback: try edith API (requires visiting edith.xiaohongshu.com once)
      try {
        const resp = await this.runtime.fetch(
          'https://edith.xiaohongshu.com/api/sns/web/v1/user/me',
          { credentials: 'include', headers: { Accept: 'application/json' } }
        )
        if (resp.ok) {
          const data = await resp.json() as {
            success?: boolean
            data?: { user_id?: string; nickname?: string; avatar?: string }
          }
          if (data.success && data.data?.user_id) {
            this.userInfo = { userId: data.data.user_id, nickname: data.data.nickname ?? '' }
            return {
              isAuthenticated: true,
              userId: data.data.user_id,
              username: data.data.nickname || undefined,
              avatar: data.data.avatar,
            }
          }
        }
      } catch { /* continue */ }

      // Cookie exists but APIs unavailable — likely need to visit edith once
      return { isAuthenticated: true }
    }).catch(() => ({ isAuthenticated: true }))
  }

  async publish(article: Article): Promise<SyncResult> {
    return this.withHeaderRules(HEADER_RULES, async () => {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书（www.xiaohongshu.com）')

      const tags = article.tags ?? []
      const descBody = article.markdown || article.title || ''
      const tagLine = tags.map(t => `#${t}`).join(' ')
      const desc = [descBody, tagLine].filter(Boolean).join('\n\n')

      // Try edith API — the newer editor platform
      let lastError = ''
      for (const url of [
        'https://edith.xiaohongshu.com/api/sns/web/v1/note',
      ]) {
        try {
          const body = {
            title: article.title || '无标题',
            desc,
            type: 1,
            note_type: 1,
            post_loc: {},
            image_info_list: [],
            ats: [],
            topic: {},
          }

          const resp = await this.runtime.fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          })

          const text = await resp.text()
          let parsed: { success?: boolean; code?: number; msg?: string; message?: string; data?: { id?: string; note_id?: string } } = {}
          try { parsed = JSON.parse(text) } catch { /* raw text */ }

          if (resp.ok && (parsed.success ?? true)) {
            const noteId = parsed.data?.note_id ?? parsed.data?.id ?? ''
            return {
              platform: 'xiaohongshu',
              success: true,
              postId: noteId,
              postUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : undefined,
              draftOnly: true,
              message: noteId ? '已发布到小红书，请前往确认' : '已发布到小红书草稿',
              timestamp: Date.now(),
            }
          }

          if (resp.status === 401) {
            lastError = '会话未激活，请在浏览器中访问 https://edith.xiaohongshu.com 一次后再试'
          } else {
            lastError = parsed.msg || parsed.message || `HTTP ${resp.status}: ${text.slice(0, 100)}`
          }
        } catch (e) {
          lastError = (e as Error).message
        }
      }

      throw new Error(lastError || '小红书发布失败')
    }).catch((e: unknown) => ({
      platform: 'xiaohongshu',
      success: false,
      error: (e as Error).message,
      timestamp: Date.now(),
    }))
  }
}
