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
const SCHEDULE_STORAGE_KEY = 'xegineer:scheduled-publishes'
const SCHEDULE_ALARM_PREFIX = 'xegineer-schedule:'
const executingScheduledJobIds = new Set<string>()

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
  type:
    | 'LIST_PLATFORMS'
    | 'CHECK_AUTH'
    | 'PUBLISH'
    | 'SCHEDULE_PUBLISH'
    | 'CANCEL_SCHEDULED_PUBLISH'
    | 'RETRY_SCHEDULED_PUBLISH'
    | 'LIST_SCHEDULED_PUBLISHES'
  requestId: string
  payload: unknown
}

interface XEgineerResponse {
  requestId: string
  success: boolean
  data?: unknown
  error?: string
}

type ScheduledPublishStatus = 'scheduled' | 'draft_ready' | 'running' | 'publishing' | 'success' | 'error' | 'cancelled'

interface ScheduledPublishTarget {
  platformId: string
  platformName: string
  article: Record<string, unknown>
}

interface ScheduledPublishResult {
  platformId: string
  platformName: string
  success: boolean
  url?: string
  postId?: string
  isDraft: boolean
  error?: string
  message?: string
}

interface ScheduledPublishJob {
  id: string
  articleId?: number
  articleTitle: string
  scheduledAt: number
  createdAt: number
  updatedAt: number
  status: ScheduledPublishStatus
  targets: ScheduledPublishTarget[]
  results?: ScheduledPublishResult[]
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(SCHEDULE_ALARM_PREFIX)) return
  const jobId = alarm.name.slice(SCHEDULE_ALARM_PREFIX.length)
  void executeScheduledPublish(jobId)
})

chrome.runtime.onStartup.addListener(() => {
  void restoreScheduledPublishAlarms()
})

chrome.runtime.onInstalled.addListener(() => {
  void restoreScheduledPublishAlarms()
})

void restoreScheduledPublishAlarms()

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
      const result = await publishToPlatform(platformId, article)
      return {
        requestId,
        success: true,
        data: result,
      }
    }

    case 'SCHEDULE_PUBLISH': {
      const job = await schedulePublish(payload as {
        articleId?: number
        articleTitle: string
        scheduledAt: number
        targets: ScheduledPublishTarget[]
      })
      return { requestId, success: true, data: job }
    }

    case 'CANCEL_SCHEDULED_PUBLISH': {
      const { jobId } = payload as { jobId: string }
      const job = await cancelScheduledPublish(jobId)
      return { requestId, success: true, data: job }
    }

    case 'RETRY_SCHEDULED_PUBLISH': {
      const { jobId } = payload as { jobId: string }
      await executeScheduledPublish(jobId, { force: true })
      const job = (await getScheduledPublishJobs()).find(item => item.id === jobId)
      if (!job) return { requestId, success: false, error: `Scheduled publish not found: ${jobId}` }
      return { requestId, success: true, data: job }
    }

    case 'LIST_SCHEDULED_PUBLISHES': {
      await restoreScheduledPublishAlarms()
      const jobs = await getScheduledPublishJobs()
      return { requestId, success: true, data: jobs }
    }

    default:
      return { requestId, success: false, error: `Unknown message type: ${type}` }
  }
}

async function publishToPlatform(platformId: string, article: Record<string, unknown>): Promise<ScheduledPublishResult> {
  const adapter = await getAdapter(platformId)
  const result = await adapter.publish(toWechatSyncArticle(article))

  return {
    platformId,
    platformName: ADAPTERS[platformId] ? platformId : platformId,
    success: result.success,
    url: result.postUrl,
    postId: result.postId,
    isDraft: result.draftOnly ?? true,
    error: result.error,
    message: result.message,
  }
}

function toWechatSyncArticle(article: Record<string, unknown>): Article {
  return {
    title: article.title as string,
    markdown: (article.markdownContent as string | undefined) ?? '',
    html: article.content as string | undefined,
    summary: article.summary as string | undefined ?? article.brief as string | undefined,
    cover: article.cover as string | undefined ?? article.coverImage as string | undefined,
    tags: article.tags as string[] | undefined,
    category: article.categoryId as string | undefined ?? article.category as string | undefined,
  }
}

