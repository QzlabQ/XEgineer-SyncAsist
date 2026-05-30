/**
 * 小红书适配器
 *
 * 架构说明：
 * - checkAuth: cookie-based（web_session cookie 存在 = 已登录）
 * - 用户信息: 从 edith.xiaohongshu.com API 获取（新版编辑器平台，与主站共享 session）
 * - publish: 调用 edith.xiaohongshu.com 的 API 发布笔记草稿
 *
 * edith.xiaohongshu.com 是小红书新版网页编辑器，与主站共用 session cookie，
 * API 要求相对宽松。galaxy/creator 是旧版创作者平台，API 路径可能已变更。
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
    homepage: 'https://www.xiaohongshu.com',
    capabilities: ['article', 'draft', 'tags'],
  }

  private userInfo: { userId: string; nickname: string } | null = null

  async checkAuth(): Promise<AuthResult> {
    // Step 1: cookie-based detection (zero CORS/API dependency)
    let hasSession = false
    if (this.runtime.getCookie) {
      const session = await this.runtime.getCookie('.xiaohongshu.com', 'web_session')
      hasSession = !!session
    }
    if (!hasSession) {
      // Also try without leading dot
      if (this.runtime.getCookie) {
        const session = await this.runtime.getCookie('xiaohongshu.com', 'web_session')
        hasSession = !!session
      }
    }
    if (!hasSession) return { isAuthenticated: false }

    // Step 2: try to get user profile (best-effort, auth is still valid without it)
    return this.withHeaderRules(HEADER_RULES, async () => {
      // Try edith first (new editor, same session)
      const endpoints = [
        'https://edith.xiaohongshu.com/api/sns/web/v1/user/me',
        'https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo',
      ]
      for (const url of endpoints) {
        try {
          const resp = await this.runtime.fetch(url, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })
          if (!resp.ok) continue
          const data = await resp.json() as {
            success?: boolean
            data?: {
              user_id?: string; nickname?: string; avatar?: string
              basic_info?: { nickname?: string; imageb?: string }
            }
          }
          const user = data.data
          if (data.success && user) {
            const userId = user.user_id ?? ''
            const nickname = user.nickname ?? user.basic_info?.nickname ?? ''
            if (userId) {
              this.userInfo = { userId, nickname }
              return {
                isAuthenticated: true,
                userId,
                username: nickname || undefined,
                avatar: user.avatar ?? user.basic_info?.imageb,
              }
            }
          }
        } catch { /* continue */ }
      }

      // Auth valid but couldn't get profile — still return authenticated
      return {
        isAuthenticated: true,
        userId: 'xhs_user',
        username: '小红书用户',
      }
    }).catch(() => ({
      // withHeaderRules itself failed, but cookie check passed
      isAuthenticated: true,
      userId: 'xhs_user',
    }))
  }

  async publish(article: Article): Promise<SyncResult> {
    return this.withHeaderRules(HEADER_RULES, async () => {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书（www.xiaohongshu.com）')

      const tags = article.tags ?? []
      const descBody = article.markdown || article.title || ''
      const tagLine = tags.map(t => `#${t}`).join(' ')
      const desc = [descBody, tagLine].filter(Boolean).join('\n\n')

      // Try edith API (new editor platform) first
      const publishUrls = [
        'https://edith.xiaohongshu.com/api/sns/web/v1/note',
        'https://creator.xiaohongshu.com/api/galaxy/creator/note/post',
      ]

      let lastError = ''
      let lastStatus = 0

      for (const url of publishUrls) {
        try {
          const body = url.includes('edith')
            ? { title: article.title, desc, type: 1, note_type: 1, post_loc: {} }
            : { title: article.title, desc, type: 1, hash_tag: tags.map(t => ({ name: t, type: 1 })), ats: [], image_info_list: [], is_private: false, post_loc: {}, business_binds: {} }

          const resp = await this.runtime.fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          })

          lastStatus = resp.status
          const text = await resp.text()

          if (resp.ok) {
            try {
              const res = JSON.parse(text) as {
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
                  message: noteId ? '已发布到小红书，请前往确认' : '已发布到小红书草稿',
                  timestamp: Date.now(),
                }
              }
              lastError = res.msg ?? `code=${res.code}`
            } catch {
              lastError = `unexpected response: ${text.slice(0, 200)}`
            }
          } else {
            lastError = `HTTP ${resp.status}: ${text.slice(0, 200)}`
          }
        } catch (e) {
          lastError = (e as Error).message
        }
      }

      throw new Error(`小红书发布失败（${lastStatus ? `HTTP ${lastStatus}` : ''}${lastError ? `: ${lastError}` : ''}）`)
    }).catch((e: unknown) => ({
      platform: 'xiaohongshu',
      success: false,
      error: (e as Error).message.replace(/^.*?:\s*/, ''),
      timestamp: Date.now(),
    }))
  }
}
