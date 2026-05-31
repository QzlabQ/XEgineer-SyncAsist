/**
 * 微信公众号适配器
 */
import { CodeAdapter, type ImageUploadResult } from '../code-adapter'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '../../types'
import type { PublishOptions } from '../types'
import { createLogger } from '../../lib/logger'
import juice from 'juice'

const logger = createLogger('Weixin')

interface WeixinMeta {
  token: string
  userName: string
  nickName: string
  ticket: string
  svrTime: number
  avatar: string
}

interface WeixinMassSendSession {
  operationSeq?: string
  requiresSafeScan: boolean
}

interface WeixinMassSendResponse {
  msgid?: string | number
  ret?: number
  err_msg?: string
  base_resp?: {
    ret?: number
    err_msg?: string
  }
}

interface WeixinPagePublishResult {
  attempted: boolean
  clicked: boolean
  confirmed: boolean
  published: boolean
  href: string
  message?: string
}

// 微信公众号的默认 CSS 样式
const WEIXIN_CSS = `
p {
  color: rgb(51, 51, 51);
  font-size: 15px;
  line-height: 1.75em;
  margin: 0 0 1em 0;
}
h1, h2, h3, h4, h5, h6 {
  font-weight: bold;
}
h1 { font-size: 1.25em; line-height: 1.4em; margin: 1em 0 0.5em 0; }
h2 { font-size: 1.125em; margin: 1em 0 0.5em 0; }
h3 { font-size: 1.05em; margin: 0.8em 0 0.4em 0; }
h4, h5, h6 { font-size: 1em; margin: 0.8em 0 0.4em 0; }
li p { margin: 0; }
ul, ol { margin: 1em 0; padding-left: 2em; }
li { margin-bottom: 0.4em; }
pre, tt, code, kbd, samp { font-family: monospace; }
pre { white-space: pre; margin: 1em 0; }
blockquote { border-left: 4px solid #ddd; padding-left: 1em; margin: 1em 0; color: #666; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
i, cite, em, var, address { font-style: italic; }
b, strong { font-weight: bolder; }
`

