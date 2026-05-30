/**
 * 小红书适配器
 *
 * API 路径提取自 creator.xiaohongshu.com 的 JS bundle：
 * - 用户信息: GET  api/galaxy/creator/home/personal_info
 * - 发布笔记: POST web_api/sns/v2/note
 * - 图片上传: POST api/media/v1/upload/creator/permit
 *
 * 通过注入脚本到页面 MAIN world 调用 API，复用页面 cookie 和 origin。
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
    if (this.runtime.getCookie) {
      const session = await this.runtime.getCookie('.xiaohongshu.com', 'web_session')
      if (!session) return { isAuthenticated: false }
    } else {
      return { isAuthenticated: false }
    }

    // Try to get user info via page injection
    if (!this.runtime.tabs) return { isAuthenticated: true }

    try {
      const tab = await this.runtime.tabs.create('https://creator.xiaohongshu.com', false)
      if (!tab?.id) return { isAuthenticated: true }
      try { await this.runtime.tabs.waitForLoad(tab.id, 10000) } catch { /* proceed */ }

      const info = await this.runtime.tabs.executeScript<
        [],
        { userId?: string; nickname?: string; avatar?: string } | null
      >(
        tab.id,
        () => (async () => {
          try {
            // galaxy API is on creator.xiaohongshu.com
            const resp = await fetch('https://creator.xiaohongshu.com/api/galaxy/creator/home/personal_info', {
              credentials: 'include',
              headers: { Accept: 'application/json' },
            })
            if (!resp.ok) return null
            const data = await resp.json() as {
              success?: boolean; code?: number
              data?: { user_id?: string; nickname?: string; avatar?: string; imageb?: string }
            }
            if ((data.success || data.code === 0) && data.data) {
              const d = data.data
              return d.user_id ? { userId: d.user_id, nickname: d.nickname, avatar: d.avatar ?? d.imageb } : null
            }
            return null
          } catch { return null }
        })(),
        [],
        'MAIN'
      )
      try { chrome.tabs.remove(tab.id) } catch { /* ok */ }
      if (info?.userId) {
        return { isAuthenticated: true, userId: info.userId, username: info.nickname, avatar: info.avatar }
      }
    } catch { /* proceed with cookie-only auth */ }

    return { isAuthenticated: true }
  }

  async publish(article: Article): Promise<SyncResult> {
    try {
      if (!this.runtime.tabs) throw new Error('tabs API unavailable')

      const tags = (article.tags ?? []).map(t => ({ name: t, type: 1 }))
      const desc = [
        article.markdown || article.title || '',
        (article.tags ?? []).map(t => '#' + t).join(' '),
      ].filter(Boolean).join('\n\n')

      // Step 1: Open creator page (background) — triggers SSO, sets session
      const tab = await this.runtime.tabs.create('https://creator.xiaohongshu.com', false)
      if (!tab?.id) throw new Error('无法打开创作者平台')
      try { await this.runtime.tabs.waitForLoad(tab.id, 15000) } catch {
        throw new Error('小红书创作者平台加载超时')
      }

      // Step 2: Inject publish script in MAIN world
      const result = await this.runtime.tabs.executeScript<
        [string, string, Array<{name: string; type: number}>],
        { success: boolean; noteId?: string; error?: string }
      >(
        tab.id,
        (title: string, descText: string, hashTags: Array<{name: string; type: number}>) => (async () => {
          // edith.xiaohongshu.com = sns/web_api gateway (confirmed 401 = exists, needs auth)
          // creator.xiaohongshu.com = galaxy API gateway
          const E = 'https://edith.xiaohongshu.com'
          const C = 'https://creator.xiaohongshu.com'

          const attempts = [
            // Create new note (edith gateway)
            { url: E + '/web_api/sns/v2/note', method: 'POST', body: JSON.stringify({ title, desc: descText, type: 1, note_type: 1, hash_tag: hashTags, image_info_list: [], ats: [], is_private: false, post_loc: {}, business_binds: {} }) },
            // v1 create
            { url: E + '/api/sns/v1/note', method: 'POST', body: JSON.stringify({ title, desc: descText, type: 1, hash_tag: hashTags, image_info_list: [], ats: [], post_loc: {} }) },
            // Galaxy create
            { url: C + '/api/galaxy/creator/note/post', method: 'POST', body: JSON.stringify({ title, desc: descText, type: 1, hash_tag: hashTags, ats: [], image_info_list: [], is_private: false, post_loc: {}, business_binds: {} }) },
          ]

          for (const {url, method, body} of attempts) {
            try {
              // Use XHR (like Axios) instead of fetch — 406 may be from fetch-specific headers
              const result = await new Promise<{ok: boolean; status: number; text: string}>((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open(method, url, true)
                xhr.withCredentials = true
                xhr.setRequestHeader('Content-Type', 'application/json')
                xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText })
                xhr.onerror = () => reject(new Error('XHR failed'))
                xhr.send(body)
              })
              if (result.status === 404) continue
              if (!result.ok) return { success: false, error: `[${url.split('/')[2]}${new URL(url).pathname}] HTTP ${result.status}: ${result.text.slice(0, 150)}` }
              const data = JSON.parse(result.text) as { success?: boolean; code?: number; msg?: string; data?: { note_id?: string; id?: string; noteId?: string } }
              if (data.success || data.code === 0) {
                const id = data.data?.note_id ?? data.data?.id ?? data.data?.noteId ?? ''
                return { success: true, noteId: id }
              }
              return { success: false, error: data.msg || `code=${data.code}` }
            } catch (e) { /* try next */ }
          }
          return { success: false, error: '所有 API 路径都不可用 (edith + creator)' }
        })(),
        [article.title || '无标题', desc, tags],
        'MAIN'
      )

      // Close tab
      try { chrome.tabs.remove(tab.id!) } catch { /* ok */ }

      if (result?.success) {
        const noteId = result.noteId ?? ''
        return {
          platform: 'xiaohongshu',
          success: true,
          postId: noteId,
          postUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : undefined,
          draftOnly: true,
          message: '已发布到小红书草稿，请前往创作者平台确认发布',
          timestamp: Date.now(),
        }
      }

      throw new Error(result?.error || '小红书发布失败')
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
