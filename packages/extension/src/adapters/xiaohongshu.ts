/**
 * 小红书适配器
 *
 * Xiaohongshu 的 API 需要请求签名（x-s/x-t），无法从 Service Worker 直接调用。
 * 改为：打开 creator.xiaohongshu.com → 注入 script 到页面 → 从页面上下文调 API
 * 这样复用页面的 session cookie、CSRF token 和 JS 生成的签名。
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

  private userInfo: { userId: string; nickname: string } | null = null

  async checkAuth(): Promise<AuthResult> {
    // Cookie-based: check web_session on .xiaohongshu.com
    if (this.runtime.getCookie) {
      const session = await this.runtime.getCookie('.xiaohongshu.com', 'web_session')
      if (!session) return { isAuthenticated: false }
    } else {
      return { isAuthenticated: false }
    }
    return { isAuthenticated: true }
  }

  async publish(article: Article): Promise<SyncResult> {
    try {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书（www.xiaohongshu.com）')

      if (!this.runtime.tabs) throw new Error('tabs API unavailable')

      // Build the note content
      const tags = article.tags ?? []
      const desc = [
        article.markdown || article.title || '',
        tags.map(t => `#${t}`).join(' '),
      ].filter(Boolean).join('\n\n')

      // Open creator page in background tab to trigger SSO and get page context
      const tab = await this.runtime.tabs.create(
        'https://creator.xiaohongshu.com',
        false // background
      )

      if (!tab?.id) throw new Error('Failed to open creator tab')

      // Wait for page to load (SSO may redirect)
      try {
        await this.runtime.tabs.waitForLoad(tab.id, 15000)
      } catch {
        throw new Error('小红书创作者平台加载超时，请检查网络')
      }

      // Inject publish script into the page (MAIN world = page context)
      try {
        const result = await this.runtime.tabs.executeScript<
          [string, Array<{name: string; type: number}>, string],
          { success: boolean; noteId?: string; error?: string }
        >(
          tab.id,
          (title: string, hashTags: Array<{name: string; type: number}>, descText: string) => {
            // Running in page's MAIN world — inherits page's auth context
            return (async () => {
              try {
                const resp = await fetch(
                  'https://creator.xiaohongshu.com/api/galaxy/creator/note/post',
                  {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 1, // 图文
                      title,
                      desc: descText,
                      ats: [],
                      hash_tag: hashTags,
                      image_info_list: [],
                      is_private: false,
                      post_loc: {},
                      business_binds: {},
                    }),
                  }
                )

                if (!resp.ok) {
                  const errText = await resp.text()
                  return { success: false, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` }
                }

                const data = await resp.json() as {
                  success?: boolean; code?: number; msg?: string
                  data?: { id?: string; noteId?: string }
                }

                if (data.success || data.code === 0) {
                  return {
                    success: true,
                    noteId: data.data?.id ?? data.data?.noteId ?? '',
                  }
                }

                return { success: false, error: data.msg || `code=${data.code}` }
              } catch (e) {
                return { success: false, error: (e as Error).message }
              }
            })()
          },
          [article.title || '无标题', tags.map(t => ({ name: t, type: 1 })), desc],
          'MAIN'
        )

        // Close the background tab
        try { chrome.tabs.remove(tab.id) } catch { /* ok */ }

        if (result?.success) {
          const noteId = result.noteId ?? ''
          return {
            platform: 'xiaohongshu',
            success: true,
            postId: noteId,
            postUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : undefined,
            draftOnly: true,
            message: '已发布到小红书草稿，请前往创作者平台确认',
            timestamp: Date.now(),
          }
        }

        throw new Error(result?.error || '发布失败')
      } catch (e) {
        try { chrome.tabs.remove(tab.id!) } catch { /* ok */ }
        throw e
      }
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
