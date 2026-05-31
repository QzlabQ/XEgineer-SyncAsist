'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, XCircle, Loader2, ExternalLink, RotateCcw, CalendarClock } from 'lucide-react'
import { usePublishStore } from '@/stores/publish'
import { useArticleStore } from '@/stores/article'
import { db } from '@/lib/db'
import { getExtensionBridge } from '@/lib/extension-bridge'
import { tiptapToAST, getRenderer } from '@xegineer/renderer'

export function PublishDialog() {
  const { platforms, isPublishing, showPublishDialog, setShowPublishDialog, publish, publishOne, resetPublishStatus } = usePublishStore()
  const { current } = useArticleStore()
  const [scheduledAtValue, setScheduledAtValue] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleMessage, setScheduleMessage] = useState('')

  const selected = platforms.filter(p => p.selected)
  const hasResults = selected.some(p => p.publishStatus !== 'idle' && p.publishStatus !== 'pending')
  const minScheduleValue = useMemo(() => toDatetimeLocalValue(Date.now() + 60 * 1000), [])

  const buildPayload = (platformId: string) => {
    if (!current) return {}
    const doc = JSON.parse(current.tiptapJSON)
    const ast = tiptapToAST(doc, current.title)
    const renderer = getRenderer(platformId)
    if (!renderer) return {}
    const platform = platforms.find(p => p.id === platformId)
    return renderer.render(ast, platform?.config ?? {}) as Record<string, unknown>
  }

  const handlePublish = async () => {
    if (!current?.id) return
    await publish(current.id, buildPayload)
  }

  const handleRetry = async (platformId: string) => {
    if (!current?.id) return
    await publishOne(current.id, platformId, buildPayload)
  }

  const handleSchedule = async () => {
    if (!current?.id || selected.length === 0) return

    const scheduledAt = new Date(scheduledAtValue).getTime()
    if (!scheduledAtValue || !Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
      setScheduleMessage('')
      setScheduleError('请选择未来的发布时间')
      return
    }

    const bridge = getExtensionBridge()
    if (!bridge) {
      setScheduleMessage('')
      setScheduleError('未检测到浏览器扩展，无法创建后台定时任务')
      return
    }

    setScheduling(true)
    setScheduleError('')
    setScheduleMessage('')

    try {
      const targets = selected.map(platform => ({
        platformId: platform.id,
        platformName: platform.name,
        article: buildPayload(platform.id),
      }))

      const job = await bridge.schedulePublish({
        articleId: current.id,
        articleTitle: current.title,
        scheduledAt,
        targets,
      })

      await db.scheduledPublishes.add({
        jobId: job.id,
        articleId: current.id,
        articleTitle: current.title,
        platforms: selected.map(platform => platform.id),
        platformNames: selected.map(platform => platform.name),
        scheduledAt,
        createdAt: job.createdAt,
        status: job.status,
        results: JSON.stringify(job.results ?? []),
        error: job.error,
      })

      setScheduleMessage(`已创建平台草稿，并安排 ${formatScheduleTime(scheduledAt)} 发布；草稿链接可在发布历史查看`)
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error))
    } finally {
      setScheduling(false)
    }
  }

  const handleClose = () => {
    setShowPublishDialog(false)
    resetPublishStatus()
    setScheduleError('')
    setScheduleMessage('')
  }

  if (!showPublishDialog) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            {hasResults ? '发布结果' : '确认发布'}
          </h2>

          {selected.length === 0 ? (
            <p className="text-gray-500 text-sm">请先在左侧选择要发布的平台</p>
          ) : (
            <div className="space-y-3">
              {selected.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.authStatus === 'unauthenticated' && (
                      <span className="text-xs text-orange-500">未登录</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.publishStatus === 'pending' && <Loader2 size={16} className="animate-spin text-blue-500" />}
                    {p.publishStatus === 'success' && (
                      <div className="flex items-center gap-1">
                        <CheckCircle size={16} className="text-green-500" />
                        {p.publishUrl && (
                          <a href={p.publishUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
                            查看 <ExternalLink size={11} />
                          </a>
                        )}
                        {!p.publishUrl && <span className="text-xs text-green-600">已保存草稿</span>}
                        {p.publishMessage && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 max-w-40 truncate" title={p.publishMessage}>
                            <AlertCircle size={12} />
                            {p.publishMessage}
                          </span>
                        )}
                      </div>
                    )}
                    {p.publishStatus === 'error' && (
                      <div className="flex items-center gap-1">
                        <XCircle size={16} className="text-red-500" />
                        <span className="text-xs text-red-500 max-w-32 truncate" title={p.publishError}>{p.publishError ?? '失败'}</span>
                        <button
                          type="button"
                          onClick={() => handleRetry(p.id)}
                          disabled={isPublishing}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40"
                          title="重试发布"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    )}
                    {p.publishStatus === 'idle' && (
                      <span className="text-xs text-gray-400">等待中</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!hasResults && (
            <div className="mt-4 space-y-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700">立即发布会先保存为草稿；定时发布会先创建平台草稿，到点再尝试发布这份草稿</p>
              </div>

              {selected.length > 0 && (
                <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-2">
                    <CalendarClock size={14} />
                    定时发布
                  </label>
                  <input
                    type="datetime-local"
                    min={minScheduleValue}
                    value={scheduledAtValue}
                    onChange={event => {
                      setScheduledAtValue(event.target.value)
                      setScheduleError('')
                      setScheduleMessage('')
                    }}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
                  />
                  {scheduleMessage && <p className="text-xs text-green-600 mt-2">{scheduleMessage}</p>}
                  {scheduleError && <p className="text-xs text-red-500 mt-2">{scheduleError}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {hasResults ? '关闭' : '取消'}
          </button>
          {!hasResults && selected.length > 0 && (
            <>
              <button
                onClick={handleSchedule}
                disabled={scheduling || isPublishing || !scheduledAtValue}
                className="px-4 py-2 text-sm text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {scheduling ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
                创建草稿并定时
              </button>
              <button
                onClick={handlePublish}
                disabled={isPublishing || scheduling}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isPublishing && <Loader2 size={14} className="animate-spin" />}
                确认发布
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function toDatetimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatScheduleTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
