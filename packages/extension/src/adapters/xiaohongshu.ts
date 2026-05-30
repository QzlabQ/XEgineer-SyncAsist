/**
 * 小红书适配器
 * 通过 creator.xiaohongshu.com 发布图文笔记草稿
 *
 * API 说明：
 * - 登录检测：GET /api/galaxy/creator/home/user/info
 * - 发布笔记：POST /api/galaxy/creator/note/post
 * 均需要 Origin/Referer header 才能通过 CORS
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
    urlFilter: '*://www.xiaohongshu.com/*',
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
    return this.withHeaderRules(HEADER_RULES, async () => {
      try {
        // Primary: check via main site (most users are logged in here)
        const resp = await this.runtime.fetch(
          'https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo',
          {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          }
        )
        if (resp.ok) {
          const data = await resp.json() as {
            success?: boolean
            data?: {
              basic_info?: { nickname?: string; imageb?: string }
              extra_info?: { fid?: string }
              user_id?: string
              nickname?: string
              avatar?: string
            }
          }
          const userId = data.data?.user_id || data.data?.extra_info?.fid
          if (data.success && userId) {
            return {
              isAuthenticated: true,
              userId,
              username: data.data?.nickname ?? data.data?.basic_info?.nickname,
              avatar: data.data?.avatar ?? data.data?.basic_info?.imageb,
            }
          }
        }

        // Fallback: creator platform
        const cResp = await this.runtime.fetch(
          'https://creator.xiaohongshu.com/web_api/sns/v1/user/me',
          {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          }
        )
        if (cResp.ok) {
          const cData = await cResp.json() as {
            success?: boolean
            data?: { user_id?: string; nickname?: string; avatar?: string }
          }
          if (cData.success && cData.data?.user_id) {
            return {
              isAuthenticated: true,
              userId: cData.data.user_id,
              username: cData.data.nickname,
              avatar: cData.data.avatar,
            }
          }
        }

        return { isAuthenticated: false }
      } catch {
        return { isAuthenticated: false }
      }
    })
  }

  async publish(article: Article): Promise<SyncResult> {
    return this.withHeaderRules(HEADER_RULES, async () => {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书创作者平台（creator.xiaohongshu.com）')

      const tags = (article.tags ?? []).map(t => ({ name: t, type: 1 }))
      const desc = [
        article.markdown || article.title,
        (article.tags ?? []).map(t => `#${t}`).join(' '),
      ].filter(Boolean).join('\n\n')

      const body = {
        type: 1,
        title: article.title,
        desc,
        ats: [],
        hash_tag: tags,
        image_info_list: [],
        is_private: false,
        post_loc: {},
        business_binds: {},
      }

      const resp = await this.runtime.fetch(
        'https://creator.xiaohongshu.com/api/galaxy/creator/note/post',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
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
          message: '已发布到小红书（草稿），请前往创作者平台确认',
          timestamp: Date.now(),
        }
      }

      throw new Error(res.msg ?? `发布失败 (code: ${res.code})`)
    }).catch((e: unknown) => ({
      platform: 'xiaohongshu',
      success: false,
      error: (e as Error).message,
      timestamp: Date.now(),
    }))
  }
}
