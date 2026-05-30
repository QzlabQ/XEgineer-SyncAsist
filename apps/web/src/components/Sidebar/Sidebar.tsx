'use client'

import { useEffect, useMemo } from 'react'
import { CheckCircle, AlertCircle, RefreshCw, Upload } from 'lucide-react'
import { usePublishStore } from '@/stores/publish'
import { useArticleStore } from '@/stores/article'
import { extractImages, extractPlainText, tiptapToAST } from '@xegineer/renderer'
import type { MetaField, PlatformConfig } from '@xegineer/renderer'

export function Sidebar() {
  const { current } = useArticleStore()
  const { platforms, initPlatforms, loadConfigs, togglePlatform, updateConfig, checkAuth } = usePublishStore()

  useEffect(() => {
    initPlatforms()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (current?.id) {
      void loadConfigs(current.id)
    }
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const articleHelpers = useMemo(() => {
    if (!current?.tiptapJSON) return { images: [] as string[], summary: '' }
    try {
      const ast = tiptapToAST(JSON.parse(current.tiptapJSON), current.title)
      return {
        images: extractImages(ast.body),
        summary: extractPlainText(ast.body, 120),
      }
    } catch {
      return { images: [] as string[], summary: '' }
    }
  }, [current?.tiptapJSON, current?.title])

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
                {platform.schema.map(field => (
                  <ConfigField
                    key={field.key}
                    field={field}
                    config={platform.config}
                    images={articleHelpers.images}
                    autoSummary={articleHelpers.summary}
                    onChange={(patch) => updateConfig(platform.id, patch)}
                  />
                ))}
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

function ConfigField({
  field,
  config,
  images,
  autoSummary,
  onChange,
}: {
  field: MetaField
  config: PlatformConfig
  images: string[]
  autoSummary: string
  onChange: (patch: Partial<PlatformConfig>) => void
}) {
  const value = config[field.key]
  const label = `${field.label}${field.required ? ' *' : ''}`

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => onChange({ [field.key]: e.target.checked })}
          className="rounded"
        />
        {label}
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange({ [field.key]: e.target.value })}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-400"
        >
          <option value="">请选择</option>
          {(field.options ?? []).map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    )
  }

  if (field.type === 'tags') {
    return (
      <div>
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        <input
          type="text"
          placeholder={field.placeholder ?? '逗号分隔'}
          value={Array.isArray(value) ? value.join(', ') : ''}
          onChange={e => onChange({
            [field.key]: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
          })}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
        />
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        <textarea
          rows={3}
          placeholder={field.key === 'summary' && autoSummary ? `自动摘要：${autoSummary}` : field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange({ [field.key]: e.target.value })}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-blue-400"
        />
      </div>
    )
  }

  if (field.type === 'image') {
    const imageValue = typeof value === 'string' ? value : ''
    return (
      <div>
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        {imageValue && (
          <img src={imageValue} alt="" className="w-full h-20 object-cover rounded border border-gray-200 mb-1" />
        )}
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="图片 URL"
            value={imageValue}
            onChange={e => onChange({ [field.key]: e.target.value })}
            className="min-w-0 flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
          />
          <label className="p-1.5 text-gray-500 border border-gray-200 rounded cursor-pointer hover:bg-gray-100" title="上传图片">
            <Upload size={13} />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => onChange({ [field.key]: ev.target?.result as string })
                reader.readAsDataURL(file)
              }}
            />
          </label>
        </div>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {images.slice(0, 6).map((src, index) => (
              <button
                key={`${src}-${index}`}
                type="button"
                onClick={() => onChange({ [field.key]: src })}
                className={`w-8 h-8 rounded border overflow-hidden ${imageValue === src ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}`}
                title="使用正文图片"
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type="text"
        placeholder={field.placeholder}
        value={typeof value === 'string' ? value : ''}
        onChange={e => onChange({ [field.key]: e.target.value })}
        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
      />
    </div>
  )
}
