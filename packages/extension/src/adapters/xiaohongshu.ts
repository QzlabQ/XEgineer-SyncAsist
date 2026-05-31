/**
 * 小红书适配器
 *
 * 小红书创作者中心对跨域 XHR 很敏感，这里走页面自动化：
 * 打开长文发布页、填写内容、尝试排版并点击发布。
 */
import { BaseAdapter } from '@wechatsync/core/adapters/base'
import type { PublishOptions } from '@wechatsync/core/adapters/types'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core/types'

const XHS_PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official&target=article'

interface XiaohongshuPublishDraftRef {
  postId: string
  postUrl?: string
  article?: Article
}

interface XiaohongshuAutomationPayload {
  title: string
  body: string
  draftOnly: boolean
}

interface XiaohongshuAutomationResult {
  staged: boolean
  published: boolean
  clickedPublish: boolean
  postId?: string
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
      draftOnly: options?.draftOnly === true,
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
      draftOnly: false,
      draftId: draftRef.postId,
      postUrl: draftRef.postUrl,
    })
  }

  private async publishThroughCreator(
    article: Article,
    options: { draftOnly: boolean; draftId?: string; postUrl?: string }
  ): Promise<SyncResult> {
    const draftId = options.draftId ?? this.createLocalDraftId()
    const publishUrl = options.postUrl && options.postUrl.startsWith('https://creator.xiaohongshu.com/')
      ? options.postUrl
      : XHS_PUBLISH_URL

    try {
      const auth = await this.checkAuth()
      if (!auth.isAuthenticated) throw new Error('请先登录小红书（www.xiaohongshu.com 或 creator.xiaohongshu.com）')
      if (!this.runtime.tabs) throw new Error('当前运行时不支持页面自动化，无法自动发布小红书')

      const tab = await this.runtime.tabs.create(publishUrl, !options.draftOnly)
      if (!tab?.id) throw new Error('无法打开小红书创作者发布页')

      try {
        await this.runtime.tabs.waitForLoad(tab.id, 30000)
      } catch {
        // 小红书是 SPA，load 事件不总是可靠，超时后继续尝试注入。
      }

      const payload = this.toAutomationPayload(article, options.draftOnly)
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
          const pageText = () => normalize(document.body?.innerText || '')
          const hasAny = (text: string, labels: string[]) => labels.some(label => text.includes(normalize(label)))
          const successLabels = ['发布成功', '发表成功', '发布完成', '笔记发布成功', '审核中', '已提交审核']
          const blockedLabels = ['请登录', '登录', '验证码', '安全验证', '实名认证', '风险', '风控', '频繁', '内容不能为空', '标题不能为空']
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
          const findUncheckedConsent = () => {
            const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[]
            return inputs.find(input => isVisible(input) && !input.checked)
          }
          const extractPostId = () => {
            const match = location.href.match(/(?:explore|discovery\/item|note|notes)\/([A-Za-z0-9_-]+)/i)
            return match?.[1]
          }
          const isPublished = () => {
            return hasAny(collectMessages(), successLabels) || Boolean(extractPostId())
          }
          const isBlocked = () => {
            const statusText = `${collectMessages()}；${pageText()}`
            return hasAny(statusText, blockedLabels)
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
              published: false,
              clickedPublish: false,
              postUrl: location.href,
              message: collectMessages() || '未找到小红书标题或正文编辑区域',
            }
          }

          setFieldValue(titleField, payload.title)
          await sleep(300)
          setFieldValue(bodyField, payload.body)
          await sleep(1200)

          clickButton(['一键排版', '智能排版', '生成排版'], ['教程', '帮助'])
          await sleep(2500)

          for (let i = 0; i < 8; i++) {
            const clickedNext = clickButton(['下一步', '继续', '去发布', '发布设置'], ['上一步', '教程', '帮助'])
            if (clickedNext) await sleep(1800)

            const publishButton = findButton(['发布图文', '发布笔记', '发布', '发表', '确认发布'], ['草稿', '预览', '管理', '记录'])
            if (publishButton || payload.draftOnly) break
            await sleep(1000)
          }

          const finalTitle = findTitleField()
          if (finalTitle) setFieldValue(finalTitle, payload.title)

          const finalBody = findBodyField()
          if (finalBody) setFieldValue(finalBody, payload.body)

          if (payload.draftOnly) {
            clickButton(['保存草稿', '暂存草稿', '存为草稿', '保存'], ['发布', '删除'])
            await sleep(1200)
            return {
              staged: true,
              published: false,
              clickedPublish: false,
              postUrl: location.href,
              message: collectMessages() || '已完成小红书页面填写，等待定时发布',
            }
          }

          let clickedPublish = false
          for (let i = 0; i < 18; i++) {
            if (isPublished()) {
              return {
                staged: true,
                published: true,
                clickedPublish,
                postId: extractPostId(),
                postUrl: location.href,
                message: collectMessages() || '小红书页面提示发布成功',
              }
            }

            if (isBlocked()) {
              return {
                staged: true,
                published: false,
                clickedPublish,
                postUrl: location.href,
                message: collectMessages() || '小红书页面出现登录/验证/风控提示',
              }
            }

            const checkbox = findUncheckedConsent()
            if (checkbox) checkbox.click()

            if (clickButton(['发布图文', '发布笔记', '发布', '发表', '确认发布', '确定发布'], ['草稿', '预览', '管理', '记录'])) {
              clickedPublish = true
            }

            await sleep(1500)
          }

          return {
            staged: true,
            published: isPublished(),
            clickedPublish,
            postId: extractPostId(),
            postUrl: location.href,
            message: collectMessages() || (clickedPublish ? '已点击小红书发布按钮，但未检测到成功提示' : '未找到小红书最终发布按钮'),
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

      if (options.draftOnly) {
        return this.createResult(true, {
          postId: draftId,
          postUrl: result.postUrl ?? publishUrl,
          draftOnly: true,
          message: result.message ?? '已完成小红书草稿准备，等待定时发布',
        })
      }

      if (result.published) {
        return this.createResult(true, {
          postId: result.postId ?? draftId,
          postUrl: result.postUrl ?? publishUrl,
          draftOnly: false,
          message: result.message ?? '已通过小红书创作者页面自动发布',
        })
      }

      return this.createResult(false, {
        postId: draftId,
        postUrl: result.postUrl ?? publishUrl,
        draftOnly: true,
        error: result.message ?? '小红书自动发布未确认成功',
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

  private toAutomationPayload(article: Article, draftOnly: boolean): XiaohongshuAutomationPayload {
    const body = this.buildBodyText(article)
    return {
      title: article.title || '无标题',
      body,
      draftOnly,
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
