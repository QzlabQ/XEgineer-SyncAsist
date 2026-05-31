'use client'

// Extension bridge — communicates with Chrome Extension via postMessage
// Content script relays messages to Service Worker

export type BridgeMessageType =
  | 'LIST_PLATFORMS'
  | 'CHECK_AUTH'
  | 'PUBLISH'
  | 'SCHEDULE_PUBLISH'
  | 'CANCEL_SCHEDULED_PUBLISH'
  | 'RETRY_SCHEDULED_PUBLISH'
  | 'LIST_SCHEDULED_PUBLISHES'

export interface BridgeMessage {
  source: 'XEGINEER_WEBAPP'
  type: BridgeMessageType
  requestId: string
  payload: unknown
}

export interface BridgeResponse {
  source: 'XEGINEER_EXTENSION'
  requestId: string
  success: boolean
  data?: unknown
  error?: string
}

export interface AuthStatus {
  platformId: string
  isAuthenticated: boolean
  username?: string
  avatar?: string
}

export interface PublishResult {
  platformId: string
  success: boolean
  url?: string
  postId?: string
  isDraft: boolean
  error?: string
  message?: string
}

export interface ScheduledPublishTarget {
  platformId: string
  platformName: string
  article: Record<string, unknown>
}

export interface ScheduledPublishJob {
  id: string
  articleId?: number
  articleTitle: string
  scheduledAt: number
  createdAt: number
  updatedAt: number
  status: 'scheduled' | 'draft_ready' | 'running' | 'publishing' | 'success' | 'error' | 'cancelled'
  targets: ScheduledPublishTarget[]
  error?: string
  results?: Array<PublishResult & { platformName: string }>
}

export interface SchedulePublishRequest {
  articleId?: number
  articleTitle: string
  scheduledAt: number
  targets: ScheduledPublishTarget[]
}

class ExtensionBridge {
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private installed: boolean | null = null
  private lastError = ''

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleMessage)
    }
  }

  private handleMessage = (event: MessageEvent) => {
    if (event.source !== window) return
    const data = event.data as BridgeResponse
    if (data?.source !== 'XEGINEER_EXTENSION') return
    const p = this.pending.get(data.requestId)
    if (!p) return
    this.pending.delete(data.requestId)
    if (data.success) p.resolve(data.data)
    else p.reject(new Error(data.error ?? 'Unknown error'))
  }

  private send<T>(type: BridgeMessageType, payload: unknown, timeoutMs = 15000): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = createRequestId()
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject })
      const msg: BridgeMessage = { source: 'XEGINEER_WEBAPP', type, requestId, payload }
      window.postMessage(msg, '*')
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId)
          reject(new Error(`Request ${type} timed out`))
        }
      }, timeoutMs)
    })
  }

  async isInstalled(): Promise<boolean> {
    if (this.installed === true) return true
    try {
      await this.send('LIST_PLATFORMS', {}, 5000)
      this.installed = true
      this.lastError = ''
    } catch (error) {
      this.installed = false
      this.lastError = error instanceof Error ? error.message : '扩展未响应，请确认内容脚本已注入当前页面'
    }
    return this.installed
  }

  getLastError(): string {
    return this.lastError
  }

  async checkAuth(platformId: string): Promise<AuthStatus> {
    return this.send('CHECK_AUTH', { platformId })
  }

  async publish(platformId: string, article: Record<string, unknown>): Promise<PublishResult> {
    return this.send('PUBLISH', { platformId, article }, 30000)
  }

  async schedulePublish(request: SchedulePublishRequest): Promise<ScheduledPublishJob> {
    return this.send('SCHEDULE_PUBLISH', request, 120000)
  }

  async cancelScheduledPublish(jobId: string): Promise<ScheduledPublishJob> {
    return this.send('CANCEL_SCHEDULED_PUBLISH', { jobId }, 15000)
  }

  async retryScheduledPublish(jobId: string): Promise<ScheduledPublishJob> {
    return this.send('RETRY_SCHEDULED_PUBLISH', { jobId }, 120000)
  }

  async listScheduledPublishes(): Promise<ScheduledPublishJob[]> {
    return this.send('LIST_SCHEDULED_PUBLISHES', {}, 15000)
  }
}

export { ExtensionBridge }

// Lazy singleton — created on first call, never during SSR
let _bridge: ExtensionBridge | null = null

export function getExtensionBridge(): ExtensionBridge | null {
  if (typeof window === 'undefined') return null
  if (!_bridge) _bridge = new ExtensionBridge()
  return _bridge
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const values = new Uint32Array(4)
    globalThis.crypto.getRandomValues(values)
    return `req_${Date.now().toString(36)}_${Array.from(values, value => value.toString(36)).join('')}`
  }

  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}
