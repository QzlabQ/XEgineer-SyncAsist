/**
 * 简书适配器
 * 通过 www.jianshu.com API 发布文章草稿
 */
import { BaseAdapter } from '@wechatsync/core/adapters/base'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core/types'

export class JianshuAdapter extends BaseAdapter {
  readonly meta: PlatformMeta = {
    id: 'jianshu',
    name: '简书',
    icon: 'https://www.jianshu.com/favicon.ico',
    homepage: 'https://www.jianshu.com',
    capabilities: ['article', 'draft'],
  }

  private csrf = ''

  async checkAuth(): Promise<AuthResult> {
    try {
      const resp = await this.runtime.fetch(
        'https://www.jianshu.com/users/self',
        {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        }
      )
      if (!resp.ok) return { isAuthenticated: false }
      const data = await resp.json() as {
        id?: number
        slug?: string
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
  }

  private async getCsrf(): Promise<string> {
    if (this.csrf) return this.csrf
    if (this.runtime.getCookie) {
      const v = await this.runtime.getCookie('jianshu.com', '_m7e_session_core')
      if (v) {
        // 简书用 session cookie 作为 CSRF token 的来源，实际 token 在 meta 标签里
        // 通过 API 获取 token
      }
    }
    // 简书的 CSRF token 通过 cookie 中的 remember_user_token 或直接从页面获取
    // 这里使用 X-CSRF-Token header，值从 cookie 中读取
    const token = await this.runtime.getCookie?.('jianshu.com', 'remember_user_token') ?? ''
    this.csrf = token
    return token
  }

  async publish(article: Article): Promise<SyncResult> {
    try {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录简书')

      // 简书使用 Markdown 格式，通过 /author/notebooks/:id/notes 创建笔记
      // 先获取默认 notebook
      const notebooksResp = await this.runtime.fetch(
        'https://www.jianshu.com/author/notebooks',
        {
          credentials: 'include',
          headers: { Accept: 'application/json' },
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
          },
          body: JSON.stringify({ title: article.title }),
        }
      )

      if (!createResp.ok) throw new Error('创建简书草稿失败')

      const note = await createResp.json() as { id: number; slug?: string }
      const noteId = note.id

      // 更新内容
      const content = article.markdown || article.title
      const updateResp = await this.runtime.fetch(
        `https://www.jianshu.com/author/notes/${noteId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            title: article.title,
            content,
            content_updated_at: Math.floor(Date.now() / 1000),
          }),
        }
      )

      if (!updateResp.ok) throw new Error('更新简书内容失败')

      return {
        platform: 'jianshu',
        success: true,
        postId: String(noteId),
        postUrl: `https://www.jianshu.com/writer#/notebooks/${notebookId}/notes/${noteId}`,
        draftOnly: true,
        message: '已保存到简书草稿箱，请前往简书编辑器确认发布',
        timestamp: Date.now(),
      }
    } catch (e) {
      return {
        platform: 'jianshu',
        success: false,
        error: (e as Error).message,
        timestamp: Date.now(),
      }
    }
  }
}
