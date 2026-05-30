/**
 * 小红书适配器
 * 通过 creator.xiaohongshu.com 发布图文笔记草稿
 */
import { BaseAdapter } from '@wechatsync/core/adapters/base'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core/types'

export class XiaohongshuAdapter extends BaseAdapter {
  readonly meta: PlatformMeta = {
    id: 'xiaohongshu',
    name: '小红书',
    icon: 'https://www.xiaohongshu.com/favicon.ico',
    homepage: 'https://creator.xiaohongshu.com',
    capabilities: ['article', 'draft', 'tags'],
  }

  async checkAuth(): Promise<AuthResult> {
    try {
      const resp = await this.runtime.fetch(
        'https://creator.xiaohongshu.com/api/galaxy/creator/home/user/info',
        { credentials: 'include' }
      )
      if (!resp.ok) return { isAuthenticated: false }
      const data = await resp.json() as {
        success?: boolean
        data?: { userInfo?: { nickname?: string; userId?: string; imageb?: string } }
      }
      if (data.success && data.data?.userInfo?.userId) {
        const u = data.data.userInfo
        return {
          isAuthenticated: true,
          userId: u.userId,
          username: u.nickname,
          avatar: u.imageb,
        }
      }
      return { isAuthenticated: false }
    } catch {
      return { isAuthenticated: false }
    }
  }

  async publish(article: Article): Promise<SyncResult> {
    try {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书创作者平台')

      // 构建正文：标题 + 内容 + 标签
      const tags = (article.tags ?? []).map(t => `#${t}`).join(' ')
      const desc = [article.markdown || article.title, tags].filter(Boolean).join('\n\n')

      const body = {
        type: 1, // 图文
        title: article.title,
        desc,
        ats: [],
        hash_tag: (article.tags ?? []).map(t => ({ name: t, type: 1 })),
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
          headers: { 'Content-Type': 'application/json' },
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

      throw new Error(res.msg ?? '发布失败')
    } catch (e) {
      return {
        platform: 'xiaohongshu',
        success: false,
        error: (e as Error).message,
        timestamp: Date.now(),
      }
    }
  }
}