export class WeixinAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'weixin',
    name: '微信公众号',
    icon: 'https://mp.weixin.qq.com/favicon.ico',
    homepage: 'https://mp.weixin.qq.com',
    capabilities: ['article', 'draft', 'image_upload'],
  }

  /** 预处理配置: 微信公众号使用 HTML 格式，移除非微信域名链接，压缩标签间空白避免 ProseMirror 产生空节点 */
  readonly preprocessConfig = {
    outputFormat: 'html' as const,
    removeLinks: true,
    keepLinkDomains: ['mp.weixin.qq.com', 'weixin.qq.com'],
    compactHtml: true,
  }

  private weixinMeta: WeixinMeta | null = null

  /** 微信公众号 API 需要的 Header 规则 */
  private readonly HEADER_RULES = [
    {
      urlFilter: '*://mp.weixin.qq.com/cgi-bin/*',
      headers: {
        'Origin': 'https://mp.weixin.qq.com',
        'Referer': 'https://mp.weixin.qq.com/',
      },
      resourceTypes: ['xmlhttprequest'],
    },
  ]

  async checkAuth(): Promise<AuthResult> {
    try {
      const response = await this.runtime.fetch(
        'https://mp.weixin.qq.com/',
        {
          method: 'GET',
          credentials: 'include',
        }
      )

      const html = await response.text()

      const tokenMatch = html.match(/data:\s*\{[\s\S]*?t:\s*["']([^"']+)["']/)
      if (!tokenMatch) {
        logger.debug(' No token found')
        return { isAuthenticated: false }
      }

      const ticketMatch = html.match(/ticket:\s*["']([^"']+)["']/)
      const userNameMatch = html.match(/user_name:\s*["']([^"']+)["']/)
      const nickNameMatch = html.match(/nick_name:\s*["']([^"']+)["']/)
      const timeMatch = html.match(/time:\s*["'](\d+)["']/)
      const headImgMatch = html.match(/head_img:\s*['"]([^'"]+)['"]/)

      const avatarMatch = html.match(/class="weui-desktop-account__thumb"[^>]*src="([^"]+)"/)
      let avatar = avatarMatch ? avatarMatch[1] : (headImgMatch ? headImgMatch[1] : '')
      if (avatar.startsWith('http://')) {
        avatar = avatar.replace('http://', 'https://')
      }

      this.weixinMeta = {
        token: tokenMatch[1],
        userName: userNameMatch ? userNameMatch[1] : '',
        nickName: nickNameMatch ? nickNameMatch[1] : '',
        ticket: ticketMatch ? ticketMatch[1] : '',
        svrTime: timeMatch ? Number(timeMatch[1]) : Date.now() / 1000,
        avatar,
      }

      logger.debug(' Auth info:', {
        userName: this.weixinMeta.userName,
        nickName: this.weixinMeta.nickName,
        hasToken: !!this.weixinMeta.token,
      })

      return {
        isAuthenticated: true,
        userId: this.weixinMeta.userName,
        username: this.weixinMeta.nickName,
        avatar: this.weixinMeta.avatar,
      }
    } catch (error) {
      logger.debug('checkAuth: not logged in -', error)
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  async publish(article: Article, options?: PublishOptions): Promise<SyncResult> {
    return this.withHeaderRules(this.HEADER_RULES, async () => {
      logger.info('Starting publish...')

      if (!this.weixinMeta) {
        const auth = await this.checkAuth()
        if (!auth.isAuthenticated) {
          throw new Error('请先登录微信公众号')
        }
      }

      // 微信到微信：使用原始 HTML，跳过所有处理
      let content = (article.source?.platform === 'weixin' && (article as any).rawHtml)
        ? (article as any).rawHtml
        : (article.html || '')

      if (article.source?.platform === 'weixin') {
        logger.info('Source is WeChat, using raw HTML, skipping content processing')
      } else {
        content = this.processLatex(content)
        content = this.stripExternalLinks(content)
        content = await this.processImages(
          content,
          (src) => this.uploadImageByUrl(src),
          {
            skipPatterns: ['mmbiz.qpic.cn', 'mmbiz.qlogo.cn'],
            onProgress: options?.onImageProgress,
          }
        )
        content = this.processContent(content)
      }

      const coverUrl = await this.resolveCoverImage(article.cover)

      const formData = new URLSearchParams({
        token: this.weixinMeta!.token,
        lang: 'zh_CN',
        f: 'json',
        ajax: '1',
        random: String(Math.random()),
        AppMsgId: '',
        count: '1',
        data_seq: '0',
        operate_from: 'Chrome',
        isnew: '0',
        ad_video_transition0: '',
        can_reward0: '0',
        related_video0: '',
        is_video_recommend0: '-1',
        title0: article.title,
        author0: '',
        writerid0: '0',
        fileid0: '',
        digest0: article.summary ?? '',
        auto_gen_digest0: article.summary ? '0' : '1',
        content0: content,
        sourceurl0: '',
        need_open_comment0: '1',
        only_fans_can_comment0: '0',
        cdn_url0: coverUrl,
        cdn_235_1_url0: coverUrl,
        cdn_1_1_url0: coverUrl,
        cdn_url_back0: '',
        crop_list0: '',
        music_id0: '',
        video_id0: '',
        voteid0: '',
        voteismlt0: '',
        supervoteid0: '',
        cardid0: '',
        cardquantity0: '',
        cardlimit0: '',
        vid_type0: '',
        show_cover_pic0: coverUrl ? '1' : '0',
        shortvideofileid0: '',
        copyright_type0: '0',
        releasefirst0: '',
        platform0: '',
        reprint_permit_type0: '',
        allow_reprint0: '',
        allow_reprint_modify0: '',
        original_article_type0: '',
        ori_white_list0: '',
        free_content0: '',
        fee0: '0',
        ad_id0: '',
        guide_words0: '',
        is_share_copyright0: '0',
        share_copyright_url0: '',
        source_article_type0: '',
        reprint_recommend_title0: '',
        reprint_recommend_content0: '',
        share_page_type0: '0',
        share_imageinfo0: '{"list":[]}',
        share_video_id0: '',
        dot0: '{}',
        share_voice_id0: '',
        insert_ad_mode0: '',
        categories_list0: '[]',
      })

      const response = await this.runtime.fetch(
        `https://mp.weixin.qq.com/cgi-bin/operate_appmsg?t=ajax-response&sub=create&type=77&token=${this.weixinMeta!.token}&lang=zh_CN`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData,
        }
      )

      const res = await response.json() as {
        appMsgId?: string
        ret?: number
        base_resp?: { ret: number; err_msg?: string }
      }

      logger.debug(' Save response:', res)

      if (!res.appMsgId) {
        const errMsg = this.formatError(res)
        throw new Error(errMsg)
      }

      const draftUrl = this.buildDraftUrl(res.appMsgId, this.weixinMeta!.token)

      return this.createResult(true, {
        postId: res.appMsgId,
        postUrl: draftUrl,
        draftOnly: options?.draftOnly ?? true,
      })
    }).catch((error) => this.createResult(false, {
      error: (error as Error).message,
    }))
  }

  async publishExistingDraft(draftRef: { postId: string; postUrl?: string }): Promise<SyncResult> {
    return this.withHeaderRules(this.HEADER_RULES, async () => {
      logger.info('Publishing existing Weixin draft...', draftRef.postId)

      if (!this.weixinMeta) {
        const auth = await this.checkAuth()
        if (!auth.isAuthenticated) {
          throw new Error('请先登录微信公众号')
        }
      }

      const token = this.weixinMeta!.token
      const draftUrl = draftRef.postUrl ?? this.buildDraftUrl(draftRef.postId, token)
      const session = await this.getMassSendSession(token)

      if (session.requiresSafeScan) {
        throw new Error('微信公众号群发需要管理员扫码确认，无法在后台定时自动完成；草稿仍已保留')
      }

      await this.checkAppMsgCopyright(draftRef.postId, token, true)
      await this.checkAppMsgCopyright(draftRef.postId, token, false)

      const response = await this.runtime.fetch(
        `https://mp.weixin.qq.com/cgi-bin/masssend?t=ajax-response&token=${token}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: this.createMassSendForm(draftRef.postId, token, session.operationSeq),
        }
      )

      const res = await response.json() as WeixinMassSendResponse
      logger.debug('Mass send response:', res)

      const ret = res.base_resp?.ret ?? res.ret
      if (ret !== 0) {
        if (this.shouldFallbackToPagePublish(res)) {
          logger.warn('Weixin backend masssend was not accepted, trying page automation...', res)
          const pageResult = await this.publishExistingDraftFromPage(draftRef.postId, draftUrl)

          if (pageResult.published) {
            return this.createResult(true, {
              postId: draftRef.postId,
              postUrl: pageResult.href || draftUrl,
              draftOnly: false,
              message: pageResult.message ?? '已通过微信公众号页面自动点击完成发布',
            })
          }

          const pageMessage = pageResult.message ? `；页面自动化：${pageResult.message}` : ''
          throw new Error(`${this.formatMassSendError(res)}${pageMessage}`)
        }

        throw new Error(this.formatMassSendError(res))
      }

      return this.createResult(true, {
        postId: draftRef.postId,
        postUrl: draftUrl,
        draftOnly: false,
        message: '已通过微信公众号后台群发接口发布草稿',
      })
    }).catch((error) => this.createResult(false, {
      postId: draftRef.postId,
      postUrl: draftRef.postUrl,
      draftOnly: true,
      error: (error as Error).message,
    }))
  }

  private async publishExistingDraftFromPage(appMsgId: string, draftUrl: string): Promise<WeixinPagePublishResult> {
    if (!this.runtime.tabs) {
      return {
        attempted: false,
        clicked: false,
        confirmed: false,
        published: false,
        href: draftUrl,
        message: '当前运行时不支持浏览器页面自动化',
      }
    }

    const tab = await this.runtime.tabs.create(draftUrl, true)
    if (!tab?.id) {
      return {
        attempted: false,
        clicked: false,
        confirmed: false,
        published: false,
        href: draftUrl,
        message: '无法打开微信公众号草稿编辑页',
      }
    }

    try {
      await this.runtime.tabs.waitForLoad(tab.id, 30000)
    } catch {
      logger.warn('Weixin draft page load timeout, trying to continue...')
    }

    try {
      return await this.runtime.tabs.executeScript(
        tab.id,
        async (draftId: string): Promise<WeixinPagePublishResult> => {
          void draftId
          const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
          const normalize = (value: string) => value.replace(/\s+/g, '')
          const getText = (element: Element) => normalize(
            (element as HTMLElement).innerText ||
            element.textContent ||
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            ''
          )
          const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect()
            const style = window.getComputedStyle(element)
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          }
          const isDisabled = (element: HTMLElement) => {
            return Boolean(
              (element as HTMLButtonElement).disabled ||
              element.getAttribute('aria-disabled') === 'true' ||
              /\bdisabled\b/i.test(element.className)
            )
          }
          const click = (element: HTMLElement) => {
            element.scrollIntoView({ block: 'center', inline: 'center' })
            element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }))
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
            element.click()
          }
          const collectMessages = () => {
            const selectors = [
              '[role="alert"]',
              '[class*="toast"]',
              '[class*="Toast"]',
              '[class*="message"]',
              '[class*="Message"]',
              '[class*="dialog"]',
              '[class*="Dialog"]',
              '[class*="modal"]',
              '[class*="Modal"]',
              '.weui-desktop-msg',
              '.weui-desktop-dialog',
              '.weui-desktop-tips',
            ]
            const texts = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
              .filter(isVisible)
              .map(getText)
              .filter(text => text && text.length <= 180)
            return Array.from(new Set(texts)).slice(0, 6).join('；')
          }
          const pageText = () => normalize(document.body?.innerText || '')
          const hasAny = (text: string, labels: string[]) => labels.some(label => text.includes(normalize(label)))
          const successLabels = ['群发成功', '发表成功', '发布成功', '发送成功', '操作成功']
          const blockingLabels = ['扫码', '二维码', '管理员确认', '群发保护', '微信扫一扫', '安全验证']
          const buttonSelectors = [
            'button',
            'a',
            '[role="button"]',
            '.weui-desktop-btn',
            '[class*="btn"]',
            '[class*="Button"]',
          ].join(',')
          const ignoredButtonTextParts = ['功能', '记录', '管理', '设置', '素材', '草稿箱', '历史', '删除', '预览']
          const findButton = (labels: string[]) => {
            const normalizedLabels = labels.map(normalize)
            const candidates = Array.from(document.querySelectorAll(buttonSelectors))
              .filter(isVisible)
              .map(element => element as HTMLElement)
              .filter(element => !isDisabled(element))

            const scored = candidates.map(element => {
              const text = getText(element)
              if (!text || ignoredButtonTextParts.some(part => text.includes(part))) {
                return { element, score: Number.POSITIVE_INFINITY }
              }

              const exactIndex = normalizedLabels.findIndex(label => text === label)
              if (exactIndex >= 0) return { element, score: exactIndex }

              const includeIndex = normalizedLabels.findIndex(label => text.includes(label) && text.length <= label.length + 4)
              if (includeIndex >= 0) {
                const primaryBias = /primary|important|submit/i.test(element.className) ? -0.25 : 0
                return { element, score: normalizedLabels.length + includeIndex + primaryBias }
              }

              return { element, score: Number.POSITIVE_INFINITY }
            })
              .filter(item => Number.isFinite(item.score))
              .sort((a, b) => a.score - b.score)

            return scored[0]?.element
          }
          const findCheckbox = () => {
            const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'))
              .filter(isVisible) as HTMLInputElement[]
            return inputs.find(input => !input.checked)
          }
          const isPublished = () => {
            return hasAny(collectMessages(), successLabels)
          }
          const isBlocked = () => {
            const text = `${pageText()}；${collectMessages()}`
            return hasAny(text, blockingLabels)
          }
          const clickFirst = (labels: string[]) => {
            const button = findButton(labels)
            if (!button) return false
            click(button)
            return true
          }

          let clicked = false
          let confirmed = false
          await sleep(1800)

          const primaryLabels = ['群发', '发表', '发布', '立即群发', '立即发布', '发布文章', '发表文章', '保存并群发']
          clicked = clickFirst(primaryLabels)

          if (!clicked) {
            return {
              attempted: true,
              clicked: false,
              confirmed: false,
              published: isPublished(),
              href: location.href,
              message: collectMessages() || '未找到微信公众号发布/群发按钮',
            }
          }

          const confirmLabels = ['确认群发', '确定群发', '继续群发', '立即群发', '确认发布', '确定发布', '继续发布', '立即发布', '确认', '确定', '群发', '发布', '发表']

          for (let i = 0; i < 18; i++) {
            await sleep(1000)

            if (isPublished()) {
              return {
                attempted: true,
                clicked,
                confirmed,
                published: true,
                href: location.href,
                message: collectMessages() || '微信公众号页面提示发布成功',
              }
            }

            if (isBlocked()) {
              return {
                attempted: true,
                clicked,
                confirmed,
                published: false,
                href: location.href,
                message: collectMessages() || '微信公众号需要扫码/管理员确认，无法全自动完成',
              }
            }

            const checkbox = findCheckbox()
            if (checkbox) checkbox.click()

            if (clickFirst(confirmLabels)) {
              confirmed = true
            }
          }

          return {
            attempted: true,
            clicked,
            confirmed,
            published: isPublished(),
            href: location.href,
            message: collectMessages() || (confirmed ? '已点击发布确认，但未检测到成功提示' : '已点击发布按钮，但未检测到确认或成功提示'),
          }
        },
        [appMsgId]
      )
    } catch (error) {
      return {
        attempted: true,
        clicked: false,
        confirmed: false,
        published: false,
        href: draftUrl,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private shouldFallbackToPagePublish(res: WeixinMassSendResponse): boolean {
    const ret = res.base_resp?.ret ?? res.ret
    return ret === 720006
  }

  private async getMassSendSession(token: string): Promise<WeixinMassSendSession> {
    const response = await this.runtime.fetch(
      `https://mp.weixin.qq.com/cgi-bin/masssendpage?t=mass/send&token=${token}&lang=zh_CN`,
      {
        method: 'GET',
        credentials: 'include',
      }
    )

    if (!response.ok) {
      throw new Error(`获取微信公众号群发参数失败: ${response.status}`)
    }

    const html = await response.text()
    const operationSeq = html.match(/operation_seq:\s*["'](\d+)["']/)?.[1]
    const protectStatus = Number(html.match(/"protect_status":\s*(\d+)/)?.[1] ?? 0)

    return {
      operationSeq,
      requiresSafeScan: (protectStatus & 2) === 2,
    }
  }

  private async checkAppMsgCopyright(appMsgId: string, token: string, firstCheck: boolean): Promise<void> {
    try {
      const response = await this.runtime.fetch(
        `https://mp.weixin.qq.com/cgi-bin/masssend?action=get_appmsg_copyright_stat&token=${token}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token,
            f: 'json',
            ajax: '1',
            first_check: firstCheck ? '1' : '0',
            appmsgid: appMsgId,
            type: '10',
          }),
        }
      )

      const res = await response.json() as WeixinMassSendResponse
      const ret = res.base_resp?.ret ?? res.ret
      if (ret && ret !== 0) {
        logger.warn('Weixin copyright check returned non-zero:', res)
      }
    } catch (error) {
      logger.warn('Weixin copyright check failed, continuing to masssend:', error)
    }
  }

  private createMassSendForm(appMsgId: string, token: string, operationSeq?: string): URLSearchParams {
    const formData = new URLSearchParams({
      token,
      f: 'json',
      ajax: '1',
      random: String(Math.random()),
      smart_product: '0',
      cardlimit: '1',
      sex: '0',
      synctxweibo: '0',
      direct_send: '1',
      req_id: this.generateReqId(),
      req_time: String(Date.now()),
      type: '10',
      appmsgid: appMsgId,
      groupid: '-1',
      send_time: '0',
    })

    if (operationSeq) {
      formData.set('operation_seq', operationSeq)
    }

    return formData
  }

  private generateReqId(length = 32): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)]
    }
    return result
  }

  private buildDraftUrl(appMsgId: string, token?: string): string {
    const params = new URLSearchParams({
      t: 'media/appmsg_edit',
      action: 'edit',
      type: '77',
      appmsgid: appMsgId,
      token: token ?? this.weixinMeta?.token ?? '',
      lang: 'zh_CN',
    })
    return `https://mp.weixin.qq.com/cgi-bin/appmsg?${params.toString()}`
  }

  private formatMassSendError(res: WeixinMassSendResponse): string {
    const ret = res.base_resp?.ret ?? res.ret
    const errMsg = res.base_resp?.err_msg ?? res.err_msg
    const code = ret ?? 'unknown'
    return errMsg && errMsg !== 'ok'
      ? `微信公众号群发失败 (${code}): ${errMsg}`
      : `微信公众号群发失败 (错误码 ${code})`
  }

  private async resolveCoverImage(cover?: string): Promise<string> {
    if (!cover) return ''

    try {
      const coverResult = await this.uploadImageByUrl(cover)
      return coverResult.url
    } catch (error) {
      logger.warn('Failed to upload cover, saving draft without cover:', error)
      return ''
    }
  }

  protected async uploadImageByUrl(src: string): Promise<ImageUploadResult> {
    if (!this.weixinMeta) {
      throw new Error('未登录')
    }

    let imageBlob: Blob
    if (src.startsWith('data:')) {
      // Decode data URI directly (avoids fetch for large base64 strings)
      const commaIdx = src.indexOf(',')
      if (commaIdx < 0) throw new Error('Invalid data URI')
      const base64 = src.slice(commaIdx + 1)
      const mimeMatch = src.slice(0, commaIdx).match(/data:([^;]+)/)
      const mimeType = mimeMatch?.[1] ?? 'image/png'
      try {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        imageBlob = new Blob([bytes], { type: mimeType })
      } catch {
        const resp = await fetch(src)
        if (!resp.ok) throw new Error('图片下载失败: ' + src)
        imageBlob = await resp.blob()
      }
    } else {
      const imageResponse = await fetch(src)
      if (!imageResponse.ok) {
        throw new Error('图片下载失败: ' + src)
      }
      imageBlob = await imageResponse.blob()
    }

    const formData = new FormData()
    const timestamp = Date.now()
    const fileName = `${timestamp}.jpg`

    formData.append('type', imageBlob.type || 'image/jpeg')
    formData.append('id', String(timestamp))
    formData.append('name', fileName)
    formData.append('lastModifiedDate', new Date().toString())
    formData.append('size', String(imageBlob.size))
    formData.append('file', imageBlob, fileName)

    const { token, userName, ticket, svrTime } = this.weixinMeta
    const seq = Date.now()

    const response = await this.runtime.fetch(
      `https://mp.weixin.qq.com/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&ticket_id=${userName}&ticket=${ticket}&svr_time=${svrTime}&token=${token}&lang=zh_CN&seq=${seq}&t=${Math.random()}`,
      {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }
    )

    const res = await response.json() as {
      cdn_url?: string
      content?: string
      base_resp?: { err_msg: string; ret: number }
    }

    logger.debug(' Image upload response:', res)

    if (res.base_resp?.err_msg !== 'ok' || !res.cdn_url) {
      throw new Error('图片上传失败: ' + src)
    }

    return {
      url: res.cdn_url,
    }
  }

  private isLatexFormula(text: string): boolean {
    if (/[\\^_{}]/.test(text)) return true
    if (/[α-ωΑ-Ω]/.test(text)) return true
    if (/[∑∏∫∂∇∞≠≤≥±×÷√]/.test(text)) return true
    return false
  }

  private processLatex(content: string): string {
    const LATEX_API = 'https://latex.codecogs.com/png.latex'

    content = content.replace(/\$\$([^$]+)\$\$/g, (match, latex) => {
      if (!this.isLatexFormula(latex)) return match
      const encoded = encodeURIComponent(latex.trim())
      return `<p style="text-align: center;"><img src="${LATEX_API}?\\dpi{150}${encoded}" alt="formula" style="vertical-align: middle; max-width: 100%;"></p>`
    })

    content = content.replace(/\$([^$]+)\$/g, (match, latex) => {
      if (!this.isLatexFormula(latex)) return match
      const encoded = encodeURIComponent(latex.trim())
      return `<img src="${LATEX_API}?\\dpi{120}${encoded}" alt="formula" style="vertical-align: middle;">`
    })

    return content
  }

  private processContent(content: string): string {
    const wrapped = `<section style="margin-left: 6px; margin-right: 6px; line-height: 1.75em;">${content}</section>`
    return juice.inlineContent(wrapped, WEIXIN_CSS)
  }

  /**
   * 移除外部链接（微信不允许非 mp.weixin.qq.com 域名的链接）
   * 将 <a href="外部链接">文字</a> 转换为 文字
   */
  private stripExternalLinks(content: string): string {
    // 匹配 <a> 标签，保留微信域名的链接
    return content.replace(
      /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (match, href, text) => {
        // 保留微信域名的链接
        if (href && (
          href.includes('mp.weixin.qq.com') ||
          href.includes('weixin.qq.com') ||
          href.startsWith('#') ||  // 锚点链接
          href.startsWith('javascript:')  // JS 链接
        )) {
          return match
        }
        // 外部链接只保留文字
        return text
      }
    )
  }

  private formatError(res: { ret?: number; base_resp?: { ret: number } }): string {
    const ret = res.ret ?? res.base_resp?.ret

    const errorMap: Record<number, string> = {
      [-6]: '请输入验证码',
      [-8]: '请输入验证码',
      [-1]: '系统错误，请注意备份内容后重试',
      [-2]: '参数错误，请注意备份内容后重试',
      [-5]: '服务错误，请注意备份内容后重试',
      [-99]: '内容超出字数，请调整',
      [-206]: '服务负荷过大，请稍后重试',
      [200002]: '参数错误，请注意备份内容后重试',
      [200003]: '登录态超时，请重新登录',
      [412]: '图文中含非法外链',
      [62752]: '可能含有具备安全风险的链接，请检查',
      [64502]: '你输入的微信号不存在',
      [64505]: '发送预览失败，请稍后再试',
      [64506]: '保存失败，链接不合法',
      [64507]: '内容不能包含外部链接',
      [64562]: '请勿插入非微信域名的链接',
      [64509]: '正文中不能包含超过3个视频',
      [64515]: '当前素材非最新内容，请重新打开并编辑',
      [64702]: '标题超出64字长度限制',
      [64703]: '摘要超出120字长度限制',
      [64705]: '内容超出字数，请调整',
      [10806]: '正文不能有违规内容，请重新编辑',
      [10807]: '内容不能违反公众平台协议',
      [220001]: '素材管理中的存储数量已达上限',
      [220002]: '图片库已达到存储上限',
    }

    return errorMap[ret as number] || `同步失败 (错误码: ${ret})`
  }
}
