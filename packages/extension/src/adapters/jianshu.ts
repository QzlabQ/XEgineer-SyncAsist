/**
 * 简书适配器
 * 通过 www.jianshu.com API 发布文章草稿
 */
import { CodeAdapter } from '@wechatsync/core/adapters/code-adapter'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core/types'

const HEADER_RULES = [
  {
    urlFilter: '*://www.jianshu.com/*',
    headers: {
      'Origin': 'https://www.jianshu.com',
      'Referer': 'https://www.jianshu.com/',
    },
    resourceTypes: ['xmlhttprequest'],
  },
]

export class JianshuAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'jianshu',
    name: '简书',
    icon: 'https://www.jianshu.com/favicon.ico',
    homepage: 'https://www.jianshu.com',
    capabilities: ['article', 'draft'],
  }

  async checkAuth(): Promise<AuthResult> {
    return this.withHeaderRules(HEADER_RULES, async () => {
      try {
        const resp = await this.runtime.fetch(
          'https://www.jianshu.com/users/self',
          {
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
          }
        )
        if (!resp.ok) return { isAuthenticated: false }
        const data = await resp.json() as {
          id?: number
          nickname?: string
          avatar?: string
        }
        if (data.id) {
          return {
            isAuthenticated: true,
            userId: String(data.id),
            username: data.nickname,
            avatar: data.avatar,
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
      if (!auth.isAuthenticated) throw new Error('请先登录简书')

      // 获取默认文集
      const notebooksResp = await this.runtime.fetch(
        'https://www.jianshu.com/author/notebooks',
        {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      )
      if (!notebooksResp.ok) throw new Error('获取简书文集失败，请确认已登录')

      const notebooks = await notebooksResp.json() as Array<{ id: number; name: string }>
      if (!notebooks.length) throw new Error('未找到简书文集')
      const notebookId = notebooks[0].id

      // 创建草稿
      const createResp = await this.runtime.fetch(
        `https://www.jianshu.com/author/notebooks/${notebookId}/notes`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({ title: article.title }),
        }
      )
      if (!createResp.ok) throw new Error('创建简书草稿失败')

      const note = await createResp.json() as { id: number }
      const noteId = note.id

      // 写入内容
      await this.runtime.fetch(
        `https://www.jianshu.com/author/notes/${noteId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            title: article.title,
            content: article.markdown || article.title,
            content_updated_at: Math.floor(Date.now() / 1000),
          }),
        }
      )

      return {
        platform: 'jianshu',
        success: true,
        postId: String(noteId),
        postUrl: `https://www.jianshu.com/writer#/notebooks/${notebookId}/notes/${noteId}`,
        draftOnly: true,
        message: '已保存到简书草稿箱，请前往简书编辑器确认发布',
        timestamp: Date.now(),
      }
    }).catch((e: unknown) => ({
      platform: 'jianshu',
      success: false,
      error: (e as Error).message,
      timestamp: Date.now(),
    }))
  }
}
