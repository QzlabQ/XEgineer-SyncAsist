/**
 * 小红书适配器
 *
 * XHR API 调用被 406 阻止（服务器拒绝跨域请求）。
 * 改用页面自动化：打开 creator.xiaohongshu.com 发布页，注入脚本填写表单并触发保存。
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
      if (session) return { isAuthenticated: true }
    }
    return { isAuthenticated: false }
  }

  async publish(article: Article): Promise<SyncResult> {
    try {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书（www.xiaohongshu.com）')

      if (!this.runtime.tabs) throw new Error('tabs API unavailable')

      // Open creator publish page — opens in foreground so user can review
      const tab = await this.runtime.tabs.create(
        'https://creator.xiaohongshu.com/publish',
        true // foreground — let user see and confirm
      )

      if (!tab?.id) throw new Error('无法打开创作者平台')

      // Wait for page to fully load
      try { await this.runtime.tabs.waitForLoad(tab.id, 20000) } catch {
        // Proceed anyway — page might be interactive
      }

      // Inject form-filling script in MAIN world
      try {
        await this.runtime.tabs.executeScript(
          tab.id,
          (title: string, content: string) => {
            // Try to fill the title and content fields on the publish page
            // The page is a Vue SPA — find inputs by placeholder/aria-label/data attributes
            const titleField = document.querySelector(
              'input[placeholder*="标题"], [class*="title"] input, [class*="Title"] input, #title, [data-testid="title"]'
            ) as HTMLInputElement | null

            const contentArea = document.querySelector(
              '[contenteditable="true"], [class*="editor"], [class*="Editor"], #content, [data-testid="content"], textarea'
            ) as HTMLElement | null

            if (titleField) {
              // React/Vue: simulate input event
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
              )?.set
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(titleField, title)
              } else {
                titleField.value = title
              }
              titleField.dispatchEvent(new Event('input', { bubbles: true }))
              titleField.dispatchEvent(new Event('change', { bubbles: true }))
            }

            if (contentArea) {
              contentArea.focus()
              contentArea.textContent = content
              contentArea.dispatchEvent(new Event('input', { bubbles: true }))
              contentArea.dispatchEvent(new Event('change', { bubbles: true }))
            }

            return {
              titleFound: !!titleField,
              contentFound: !!contentArea,
              titleSelector: titleField?.getAttribute('placeholder') || titleField?.className || 'none',
              contentSelector: contentArea?.getAttribute('data-testid') || contentArea?.className || 'none',
            }
          },
          [
            article.title || '无标题',
            (article.markdown || article.title || '') + '\n\n' + (article.tags ?? []).map((t: string) => '#' + t).join(' '),
          ],
          'MAIN'
        )
      } catch (e) {
        // Form filling failed — tab is already open for manual use
      }

      return {
        platform: 'xiaohongshu',
        success: true,
        draftOnly: true,
        postUrl: 'https://creator.xiaohongshu.com/publish',
        message: '已打开小红书创作者发布页。请在页面中确认内容并点击发布',
        timestamp: Date.now(),
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
