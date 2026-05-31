/**
 * 小红书适配器
 *
 * 小红书创作者中心对跨域 XHR 很敏感，这里走页面自动化：
 * 打开长文发布页、填写内容、尝试排版并点击发布。
 */
import { BaseAdapter } from '../platform-adapters/adapters/base'
import type { PublishOptions } from '../platform-adapters/adapters/types'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '../platform-adapters/types'

const XHS_PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official&target=article'

interface XiaohongshuPublishDraftRef {
  postId: string
  postUrl?: string
  article?: Article
}

interface XiaohongshuAutomationPayload {
  title: string
  body: string
}

interface XiaohongshuAutomationResult {
  staged: boolean
  postUrl?: string
  message?: string
}

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
      const sessionV2 = await this.runtime.getCookie('.xiaohongshu.com', 'web_session_v2')
      if (session || sessionV2) return { isAuthenticated: true }
    }
    return { isAuthenticated: false }
  }

  async publish(article: Article, options?: PublishOptions): Promise<SyncResult> {
    return this.publishThroughCreator(article, {
      active: options?.draftOnly !== true,
      draftOnly: true,
    })
  }

  async publishExistingDraft(draftRef: XiaohongshuPublishDraftRef): Promise<SyncResult> {
    if (!draftRef.article) {
      return this.createResult(false, {
        postId: draftRef.postId,
        postUrl: draftRef.postUrl ?? XHS_PUBLISH_URL,
        draftOnly: true,
        error: '小红书页面自动化需要原始文章内容，无法只凭本地草稿引用发布。',
      })
    }

    return this.publishThroughCreator(draftRef.article, {
      active: true,
      draftOnly: true,
      draftId: draftRef.postId,
      postUrl: draftRef.postUrl,
    })
  }

  private async publishThroughCreator(
    article: Article,
    options: { draftOnly: boolean; active?: boolean; draftId?: string; postUrl?: string }
  ): Promise<SyncResult> {
    const draftId = options.draftId ?? this.createLocalDraftId()
    const publishUrl = options.postUrl && options.postUrl.startsWith('https://creator.xiaohongshu.com/')
      ? options.postUrl
      : XHS_PUBLISH_URL

    try {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书（www.xiaohongshu.com 或 creator.xiaohongshu.com）')
      if (!this.runtime.tabs) throw new Error('当前运行时不支持页面自动化，无法自动发布小红书')

      const tab = await this.runtime.tabs.create(publishUrl, options.active ?? !options.draftOnly)
      if (!tab?.id) throw new Error('无法打开小红书创作者发布页')

      try {
        await this.runtime.tabs.waitForLoad(tab.id, 30000)
      } catch {
        // 小红书是 SPA，load 事件不总是可靠，超时后继续尝试注入。
      }

      const payload = this.toAutomationPayload(article)
      const executeScript = this.runtime.tabs.executeScript as <T, A extends unknown[]>(
        tabId: number,
        func: (...args: A) => T | Promise<T>,
        args: A,
        world?: 'ISOLATED' | 'MAIN'
      ) => Promise<T>

      const result = await executeScript<XiaohongshuAutomationResult, [XiaohongshuAutomationPayload]>(
        tab.id,
        async (payload: XiaohongshuAutomationPayload): Promise<XiaohongshuAutomationResult> => {
          const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
          const normalize = (value: string) => value.replace(/\s+/g, '')
          const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect()
            const style = window.getComputedStyle(element)
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          }
          const textOf = (element: Element) => normalize(
            (element as HTMLElement).innerText ||
            element.textContent ||
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.getAttribute('placeholder') ||
            ''
          )
          const isDisabled = (element: HTMLElement) => {
            return Boolean(
              (element as HTMLButtonElement).disabled ||
              element.getAttribute('aria-disabled') === 'true' ||
              /\bdisabled\b/i.test(String(element.className))
            )
          }
          const collectMessages = () => {
            const selectors = [
              '[role="alert"]',
              '[class*="toast"]',
              '[class*="Toast"]',
              '[class*="message"]',
              '[class*="Message"]',
              '[class*="modal"]',
              '[class*="Modal"]',
              '[class*="dialog"]',
              '[class*="Dialog"]',
              '[class*="error"]',
              '[class*="Error"]',
            ]
            const texts = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
              .filter(isVisible)
              .map(textOf)
              .filter(text => text && text.length <= 220)
            return Array.from(new Set(texts)).slice(0, 8).join('；')
          }
          const click = (element: HTMLElement) => {
            element.scrollIntoView({ block: 'center', inline: 'center' })
            element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }))
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
            element.click()
          }
          const findButton = (labels: string[], ignoredParts: string[] = []) => {
            const normalizedLabels = labels.map(normalize)
            const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [class*="btn"], [class*="Button"]'))
              .filter(isVisible)
              .map(element => element as HTMLElement)
              .filter(element => !isDisabled(element))

            const scored = candidates.map(element => {
              const text = textOf(element)
              if (!text || ignoredParts.some(part => text.includes(normalize(part)))) {
                return { element, score: Number.POSITIVE_INFINITY }
              }

              const exactIndex = normalizedLabels.findIndex(label => text === label)
              if (exactIndex >= 0) return { element, score: exactIndex }

              const includeIndex = normalizedLabels.findIndex(label => text.includes(label) && text.length <= label.length + 6)
              if (includeIndex >= 0) {
                const primaryBias = /primary|submit|confirm|red|active/i.test(String(element.className)) ? -0.25 : 0
                return { element, score: normalizedLabels.length + includeIndex + primaryBias }
              }

              return { element, score: Number.POSITIVE_INFINITY }
            })
              .filter(item => Number.isFinite(item.score))
              .sort((a, b) => a.score - b.score)

            return scored[0]?.element
          }
          const clickButton = (labels: string[], ignoredParts: string[] = []) => {
            const button = findButton(labels, ignoredParts)
            if (!button) return false
            click(button)
            return true
          }
          const setInputValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
            const setter = element instanceof HTMLTextAreaElement
              ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
              : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

            if (setter) setter.call(element, value)
            else element.value = value

            element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
          }
          const setEditableValue = (element: HTMLElement, value: string) => {
            element.focus()
            const selection = window.getSelection()
            const range = document.createRange()
            range.selectNodeContents(element)
            range.collapse(false)
            selection?.removeAllRanges()
            selection?.addRange(range)

            const inserted = document.execCommand?.('insertText', false, value)
            if (!inserted || normalize(element.innerText || element.textContent || '') !== normalize(value)) {
              element.textContent = value
            }

            element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
          }
          const findTitleField = () => {
            const selectors = [
              'input[placeholder*="标题"]',
              'textarea[placeholder*="标题"]',
              'input[aria-label*="标题"]',
              '[class*="title"] input',
              '[class*="Title"] input',
              '#title',
              '[data-testid*="title"]',
            ]
            return selectors
              .flatMap(selector => Array.from(document.querySelectorAll(selector)))
              .filter(isVisible)[0] as HTMLInputElement | HTMLTextAreaElement | undefined
          }
          const findBodyField = () => {
            const selectors = [
              'textarea[placeholder*="正文"]',
              'textarea[placeholder*="内容"]',
              '[contenteditable="true"][data-placeholder*="正文"]',
              '[contenteditable="true"][data-placeholder*="内容"]',
              '[contenteditable="true"]',
              '[role="textbox"]',
              '.ProseMirror',
              '[class*="editor"]',
              '[class*="Editor"]',
              '[data-testid*="content"]',
            ]
            return selectors
              .flatMap(selector => Array.from(document.querySelectorAll(selector)))
              .filter(isVisible)
              .find(element => {
                const text = textOf(element)
                return !text.includes('标题') && !text.includes('搜索')
              }) as HTMLElement | HTMLTextAreaElement | undefined
          }
          const setFieldValue = (element: HTMLElement | HTMLInputElement | HTMLTextAreaElement, value: string) => {
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
              setInputValue(element, value)
            } else {
              setEditableValue(element, value)
            }
          }
          for (let i = 0; i < 10; i++) {
            const titleField = findTitleField()
            const bodyField = findBodyField()
            if (titleField && bodyField) break

            clickButton(['新的创作', '新建创作', '开始创作', '写长文', '发布笔记'], ['导入链接', '管理', '记录'])
            await sleep(1000)
          }

          const titleField = findTitleField()
          const bodyField = findBodyField()
          if (!titleField || !bodyField) {
            return {
              staged: false,
              postUrl: location.href,
              message: collectMessages() || '未找到小红书标题或正文编辑区域',
            }
          }

          setFieldValue(titleField, payload.title)
          await sleep(300)
          setFieldValue(bodyField, payload.body)
          await sleep(1200)

          return {
            staged: true,
            postUrl: location.href,
            message: collectMessages() || '已导入小红书文章，停在一键排版前，请在页面手动继续排版和发布',
          }
        },
        [payload],
        'MAIN'
      )

      if (!result.staged) {
        return this.createResult(false, {
          postId: draftId,
          postUrl: result.postUrl ?? publishUrl,
          draftOnly: true,
          error: result.message ?? '小红书页面填写失败',
        })
      }

      return this.createResult(true, {
        postId: draftId,
        postUrl: result.postUrl ?? publishUrl,
        draftOnly: true,
        message: result.message ?? '已导入小红书文章，停在一键排版前，请在页面手动继续排版和发布',
      })
    } catch (error) {
      return this.createResult(false, {
        postId: draftId,
        postUrl: publishUrl,
        draftOnly: true,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private toAutomationPayload(article: Article): XiaohongshuAutomationPayload {
    const body = this.buildBodyText(article)
    return {
      title: article.title || '无标题',
      body,
    }
  }

  private buildBodyText(article: Article): string {
    const text = (article.markdown || this.htmlToText(article.html ?? '') || article.summary || article.title || '').trim()
    const tags = (article.tags ?? [])
      .map(tag => tag.trim())
      .filter(Boolean)
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`)

    if (!tags.length) return text
    const tagLine = tags.join(' ')
    return text.includes(tagLine) ? text : `${text}\n\n${tagLine}`.trim()
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private createLocalDraftId(): string {
    return `xhs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
