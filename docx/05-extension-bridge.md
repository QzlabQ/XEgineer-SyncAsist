# 浏览器扩展桥接层设计

本文档描述 Web App 与 Chrome Extension 之间的通信协议，以及平台适配器框架的使用方式。

---

## 1. 架构概述

```
Web App (localhost:3000)
    │
    │  window.postMessage / chrome.runtime.sendMessage
    ▼
Content Script（注入到 Web App 页面）
    │
    │  chrome.runtime.sendMessage
    ▼
Service Worker（运行平台适配器）
    │
    │  fetch（携带平台 Cookie）
    ▼
各平台 API
```

**为什么需要 Content Script 中转？**

Web App 是普通网页，无法直接调用 `chrome.runtime.sendMessage`。Content Script 注入到 Web App 页面后，作为桥梁转发消息。

---

## 2. 消息协议

所有消息使用统一的 `XEgineerMessage` 格式：

```typescript
// packages/extension/src/bridge/protocol.ts

export type MessageType =
  | 'CHECK_AUTH'          // 检查平台登录状态
  | 'PUBLISH'             // 发布文章
  | 'LIST_PLATFORMS'      // 获取支持的平台列表
  | 'UPLOAD_IMAGE'        // 上传图片到平台

export interface XEgineerMessage {
  type: MessageType
  requestId: string       // 用于匹配请求和响应
  payload: unknown
}

export interface XEgineerResponse {
  requestId: string
  success: boolean
  data?: unknown
  error?: string
}

// CHECK_AUTH 请求
export interface CheckAuthPayload {
  platformId: string
}

// CHECK_AUTH 响应
export interface CheckAuthResponse {
  platformId: string
  isLoggedIn: boolean
  username?: string
  avatar?: string
}

// PUBLISH 请求
export interface PublishPayload {
  platformId: string
  article: {
    title: string
    content: string        // 平台格式的内容（HTML 或 Markdown）
    cover?: string
    summary?: string
    tags?: string[]
    categories?: string[]
    isDraft?: boolean
    [key: string]: unknown // 平台专属字段
  }
}

// PUBLISH 响应
export interface PublishResponse {
  platformId: string
  articleId?: string
  url?: string
  isDraft: boolean
}
```

---

## 3. Web App 侧实现

```typescript
// packages/editor/src/lib/extension-bridge.ts

class ExtensionBridge {
  private pendingRequests = new Map<string, {
    resolve: (data: unknown) => void
    reject: (error: Error) => void
  }>()

  constructor() {
    // 监听来自 Content Script 的响应
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      if (event.data?.source !== 'XEGINEER_EXTENSION') return
      this.handleResponse(event.data as XEgineerResponse)
    })
  }

  async sendMessage<T>(type: MessageType, payload: unknown): Promise<T> {
    const requestId = crypto.randomUUID()

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve: resolve as any, reject })

      // 发送给 Content Script
      window.postMessage({
        source: 'XEGINEER_WEBAPP',
        type,
        requestId,
        payload,
      }, '*')

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          reject(new Error(`Request ${type} timed out`))
        }
      }, 30000)
    })
  }

  private handleResponse(response: XEgineerResponse) {
    const pending = this.pendingRequests.get(response.requestId)
    if (!pending) return
    this.pendingRequests.delete(response.requestId)

    if (response.success) {
      pending.resolve(response.data)
    } else {
      pending.reject(new Error(response.error))
    }
  }

  async checkAuth(platformId: string): Promise<CheckAuthResponse> {
    return this.sendMessage('CHECK_AUTH', { platformId })
  }

  async publish(platformId: string, article: PublishPayload['article']): Promise<PublishResponse> {
    return this.sendMessage('PUBLISH', { platformId, article })
  }

  // 检测扩展是否已安装
  async isExtensionInstalled(): Promise<boolean> {
    try {
      await Promise.race([
        this.sendMessage('LIST_PLATFORMS', {}),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ])
      return true
    } catch {
      return false
    }
  }
}

export const extensionBridge = new ExtensionBridge()
```

---

## 4. Content Script 实现

```typescript
// packages/extension/src/bridge/content-script.ts
// 注入到 Web App 页面（manifest.json 中配置 matches: ["http://localhost:3000/*"]）

// 监听来自 Web App 的消息，转发给 Service Worker
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.source !== 'XEGINEER_WEBAPP') return

  chrome.runtime.sendMessage(event.data, (response: XEgineerResponse) => {
    // 将 Service Worker 的响应转发回 Web App
    window.postMessage({
      ...response,
      source: 'XEGINEER_EXTENSION',
    }, '*')
  })
})
```

---

## 5. Service Worker 实现

```typescript
// packages/extension/src/background/index.ts（扩展入口）

import { adapters } from '@xegineer/core'
import { ExtensionRuntime } from '../runtime/extension'

const runtime = new ExtensionRuntime()

// 监听来自 Content Script 的消息
chrome.runtime.onMessage.addListener((message: XEgineerMessage, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ requestId: message.requestId, success: false, error: err.message })
  })
  return true  // 保持消息通道开放（异步响应必须）
})

async function handleMessage(message: XEgineerMessage): Promise<XEgineerResponse> {
  const { type, requestId, payload } = message

  switch (type) {
    case 'LIST_PLATFORMS': {
      return {
        requestId,
        success: true,
        data: Object.values(adapters).map(A => A.meta),
      }
    }

    case 'CHECK_AUTH': {
      const { platformId } = payload as CheckAuthPayload
      const AdapterClass = adapters[platformId]
      if (!AdapterClass) throw new Error(`Unknown platform: ${platformId}`)

      const adapter = new AdapterClass(runtime)
      const result = await adapter.checkAuth()
      return { requestId, success: true, data: result }
    }

    case 'PUBLISH': {
      const { platformId, article } = payload as PublishPayload
      const AdapterClass = adapters[platformId]
      if (!AdapterClass) throw new Error(`Unknown platform: ${platformId}`)

      const adapter = new AdapterClass(runtime)
      const result = await adapter.publish(article)
      return { requestId, success: true, data: result }
    }

    default:
      throw new Error(`Unknown message type: ${type}`)
  }
}
```

---

## 6. 平台适配框架

| 模块 | 说明 |
|------|------|
| `platform-adapters/adapters/` | BaseAdapter/CodeAdapter 基类与平台适配器实现 |
| `platform-adapters/runtime/interface.ts` | RuntimeInterface 抽象（支持扩展和 Node 两种环境） |
| `src/runtime/extension.ts` | ExtensionRuntime — RuntimeInterface 的 Chrome API 实现 |
| `src/background/index.ts` | Service Worker 消息处理入口 |

桥接层文件：
- `src/bridge/content-script.ts` — Content Script，桥接 Web App 与 Service Worker
- `apps/web/src/lib/extension-bridge.ts` — Web App 端通信协议封装

---

## 7. 扩展安装引导

当检测到扩展未安装时，Web App 展示安装引导：

```
┌─────────────────────────────────────────────────────┐
│  需要安装 XEgineer 浏览器扩展才能发布文章              │
│                                                      │
│  扩展负责使用您已登录的账号将文章发布到各平台           │
│  您的账号信息不会上传到任何服务器                      │
│                                                      │
│  [安装 Chrome 扩展]  [了解更多]                       │
└─────────────────────────────────────────────────────┘
```