async function schedulePublish(input: {
  articleId?: number
  articleTitle: string
  scheduledAt: number
  targets: ScheduledPublishTarget[]
}): Promise<ScheduledPublishJob> {
  if (!input.targets.length) throw new Error('No publish targets selected')
  if (!Number.isFinite(input.scheduledAt) || input.scheduledAt <= Date.now()) {
    throw new Error('Scheduled time must be in the future')
  }

  const now = Date.now()
  const draftResults = await Promise.all(input.targets.map(async target => {
    try {
      const result = await publishToPlatform(target.platformId, target.article)
      if (result.success && !result.postId) {
        return {
          ...result,
          platformName: target.platformName,
          success: false,
          isDraft: true,
          error: '平台未返回草稿 ID，无法纳入定时发布',
        }
      }

      return {
        ...result,
        platformName: target.platformName,
        isDraft: true,
      }
    } catch (error) {
      return {
        platformId: target.platformId,
        platformName: target.platformName,
        success: false,
        isDraft: true,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }))

  const createdDrafts = draftResults.filter(result => result.success && result.postId)
  const failedDrafts = draftResults.filter(result => !result.success)

  if (!createdDrafts.length) {
    throw new Error(failedDrafts.map(result => `${result.platformName}: ${result.error ?? '创建草稿失败'}`).join('; ') || '创建草稿失败')
  }

  const job: ScheduledPublishJob = {
    id: createJobId(),
    articleId: input.articleId,
    articleTitle: input.articleTitle || '无标题文章',
    scheduledAt: input.scheduledAt,
    createdAt: now,
    updatedAt: now,
    status: 'draft_ready',
    targets: input.targets,
    results: draftResults,
    error: failedDrafts.length ? failedDrafts.map(result => `${result.platformName}: ${result.error ?? '创建草稿失败'}`).join('; ') : undefined,
  }

  const jobs = await getScheduledPublishJobs()
  jobs.push(job)
  await saveScheduledPublishJobs(jobs)
  await createScheduledPublishAlarm(job)

  return job
}

async function cancelScheduledPublish(jobId: string): Promise<ScheduledPublishJob> {
  const jobs = await getScheduledPublishJobs()
  const job = jobs.find(item => item.id === jobId)
  if (!job) throw new Error(`Scheduled publish not found: ${jobId}`)
  if (job.status === 'running' || job.status === 'publishing') throw new Error('Scheduled publish is already running')

  const updated: ScheduledPublishJob = {
    ...job,
    status: 'cancelled',
    updatedAt: Date.now(),
  }

  await chrome.alarms.clear(alarmName(jobId))
  await saveScheduledPublishJobs(jobs.map(item => item.id === jobId ? updated : item))
  return updated
}

async function executeScheduledPublish(jobId: string, options: { force?: boolean } = {}): Promise<void> {
  if (executingScheduledJobIds.has(jobId)) return
  executingScheduledJobIds.add(jobId)

  try {
    const jobs = await getScheduledPublishJobs()
    const job = jobs.find(item => item.id === jobId)
    const canRun = job && (isAwaitingScheduledPublish(job.status) || (options.force && job.status === 'error'))
    if (!job || !canRun) return

    await updateScheduledPublishJob(jobId, {
      status: 'publishing',
      updatedAt: Date.now(),
      error: undefined,
    })

    const results: ScheduledPublishResult[] = []
    const existingResults = job.results ?? []

    for (const target of job.targets) {
      const draft = existingResults.find(result => result.platformId === target.platformId)

      if (draft && (!draft.success || !draft.postId)) {
        results.push(draft)
        continue
      }

      try {
        const result = draft?.postId
          ? await publishExistingDraft(target.platformId, target.platformName, draft)
          : await publishLegacyScheduledTarget(target)

        results.push({
          ...result,
          platformName: target.platformName,
        })
      } catch (error) {
        results.push({
          platformId: target.platformId,
          platformName: target.platformName,
          success: false,
          isDraft: true,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const failed = results.filter(result => !result.success || result.isDraft)
    await updateScheduledPublishJob(jobId, {
      status: failed.length ? 'error' : 'success',
      updatedAt: Date.now(),
      results,
      error: failed.length ? failed.map(result => `${result.platformName}: ${result.error ?? (result.isDraft ? '仍是草稿，未完成公开发布' : '发布失败')}`).join('; ') : undefined,
    })
  } catch (error) {
    await updateScheduledPublishJob(jobId, {
      status: 'error',
      updatedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    executingScheduledJobIds.delete(jobId)
  }
}

async function publishExistingDraft(
  platformId: string,
  platformName: string,
  draft: ScheduledPublishResult
): Promise<ScheduledPublishResult> {
  if (!draft.postId) {
    return {
      platformId,
      platformName,
      success: false,
      url: draft.url,
      isDraft: true,
      error: '缺少草稿 ID，无法自动发布',
    }
  }

  const adapter = await getAdapter(platformId)
  const draftPublisher = adapter as BaseAdapter & {
    publishExistingDraft?: (draftRef: { postId: string; postUrl?: string }) => Promise<{
      success: boolean
      postId?: string
      postUrl?: string
      draftOnly?: boolean
      error?: string
      message?: string
    }>
    publishDraft?: (draftRef: { postId: string; postUrl?: string }) => Promise<{
      success: boolean
      postId?: string
      postUrl?: string
      draftOnly?: boolean
      error?: string
      message?: string
    }>
  }

  const publishDraft = draftPublisher.publishExistingDraft ?? draftPublisher.publishDraft
  if (typeof publishDraft !== 'function') {
    return {
      platformId,
      platformName,
      success: false,
      url: draft.url,
      postId: draft.postId,
      isDraft: true,
      error: `${platformName} 暂未接入“自动发布已有草稿”能力，请打开草稿手动发布。`,
      message: '草稿已保留，定时任务没有创建新草稿。',
    }
  }

  const result = await publishDraft.call(adapter, {
    postId: draft.postId,
    postUrl: draft.url,
  })

  return {
    platformId,
    platformName,
    success: result.success,
    url: result.postUrl ?? draft.url,
    postId: result.postId ?? draft.postId,
    isDraft: result.draftOnly ?? false,
    error: result.error,
    message: result.message,
  }
}

async function publishLegacyScheduledTarget(target: ScheduledPublishTarget): Promise<ScheduledPublishResult> {
  const result = await publishToPlatform(target.platformId, target.article)

  return {
    ...result,
    platformName: target.platformName,
    isDraft: true,
    message: result.message ?? '旧版定时任务没有草稿记录，已按旧流程生成草稿；请手动确认发布。',
  }
}

function isAwaitingScheduledPublish(status: ScheduledPublishStatus): boolean {
  return status === 'scheduled' || status === 'draft_ready'
}

async function restoreScheduledPublishAlarms(): Promise<void> {
  const jobs = await getScheduledPublishJobs()
  const now = Date.now()

  await Promise.all(jobs.map(async job => {
    if (!isAwaitingScheduledPublish(job.status)) return

    if (job.scheduledAt <= now) {
      void executeScheduledPublish(job.id)
      return
    }

    await createScheduledPublishAlarm(job)
  }))
}

async function createScheduledPublishAlarm(job: ScheduledPublishJob): Promise<void> {
  try {
    await chrome.alarms.create(alarmName(job.id), { when: job.scheduledAt })
  } catch (error) {
    await updateScheduledPublishJob(job.id, {
      updatedAt: Date.now(),
      error: `定时触发器创建失败: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

async function getScheduledPublishJobs(): Promise<ScheduledPublishJob[]> {
  const result = await chrome.storage.local.get(SCHEDULE_STORAGE_KEY)
  return Array.isArray(result[SCHEDULE_STORAGE_KEY]) ? result[SCHEDULE_STORAGE_KEY] as ScheduledPublishJob[] : []
}

async function saveScheduledPublishJobs(jobs: ScheduledPublishJob[]): Promise<void> {
  const sorted = jobs
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100)
  await chrome.storage.local.set({ [SCHEDULE_STORAGE_KEY]: sorted })
}

async function updateScheduledPublishJob(
  jobId: string,
  patch: Partial<ScheduledPublishJob>
): Promise<void> {
  const jobs = await getScheduledPublishJobs()
  await saveScheduledPublishJobs(jobs.map(job => job.id === jobId ? { ...job, ...patch } : job))
}

function alarmName(jobId: string): string {
  return `${SCHEDULE_ALARM_PREFIX}${jobId}`
}

function createJobId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `schedule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
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
