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
      const result = await adapter.checkAuth()
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
