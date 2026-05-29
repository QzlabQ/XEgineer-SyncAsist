'use client'

import { useEffect } from 'react'
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { usePublishStore } from '@/stores/publish'
import { getAllRenderers } from '@xegineer/renderer'

export function Sidebar() {
  const { platforms, initPlatforms, togglePlatform, updateConfig, checkAuth } = usePublishStore()

  useEffect(() => {
    initPlatforms()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckAuth = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await checkAuth(id)
  }

  return (
    <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">发布平台</h3>
      </div>

      <div className="flex-1 py-2">
        {platforms.map(platform => (
          <div key={platform.id} className="px-3 py-1">
            <div
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => togglePlatform(platform.id)}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                platform.selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              }`}>
                {platform.selected && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-gray-700 flex-1">{platform.name}</span>
              <div className="flex items-center gap-1">
                {platform.authStatus === 'authenticated' && <CheckCircle size={13} className="text-green-500" />}
                {platform.authStatus === 'unauthenticated' && <AlertCircle size={13} className="text-orange-400" />}
                <button
                  onClick={(e) => handleCheckAuth(platform.id, e)}
                  className="p-0.5 text-gray-400 hover:text-gray-600 rounded"
                  title="检查登录状态"
                >
                  <RefreshCw size={11} />
                </button>
              </div>
            </div>

            {/* Platform config when selected */}
            {platform.selected && (
              <div className="ml-6 mt-1 mb-2 space-y-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">标签</label>
                  <input
                    type="text"
                    placeholder="逗号分隔"
                    value={(platform.config.tags ?? []).join(', ')}
                    onChange={e => updateConfig(platform.id, {
                      tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
                    })}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`draft-${platform.id}`}
                    checked={platform.config.isDraft ?? true}
                    onChange={e => updateConfig(platform.id, { isDraft: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor={`draft-${platform.id}`} className="text-xs text-gray-500">保存为草稿</label>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
