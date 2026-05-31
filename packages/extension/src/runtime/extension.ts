import type { RuntimeInterface, RuntimeConfig } from '../platform-adapters/runtime/interface'
import type { Cookie, HeaderRule } from '../platform-adapters/types'

// Extension implementation of RuntimeInterface
// Runs in Service Worker context
export class ExtensionRuntime implements RuntimeInterface {
  readonly type = 'extension' as const

  // Use a fixed base + counter to avoid ID collisions (Date.now() can repeat on fast calls)
  private ruleIdBase = Math.floor(Math.random() * 100000) * 1000
  private ruleIdCounter = 1

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return globalThis.fetch(url, options)
  }

  cookies = {
    async get(domain: string): Promise<Cookie[]> {
      const cookies = await chrome.cookies.getAll({ domain })
      return cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: c.expirationDate,
      }))
    },
    async set(cookie: Cookie): Promise<void> {
      await chrome.cookies.set({
        url: `https://${cookie.domain}${cookie.path ?? '/'}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expirationDate,
      })
    },
    async remove(name: string, domain: string): Promise<void> {
      await chrome.cookies.remove({ url: `https://${domain}/`, name })
    },
  }

  async getCookie(domain: string, name: string): Promise<string | null> {
    const cookies = await chrome.cookies.getAll({ domain, name })
    return cookies.length > 0 ? cookies[0].value : null
  }

  storage = {
    async get<T>(key: string): Promise<T | null> {
      const result = await chrome.storage.local.get(key)
      return (result[key] as T) ?? null
    },
    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.local.set({ [key]: value })
    },
    async remove(key: string): Promise<void> {
      await chrome.storage.local.remove(key)
    },
  }

  session = {
    async get<T>(key: string): Promise<T | null> {
      const result = await chrome.storage.session.get(key)
      return (result[key] as T) ?? null
    },
    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.session.set({ [key]: value })
    },
  }

  headerRules = {
    add: async (rule: HeaderRule): Promise<string> => {
      const numericId = this.ruleIdBase + this.ruleIdCounter++
      const id = `rule_${numericId}`
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
          id: numericId,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            requestHeaders: Object.entries(rule.headers).map(([header, value]) => ({
              header,
              value: value as string,
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            })),
          },
          condition: {
            urlFilter: rule.urlFilter,
            initiatorDomains: [chrome.runtime.id],
            resourceTypes: (rule.resourceTypes as chrome.declarativeNetRequest.ResourceType[]) ?? [
              'xmlhttprequest' as chrome.declarativeNetRequest.ResourceType,
            ],
          },
        }],
      })
      return id
    },
    remove: async (ruleId: string): Promise<void> => {
      const numericId = parseInt(ruleId.replace('rule_', ''), 10)
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [numericId],
      })
    },
    clear: async (): Promise<void> => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules()
      if (rules.length === 0) return
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: rules.map(r => r.id),
      })
    },
  }

  downloads = {
    async download(blob: Blob, filename: string, saveAs = true): Promise<number> {
      const url = URL.createObjectURL(blob)
      const id = await chrome.downloads.download({ url, filename, saveAs })
      URL.revokeObjectURL(url)
      return id
    },
  }

  tabs = {
    async query(urlPattern: string) {
      return chrome.tabs.query({ url: urlPattern }) as Promise<Array<{ id: number; url?: string }>>
    },
    async create(url: string, active = false) {
      return chrome.tabs.create({ url, active }) as Promise<{ id: number }>
    },
    async waitForLoad(tabId: number, timeout = 30000): Promise<void> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Tab load timeout')), timeout)
        const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
          if (id === tabId && info.status === 'complete') {
            clearTimeout(timer)
            chrome.tabs.onUpdated.removeListener(listener)
            resolve()
          }
        }
        chrome.tabs.onUpdated.addListener(listener)
      })
    },
    async executeScript<T, A extends unknown[]>(
      tabId: number,
      func: (...args: A) => T | Promise<T>,
      args: A,
      world: 'ISOLATED' | 'MAIN' = 'ISOLATED'
    ): Promise<T> {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args,
        world: world === 'MAIN' ? 'MAIN' : 'ISOLATED',
      })
      return results[0]?.result as T
    },
  }

  dom = {
    async parseHTML(html: string): Promise<Document> {
      // Service Worker has no DOM — use offscreen document or regex
      // For MVP: return a minimal stub; adapters should use regex instead
      throw new Error('DOM parsing not available in Service Worker. Use regex-based parsing.')
    },
    querySelector(_doc: Document, _selector: string) { return null },
    querySelectorAll(_doc: Document, _selector: string) { return [] },
    getTextContent(el: Element) { return el.textContent ?? '' },
    getInnerHTML(el: Element) { return el.innerHTML },
  }
}
