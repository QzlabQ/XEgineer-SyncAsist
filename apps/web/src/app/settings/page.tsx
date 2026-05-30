'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { usePublishStore } from '@/stores/publish'
import { getExtensionBridge } from '@/lib/extension-bridge'

export default function SettingsPage() {
  const router = useRouter()
  const { platforms, initPlatforms, checkAllAuth } = usePublishStore()
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null)
  const [extensionError, setExtensionError] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    initPlatforms()
    checkExtension()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkExtension = async () => {
    const bridge = getExtensionBridge()
    if (!bridge) {
      setExtensionInstalled(false)
      setExtensionError('当前页面不支持扩展桥接')
      return
    }
    const installed = await bridge.isInstalled()
    setExtensionInstalled(installed)
    setExtensionError(bridge.getLastError())
  }

  const handleCheckAll = async () => {
    setChecking(true)
    await checkAllAuth()
    setChecking(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold text-gray-900">设置</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Extension status */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">浏览器扩展</h2>
          {extensionInstalled === null && <p className="text-sm text-gray-400">检测中...</p>}
          {extensionInstalled === false && (
            <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
              <AlertCircle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-800">扩展未安装</p>
                <p className="text-xs text-orange-600 mt-1">需要安装 XEgineer 浏览器扩展才能发布文章</p>
                <p className="text-xs text-orange-500 mt-2">请在本地加载 packages/extension/dist 目录，并在重载扩展后刷新当前页面</p>
                <ol className="mt-3 space-y-1 text-xs text-orange-700 list-decimal list-inside">
                  <li>运行 `yarn workspace @xegineer/extension build` 生成 dist</li>
                  <li>打开浏览器扩展管理页并开启开发者模式</li>
                  <li>选择“加载已解压的扩展程序”，目录选 packages/extension/dist</li>
                  <li>回到 localhost 页面后点击重新检测</li>
                </ol>
                {extensionError && (
                  <p className="text-xs text-orange-700 mt-2">检测结果：{extensionError}</p>
                )}
                <button
                  onClick={checkExtension}
                  className="mt-3 text-xs text-orange-700 hover:text-orange-900 underline"
                >
                  重新检测
                </button>
              </div>
            </div>
          )}
          {extensionInstalled === true && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle size={16} />
              扩展已安装并运行
            </div>
          )}
        </section>

        {/* Platform accounts */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">平台账号</h2>
            <button
              onClick={handleCheckAll}
              disabled={checking}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
              全部刷新
            </button>
          </div>

          <div className="space-y-3">
            {platforms.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  {p.username && <span className="text-xs text-gray-400 ml-2">@{p.username}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {p.authStatus === 'authenticated' && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle size={13} /> 已登录
                    </span>
                  )}
                  {p.authStatus === 'unauthenticated' && (
                    <span className="flex items-center gap-1 text-xs text-orange-500">
                      <AlertCircle size={13} /> 未登录
                    </span>
                  )}
                  {p.authStatus === 'unknown' && (
                    <span className="text-xs text-gray-400">未检测</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-4">
            如需登录某平台，请在浏览器中直接访问该平台并登录，然后点击"全部刷新"
          </p>
        </section>
      </main>
    </div>
  )
}
