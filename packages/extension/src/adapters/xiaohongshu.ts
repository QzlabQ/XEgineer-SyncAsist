/**
 * 小红书适配器
 *
 * 前置条件：在浏览器中登录 www.xiaohongshu.com 并访问一次 creator.xiaohongshu.com
 *（小红书 SSO 自动同步 session，cookie domain=.xiaohongshu.com 可跨子域）
 */
import { CodeAdapter } from '@wechatsync/core/adapters/code-adapter'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core/types'

const HEADER_RULES = [
  {
    urlFilter: '*://creator.xiaohongshu.com/*',
    headers: {
      'Origin': 'https://creator.xiaohongshu.com',
      'Referer': 'https://creator.xiaohongshu.com/',
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
    homepage: 'https://creator.xiaohongshu.com',
    capabilities: ['article', 'draft', 'tags'],
  }

  async checkAuth(): Promise<AuthResult> {
    // Step 1: check web_session cookie (zero-dependency, always works if logged in)
    let hasSession = false
    if (this.runtime.getCookie) {
      const session = await this.runtime.getCookie('.xiaohongshu.com', 'web_session')
      hasSession = !!session
    }
    if (!hasSession) return { isAuthenticated: false }

    // Step 2: try www API for user profile
    return this.withHeaderRules(HEADER_RULES, async () => {
      try {
        const resp = await this.runtime.fetch(
          'https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo',
          { credentials: 'include', headers: { Accept: 'application/json' } }
        )
        if (resp.ok) {
          const data = await resp.json() as {
            success?: boolean
            data?: { user_id?: string; nickname?: string; avatar?: string; basic_info?: { nickname?: string; imageb?: string } }
          }
          const d = data.data
          if (data.success && d) {
            const userId = d.user_id ?? ''
            const nickname = d.nickname ?? d.basic_info?.nickname ?? ''
            if (userId) {
              return {
                isAuthenticated: true,
                userId,
                username: nickname || undefined,
                avatar: d.avatar ?? d.basic_info?.imageb,
              }
            }
          }
        }
      } catch { /* continue */ }

      // Authenticated (cookie exists) but profile API unavailable
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

      // creator.xiaohongshu.com — Xiaohongshu's content creator platform
      for (const url of [
        'https://creator.xiaohongshu.com/api/sns/web/v1/note',
        'https://creator.xiaohongshu.com/web_api/sns/v1/note',
        'https://creator.xiaohongshu.com/api/galaxy/creator/note/post',
      ]) {
        try {
          const body: Record<string, unknown> = url.includes('galaxy')
            ? {
                type: 1, title: article.title || '无标题', desc,
                hash_tag: tags.map(t => ({ name: t, type: 1 })),
                ats: [], image_info_list: [], is_private: false, post_loc: {}, business_binds: {},
              }
            : {
                title: article.title || '无标题', desc, type: 1, note_type: 1, post_loc: {},
                image_info_list: [], ats: [],
              }

          const resp = await this.runtime.fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          })

          const text = await resp.text()

          if (resp.ok) {
            const res = (() => { try { return JSON.parse(text) } catch { return {} } })() as {
              success?: boolean; code?: number; msg?: string
              data?: { id?: string; note_id?: string; noteId?: string }
            }
            if (res.success || res.code === 0) {
              const noteId = res.data?.note_id ?? res.data?.id ?? res.data?.noteId ?? ''
              return {
                platform: 'xiaohongshu',
                success: true,
                postId: noteId,
                postUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : undefined,
                draftOnly: true,
                message: '已发布到小红书草稿，请前往 creator.xiaohongshu.com 确认',
                timestamp: Date.now(),
              }
            }
            throw new Error(res.msg || `code=${res.code}`)
          }

          if (resp.status === 401) {
            throw new Error('请先在浏览器中访问 creator.xiaohongshu.com 激活会话，再回来重试')
          }

          throw new Error(`HTTP ${resp.status}: ${text.slice(0, 120)}`)
        } catch (e) {
          // Only rethrow if it's our own descriptive error
          if ((e as Error).message.includes('请先') || (e as Error).message.startsWith('HTTP')) {
            throw e
          }
          // Otherwise try next endpoint
        }
      }

      throw new Error('小红书发布失败：所有 API 端点均不可用')
    }).catch((e: unknown) => ({
      platform: 'xiaohongshu',
      success: false,
      error: (e as Error).message,
      timestamp: Date.now(),
    }))
  }
}
