import { ExtensionRuntime } from '../runtime/extension'

// Import Wechatsync adapters via alias (resolved in vite.config.ts)
import { ZhihuAdapter } from '@wechatsync/core/adapters/platforms/zhihu'
import { BilibiliAdapter } from '@wechatsync/core/adapters/platforms/bilibili'
import { JuejinAdapter } from '@wechatsync/core/adapters/platforms/juejin'
import { WeixinAdapter } from '@wechatsync/core/adapters/platforms/weixin'
import { CSDNAdapter } from '@wechatsync/core/adapters/platforms/csdn'
import { XiaohongshuAdapter } from '../adapters/xiaohongshu'
import { JianshuAdapter } from '../adapters/jianshu'
import type { BaseAdapter } from '@wechatsync/core/adapters/base'
import type { Article } from '@wechatsync/core/types'

type AdapterClass = new () => BaseAdapter

const ADAPTERS: Record<string, AdapterClass> = {
  zhihu: ZhihuAdapter as unknown as AdapterClass,
  bilibili: BilibiliAdapter as unknown as AdapterClass,
  juejin: JuejinAdapter as unknown as AdapterClass,
  weixin: WeixinAdapter as unknown as AdapterClass,
  csdn: CSDNAdapter as unknown as AdapterClass,
  xiaohongshu: XiaohongshuAdapter as unknown as AdapterClass,
  jianshu: JianshuAdapter as unknown as AdapterClass,
}

const runtime = new ExtensionRuntime()

// Pre-init adapters
const adapterInstances: Record<string, BaseAdapter> = {}
async function getAdapter(platformId: string): Promise<BaseAdapter> {
  if (!adapterInstances[platformId]) {
    const Cls = ADAPTERS[platformId]
    if (!Cls) throw new Error(`Unknown platform: ${platformId}`)
    const instance = new Cls()
    await instance.init(runtime)
    adapterInstances[platformId] = instance
  }
  return adapterInstances[platformId]
}

interface XEgineerMessage {
  source: 'XEGINEER_WEBAPP'
  type: 'LIST_PLATFORMS' | 'CHECK_AUTH' | 'PUBLISH'
  requestId: string
  payload: unknown
}

interface XEgineerResponse {
  requestId: string
  success: boolean
  data?: unknown
  error?: string
}

chrome.runtime.onMessage.addListener(
  (message: XEgineerMessage, _sender, sendResponse) => {
    if (message.source !== 'XEGINEER_WEBAPP') return false

    handleMessage(message)
      .then(sendResponse)
      .catch(err => sendResponse({ requestId: message.requestId, success: false, error: String(err) }))

    return true // keep channel open for async response
  }
)

async function handleMessage(msg: XEgineerMessage): Promise<XEgineerResponse> {
  const { type, requestId, payload } = msg

  switch (type) {
    case 'LIST_PLATFORMS': {
      const platforms = Object.keys(ADAPTERS).map(id => ({ id }))
      return { requestId, success: true, data: platforms }
    }

    case 'CHECK_AUTH': {
      const { platformId } = payload as { platformId: string }
      const adapter = await getAdapter(platformId)
      const result = await checkAuthWithFallback(platformId, adapter)
      return {
        requestId,
        success: true,
        data: {
          platformId,
          isAuthenticated: result.isAuthenticated,
          username: result.username,
          avatar: result.avatar,
        },
      }
    }

    case 'PUBLISH': {
      const { platformId, article } = payload as { platformId: string; article: Record<string, unknown> }

      const adapter = await getAdapter(platformId)

      // Map renderer payload to Wechatsync Article format
      const wechatSyncArticle: Article = {
        title: article.title as string,
        markdown: (article.markdownContent as string | undefined) ?? '',
        html: (article.content as string | undefined),
        summary: article.summary as string | undefined ?? article.brief as string | undefined,
        cover: article.cover as string | undefined ?? article.coverImage as string | undefined,
        tags: article.tags as string[] | undefined,
        category: article.categoryId as string | undefined ?? article.category as string | undefined,
      }

      const result = await adapter.publish(wechatSyncArticle)
      return {
        requestId,
        success: true,
        data: {
          platformId,
          success: result.success,
          url: result.postUrl,
          postId: result.postId,
          isDraft: result.draftOnly ?? true,
          error: result.error,
          message: result.message,
        },
      }
    }

    default:
      return { requestId, success: false, error: `Unknown message type: ${type}` }
  }
}

type AuthData = {
  isAuthenticated: boolean
  username?: string
  userId?: string
  avatar?: string
  error?: string
}

