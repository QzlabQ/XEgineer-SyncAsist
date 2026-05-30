/**
 * 小红书适配器
 *
 * Xiaohongshu API 使用专利请求签名（x-s/x-t/x-s-common），从 Service Worker
 * 直接调用不可行。Wechatsync 的私有适配器也使用签名算法才能工作。
 *
 * 当前方案：cookie 检测登录 + 打开创作者平台 + 剪贴板辅助粘贴。
 */
import { CodeAdapter } from '@wechatsync/core/adapters/code-adapter'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core/types'

export class XiaohongshuAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'xiaohongshu',
    name: '小红书',
    icon: 'https://www.xiaohongshu.com/favicon.ico',
    homepage: 'https://creator.xiaohongshu.com',
    capabilities: ['article', 'draft', 'tags'],
  }

  async checkAuth(): Promise<AuthResult> {
    let hasSession = false
    if (this.runtime.getCookie) {
      const session = await this.runtime.getCookie('.xiaohongshu.com', 'web_session')
      hasSession = !!session
    }
    if (hasSession) {
      return { isAuthenticated: true }
    }
    return { isAuthenticated: false }
  }

  async publish(article: Article): Promise<SyncResult> {
    try {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书（www.xiaohongshu.com）')

      // Renderer already produced formatted content (body + #tags)
      const content = article.markdown || article.title || ''

      if (this.runtime.tabs) {
        await this.runtime.tabs.create(
          'https://creator.xiaohongshu.com/publish',
          true
        )
      }

      return {
        platform: 'xiaohongshu',
        success: true,
        draftOnly: true,
        postUrl: 'https://creator.xiaohongshu.com/publish',
        message: content
          ? `已打开小红书创作者平台。内容预览：${content.slice(0, 100)}...`
          : '已打开小红书创作者平台，请在页面中粘贴内容发布',
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
