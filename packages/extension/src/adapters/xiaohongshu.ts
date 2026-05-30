/**
 * 小红书适配器
 *
 * 说明：小红书 API 使用请求签名（x-s/x-t），直接调用非常困难。
 * 改为 cookie-based 方案：
 * - checkAuth：检查 web_session cookie 是否存在（最可靠的登录判断）
 * - publish：使用 creator.xiaohongshu.com 的 API 发布草稿
 *
 * Cookie 说明：
 * - web_session：登录后的 session token，存在于 .xiaohongshu.com
 * - a1：用户标识
 * - 只要在浏览器中登录过 www.xiaohongshu.com，则 cookie 可用
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
    urlFilter: '*://edith.xiaohongshu.com/*',
    headers: {
      'Origin': 'https://edith.xiaohongshu.com',
      'Referer': 'https://edith.xiaohongshu.com/',
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

  private userInfo: { userId: string; nickname: string; avatar: string } | null = null

  async checkAuth(): Promise<AuthResult> {
    try {
      // Primary: check for web_session cookie (most reliable indicator)
      if (this.runtime.getCookie) {
        const session = await this.runtime.getCookie('.xiaohongshu.com', 'web_session')
        if (session) {
          // Also try to get user info from cookies
          let nickname = ''
          let avatar = ''
          let userId = ''

          // Try to get user info via a simple API call
          try {
            const resp = await this.runtime.fetch(
              'https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo',
              {
                credentials: 'include',
                headers: {
                  Accept: 'application/json',
                  'X-Requested-With': 'XMLHttpRequest',
                },
              }
            )
            if (resp.ok) {
              const data = await resp.json() as {
                success?: boolean
                data?: {
                  basic_info?: { nickname?: string; imageb?: string }
                  user_id?: string
                }
              }
              if (data.success && data.data) {
                userId = data.data.user_id ?? ''
                nickname = data.data.basic_info?.nickname ?? ''
                avatar = data.data.basic_info?.imageb ?? ''
                this.userInfo = { userId, nickname, avatar }
              }
            }
          } catch {
            // fall through — cookie-based auth is still valid
          }

          if (!userId) {
            // Fallback: try to read user id from a1 cookie
            try {
              const a1 = await this.runtime.getCookie!('.xiaohongshu.com', 'a1')
              if (a1) userId = a1
            } catch {
              userId = 'xiaohongshu_user'
            }
          }

          return {
            isAuthenticated: true,
            userId: userId || 'xiaohongshu_user',
            username: nickname || undefined,
            avatar: avatar || undefined,
          }
        }
      }

      // Fallback: try API-based check
      try {
        const resp = await this.runtime.fetch(
          'https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo',
          {
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
          }
        )
        if (resp.ok) {
          const data = await resp.json() as {
            success?: boolean
            data?: { user_id?: string; basic_info?: { nickname?: string; imageb?: string } }
          }
          if (data.success && data.data?.user_id) {
            return {
              isAuthenticated: true,
              userId: data.data.user_id,
              username: data.data.basic_info?.nickname,
              avatar: data.data.basic_info?.imageb,
            }
          }
        }
      } catch {
        // fall through
      }

      return { isAuthenticated: false }
    } catch {
      return { isAuthenticated: false }
    }
  }

  async publish(article: Article): Promise<SyncResult> {
    return this.withHeaderRules(HEADER_RULES, async () => {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书（www.xiaohongshu.com）')

      // 构建笔记内容：标题 + Markdown 正文 + 话题标签
      const tags = (article.tags ?? []).map(t => `#${t}`).join(' ')
      const desc = [
        article.markdown || article.title,
        tags,
      ].filter(Boolean).join('\n\n')

      // 尝试通过 creator 平台发布
      const resp = await this.runtime.fetch(
        'https://creator.xiaohongshu.com/api/galaxy/creator/note/post',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            type: 1,
            title: article.title,
            desc,
            ats: [],
            hash_tag: (article.tags ?? []).map(t => ({ name: t, type: 1 })),
            image_info_list: [],
            is_private: false,
            post_loc: {},
            business_binds: {},
          }),
        }
      )

      const res = await resp.json() as {
        success?: boolean
        code?: number
        msg?: string
        data?: { id?: string; noteId?: string }
      }

      if (res.success || res.code === 0) {
        const noteId = res.data?.id ?? res.data?.noteId ?? ''
        return {
          platform: 'xiaohongshu',
          success: true,
          postId: noteId,
          postUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : undefined,
          draftOnly: true,
          message: noteId ? '已发布到小红书，请前往创作者平台确认' : '已发布到小红书草稿',
          timestamp: Date.now(),
        }
      }

      throw new Error(res.msg ?? '小红书发布失败')
    }).catch((e: unknown) => ({
      platform: 'xiaohongshu',
      success: false,
      error: (e as Error).message,
      timestamp: Date.now(),
    }))
  }
}