async function checkAuthWithFallback(platformId: string, adapter: BaseAdapter): Promise<AuthData> {
  let adapterResult: AuthData | null = null

  try {
    adapterResult = await adapter.checkAuth()
    if (adapterResult.isAuthenticated) return adapterResult
  } catch (error) {
    adapterResult = {
      isAuthenticated: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const fallback = await checkCookieAuth(platformId)
  if (fallback?.isAuthenticated) return fallback

  return adapterResult ?? { isAuthenticated: false }
}

async function checkCookieAuth(platformId: string): Promise<AuthData | null> {
  switch (platformId) {
    case 'weixin':
      return checkWeixinCookieAuth()
    case 'csdn':
      return checkCsdnCookieAuth()
    case 'xiaohongshu':
      return checkXiaohongshuCookieAuth()
    default:
      return null
  }
}

async function checkWeixinCookieAuth(): Promise<AuthData> {
  const cookies = await getCookiesForDomains([
    'mp.weixin.qq.com',
    '.mp.weixin.qq.com',
    'weixin.qq.com',
    '.weixin.qq.com',
  ])

  const userName = getCookieValue(cookies, ['slave_user'])
  const userId = getCookieValue(cookies, ['data_bizuin', 'slave_bizuin', 'bizuin'])
  const hasSession = Boolean(
    getCookieValue(cookies, ['slave_sid']) ||
    getCookieValue(cookies, ['ticket']) ||
    getCookieValue(cookies, ['ticket_id']) ||
    userName ||
    userId
  )

  if (hasSession) {
    return {
      isAuthenticated: true,
      userId: userId ? decodeCookieText(userId) : undefined,
      username: userName ? decodeCookieText(userName) : undefined,
    }
  }

  const openTab = await findOpenTab(['https://mp.weixin.qq.com/*'])
  const hasTokenInUrl = openTab?.url ? /[?&]token=\d+/.test(openTab.url) : false
  return { isAuthenticated: hasTokenInUrl }
}

async function checkCsdnCookieAuth(): Promise<AuthData> {
  const cookies = await getCookiesForDomains([
    'csdn.net',
    '.csdn.net',
    'blog.csdn.net',
    'editor.csdn.net',
    'passport.csdn.net',
  ])

  const userToken = getCookieValue(cookies, ['UserToken'])
  const userName = getCookieValue(cookies, ['UserName'])
  const userNick = getCookieValue(cookies, ['UserNick'])
  const userInfo = getCookieValue(cookies, ['UserInfo'])
  const hasSession = Boolean(userToken || userName || userNick || userInfo || getCookieValue(cookies, ['AU', 'BT']))

  return {
    isAuthenticated: hasSession,
    username: decodeCookieText(userNick || userName || ''),
  }
}

async function checkXiaohongshuCookieAuth(): Promise<AuthData> {
  const cookies = await getCookiesForDomains([
    'xiaohongshu.com',
    '.xiaohongshu.com',
    'www.xiaohongshu.com',
    'creator.xiaohongshu.com',
  ])

  const session = getCookieValue(cookies, [
    'web_session',
    'web_session_v2',
    'access-token-shopping',
    'customer-sso-sid',
  ])

  if (session) return { isAuthenticated: true }

  return probeXiaohongshuOpenTab()
}

async function probeXiaohongshuOpenTab(): Promise<AuthData> {
  const tab = await findOpenTab([
    'https://www.xiaohongshu.com/*',
    'https://creator.xiaohongshu.com/*',
    'https://*.xiaohongshu.com/*',
  ])
  if (!tab?.id) return { isAuthenticated: false }

  try {
    const result = await runtime.tabs.executeScript(
      tab.id,
      () => {
        const keys = Object.keys(localStorage)
        const values = keys
          .filter(key => /user|account|login|session|profile|creator/i.test(key))
          .map(key => localStorage.getItem(key) ?? '')
          .join('\n')

        const match = values.match(/"nickname"\s*:\s*"([^"]+)"/) ||
          values.match(/"nickName"\s*:\s*"([^"]+)"/) ||
          values.match(/"name"\s*:\s*"([^"]+)"/)

        return {
          hasUserState: /userId|user_id|nickname|nickName|red_id|logged/i.test(values),
          username: match?.[1],
        }
      },
      []
    )

    return {
      isAuthenticated: Boolean(result?.hasUserState),
      username: result?.username,
    }
  } catch {
    return { isAuthenticated: false }
  }
}

async function getCookiesForDomains(domains: string[]): Promise<chrome.cookies.Cookie[]> {
  const results = await Promise.all(domains.map(async domain => {
    try {
      return await chrome.cookies.getAll({ domain })
    } catch {
      return []
    }
  }))

  const seen = new Set<string>()
  return results.flat().filter(cookie => {
    const key = `${cookie.domain}|${cookie.path}|${cookie.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getCookieValue(cookies: chrome.cookies.Cookie[], names: string[]): string {
  const normalizedNames = names.map(name => name.toLowerCase())
  return cookies.find(cookie => normalizedNames.includes(cookie.name.toLowerCase()))?.value ?? ''
}

async function findOpenTab(urls: string[]): Promise<chrome.tabs.Tab | undefined> {
  for (const url of urls) {
    const tabs = await chrome.tabs.query({ url })
    if (tabs[0]) return tabs[0]
  }
  return undefined
}

function decodeCookieText(value: string): string | undefined {
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
