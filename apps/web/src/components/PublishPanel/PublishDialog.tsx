'use client'

import { AlertCircle, CheckCircle, XCircle, Loader2, ExternalLink, RotateCcw } from 'lucide-react'
import { usePublishStore } from '@/stores/publish'
import { useArticleStore } from '@/stores/article'
import { tiptapToAST, getRenderer } from '@xegineer/renderer'

export function PublishDialog() {
  const { platforms, isPublishing, showPublishDialog, setShowPublishDialog, publish, publishOne, resetPublishStatus } = usePublishStore()
  const { current } = useArticleStore()

  const selected = platforms.filter(p => p.selected)
  const hasResults = selected.some(p => p.publishStatus !== 'idle' && p.publishStatus !== 'pending')

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

  const handleClose = () => {
    setShowPublishDialog(false)
    resetPublishStatus()
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
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">默认保存为草稿，请在各平台确认后手动发布</p>
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
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isPublishing && <Loader2 size={14} className="animate-spin" />}
              确认发布
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
