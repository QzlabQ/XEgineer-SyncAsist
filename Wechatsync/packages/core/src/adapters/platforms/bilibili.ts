/**
 * B站适配器
 */
import { CodeAdapter, type ImageUploadResult } from '../code-adapter'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '../../types'
import type { PublishOptions } from '../types'
import { createLogger } from '../../lib/logger'

const logger = createLogger('Bilibili')

interface BilibiliUserInfo {
  mid: number
  uname: string
  face: string
  isLogin: boolean
}

interface BilibiliDraftResponse {
  code: number
  message?: string
  msg?: string
  data?: { aid: number }
}

export class BilibiliAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'bilibili',
    name: '哔哩哔哩',
    icon: 'https://www.bilibili.com/favicon.ico',
    homepage: 'https://member.bilibili.com/platform/upload/text',
    capabilities: ['article', 'draft', 'image_upload', 'cover'],
  }

  /** 预处理配置: B站使用 HTML，移除外链 */
  readonly preprocessConfig = {
    outputFormat: 'html' as const,
    removeLinks: true,
  }

  private userInfo: BilibiliUserInfo | null = null
  private csrf: string = ''

  /** B站 API 需要的 Header 规则 */
  private readonly HEADER_RULES = [
    {
      urlFilter: '*://api.bilibili.com/*',
      headers: {
        'Origin': 'https://member.bilibili.com',
        'Referer': 'https://member.bilibili.com/',
      },
      resourceTypes: ['xmlhttprequest'],
    },
  ]

  async checkAuth(): Promise<AuthResult> {
    try {
      const res = await this.get<{
        code: number
        data?: BilibiliUserInfo
      }>('https://api.bilibili.com/x/web-interface/nav?build=0&mobi_app=web')

      logger.debug('checkAuth response:', res)

      if (res.code === 0 && res.data?.isLogin) {
        this.userInfo = res.data
        await this.fetchCsrf()

        return {
          isAuthenticated: true,
          userId: String(res.data.mid),
          username: res.data.uname,
          avatar: res.data.face,
        }
      }

      return { isAuthenticated: false }
    } catch (error) {
      logger.debug('checkAuth: not logged in -', error)
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  private async fetchCsrf(): Promise<void> {
    try {
      if (this.runtime.getCookie) {
        const value = await this.runtime.getCookie('.bilibili.com', 'bili_jct')
        this.csrf = value || ''
      }
      logger.debug('CSRF token:', this.csrf ? 'obtained' : 'not found')
    } catch (e) {
      logger.error('Failed to get CSRF:', e)
    }
  }

  async publish(article: Article, options?: PublishOptions): Promise<SyncResult> {
    return this.withHeaderRules(this.HEADER_RULES, async () => {
      logger.info('Starting publish...')

      if (!this.userInfo) {
        const auth = await this.checkAuth()
        if (!auth.isAuthenticated) {
          throw new Error('请先登录B站')
        }
      }

      if (!this.csrf) {
        throw new Error('获取 CSRF token 失败，请刷新页面后重试')
      }

      // Use pre-processed HTML content directly
      let content = article.html || ''
      let fallbackMessage = ''

      content = await this.processImages(
        content,
        (src) => this.uploadImageByUrl(src),
        {
          skipPatterns: ['hdslb.com', 'bilibili.com', 'biliimg.com'],
          onProgress: options?.onImageProgress,
        }
      )

      const sanitizedImages = this.sanitizeContentImages(content)
      content = sanitizedImages.content
      if (sanitizedImages.removed > 0) {
        const removedSources = sanitizedImages.removedSources.join('；')
        fallbackMessage = this.appendMessage(
          fallbackMessage,
          `B站不接受 ${sanitizedImages.removed} 张正文图片链接，已先移除以保存草稿；来源：${removedSources}。请在 B站编辑器中手动补图。`
        )
      }

      const coverUrl = await this.resolveCoverImage(article.cover)
      const tags = (article.tags ?? []).map(tag => tag.trim()).filter(Boolean).join(',')
      const category = article.category || '4'

      let res = await this.saveDraft(this.createDraftPayload(article, content, coverUrl, tags, category))

      if (this.isCoverAddressError(res) && coverUrl) {
        logger.warn('Bilibili rejected cover URL, retrying draft save without cover:', res)
        fallbackMessage = this.appendMessage(
          fallbackMessage,
          'B站未接收自动封面，已回退保存为无封面草稿；请在 B站编辑器中手动设置封面。'
        )
        res = await this.saveDraft(this.createDraftPayload(article, content, '', tags, category))
      }

      logger.debug('Draft response:', res)

      if (res.code !== 0 || !res.data?.aid) {
        throw new Error(res.message || '保存草稿失败')
      }

      const draftUrl = `https://member.bilibili.com/platform/upload/text/edit?aid=${res.data.aid}`

      return this.createResult(true, {
        postId: String(res.data.aid),
        postUrl: draftUrl,
        draftOnly: options?.draftOnly ?? true,
        message: fallbackMessage || undefined,
      })
    }).catch((error) => this.createResult(false, {
      error: (error as Error).message,
    }))
  }

  private createDraftPayload(
    article: Article,
    content: string,
    coverUrl: string,
    tags: string,
    category: string
  ): Record<string, string> {
    return {
      tid: category,
      category,
      list_id: '0',
      title: article.title,
      content,
      summary: article.summary ?? '',
      words: this.countWords(content),
      banner_url: coverUrl,
      image_urls: coverUrl,
      origin_image_urls: coverUrl,
      reprint: '0',
      tags,
      dynamic_intro: '',
      media_id: '0',
      spoiler: '0',
      original: '0',
      aid: '',
      csrf: this.csrf,
      save: '0',
      pgc_id: '0',
    }
  }

  private async saveDraft(payload: Record<string, string>): Promise<BilibiliDraftResponse> {
    return this.postForm<BilibiliDraftResponse>(
      'https://api.bilibili.com/x/article/creative/draft/addupdate',
      payload
    )
  }

  private isCoverAddressError(response: BilibiliDraftResponse): boolean {
    if (response.code === 0) return false
    const message = response.message ?? response.msg ?? ''
    return /封面|图片|图像|地址/.test(message)
  }

  private sanitizeContentImages(html: string): { content: string; removed: number; removedSources: string[] } {
    let removed = 0
    const removedSources: string[] = []
    const content = html.replace(
      /<img\b[^>]*\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,
      (match, doubleQuotedSrc: string | undefined, singleQuotedSrc: string | undefined, unquotedSrc: string | undefined) => {
        const src = doubleQuotedSrc ?? singleQuotedSrc ?? unquotedSrc ?? ''
        const normalizedSrc = this.normalizeContentImageSrc(src)
        if (this.isAllowedContentImage(normalizedSrc)) {
          if (normalizedSrc === src) return match
          const quotedNeedle = doubleQuotedSrc !== undefined
            ? `"${src}"`
            : singleQuotedSrc !== undefined
              ? `'${src}'`
              : src
          const quotedReplacement = doubleQuotedSrc !== undefined
            ? `"${normalizedSrc}"`
            : singleQuotedSrc !== undefined
              ? `'${normalizedSrc}'`
              : normalizedSrc
          return match.replace(quotedNeedle, quotedReplacement)
        }

        removed++
        removedSources.push(this.formatImageSourceForMessage(src))
        logger.warn('Removing unsupported Bilibili content image:', src)
        return ''
      }
    )

    return { content, removed, removedSources: Array.from(new Set(removedSources)).slice(0, 3) }
  }

  private normalizeContentImageSrc(src: string): string {
    const trimmed = src.trim()
    if (trimmed.startsWith('//')) return `https:${trimmed}`
    return trimmed
  }

  private isAllowedContentImage(src: string): boolean {
    if (!/^https?:\/\//i.test(src)) return false

    try {
      const hostname = new URL(src).hostname.toLowerCase()
      return (
        hostname === 'hdslb.com' ||
        hostname.endsWith('.hdslb.com') ||
        hostname === 'bilibili.com' ||
        hostname.endsWith('.bilibili.com') ||
        hostname === 'biliimg.com' ||
        hostname.endsWith('.biliimg.com')
      )
    } catch {
      return false
    }
  }

  private formatImageSourceForMessage(src: string): string {
    const trimmed = src.trim()
    if (!trimmed) return '空图片地址'
    if (trimmed.startsWith('data:')) return '内联 base64 图片'
    if (trimmed.startsWith('blob:')) return '浏览器临时 blob 图片'

    try {
      const url = trimmed.startsWith('//') ? new URL(`https:${trimmed}`) : new URL(trimmed)
      const path = url.pathname.length > 36 ? `${url.pathname.slice(0, 36)}...` : url.pathname
      return `${url.hostname}${path}`
    } catch {
      return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed
    }
  }

  private appendMessage(current: string, next: string): string {
    return current ? `${current} ${next}` : next
  }

  private async resolveCoverImage(cover?: string): Promise<string> {
    if (!cover) return ''

    try {
      const coverResult = await this.uploadImageByUrl(cover)
      return this.normalizeBilibiliImageUrl(coverResult.url)
    } catch (error) {
      logger.warn('Failed to upload cover, saving draft without cover:', error)
      return ''
    }
  }

  private countWords(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, '')
      .length
      .toString()
  }

  private normalizeBilibiliImageUrl(url: string): string {
    return url.trim()
  }

  protected async uploadImageByUrl(src: string): Promise<ImageUploadResult> {
    if (!this.csrf) {
      throw new Error('CSRF token 未获取')
    }

    let cover = src
    if (!cover.startsWith('data:')) {
      const imageResponse = await this.runtime.fetch(src)
      if (!imageResponse.ok) {
        throw new Error('图片下载失败: ' + src)
      }
      const imageBlob = await imageResponse.blob()
      cover = await this.blobToDataUri(imageBlob)
    }

    const uploadUrl = 'https://api.bilibili.com/x/article/creative/article/upcover'
    const uploadResponse = await this.runtime.fetch(uploadUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://member.bilibili.com',
        'Referer': 'https://member.bilibili.com/',
      },
      body: new URLSearchParams({ cover }),
    })

    const res = await uploadResponse.json() as {
      code: number
      message?: string
      msg?: string
      data?: {
        url: string
        size?: number
      }
    }

    logger.debug('Image upload response:', res)

    if (res.code !== 0 || !res.data?.url) {
      throw new Error(res.message || res.msg || '图片上传失败')
    }

    const attrs = res.data.size ? { size: String(res.data.size) } : undefined
    return {
      url: this.normalizeBilibiliImageUrl(res.data.url),
      attrs,
    }
  }
}
