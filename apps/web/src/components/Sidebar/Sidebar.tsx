'use client'

import { useEffect, useMemo } from 'react'
import { CheckCircle, AlertCircle, RefreshCw, Upload, X } from 'lucide-react'
import { usePublishStore } from '@/stores/publish'
import { useArticleStore } from '@/stores/article'
import { extractImages, extractPlainText, tiptapToAST } from '@xegineer/renderer'
import type { MetaField, PlatformConfig } from '@xegineer/renderer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
    <div className="w-60 flex-shrink-0 border-r border-[var(--border-default)] bg-[var(--bg-subtle)] flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-[var(--border-default)]">
        <h3 className="text-[11px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-widest select-none">发布平台</h3>
      </div>

      <div className="flex-1 py-1">
        {platforms.map((platform, i) => (
          <div key={platform.id} className="px-2 py-0.5 stagger-item" style={{ animationDelay: `${i * 30}ms` }}>
            <div
              className="flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer hover:bg-[var(--bg-hover)] active:scale-[0.98] transition-all duration-[120ms] ease-out"
              onClick={() => togglePlatform(platform.id)}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-[120ms] ease-out ${
                platform.selected ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-hover)]'
              }`}>
                {platform.selected && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-[13px] text-[var(--fg-primary)] flex-1 font-medium">{platform.name}</span>
              <div className="flex items-center gap-1">
                {platform.authStatus === 'authenticated' && <CheckCircle size={13} className="text-[var(--success)]" />}
                {platform.authStatus === 'unauthenticated' && <AlertCircle size={13} className="text-[var(--warning)]" />}
                <button
                  onClick={(e) => handleCheckAuth(platform.id, e)}
                  className="p-1 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] rounded transition-all duration-[120ms] ease-out active:scale-90"
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
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id={`draft-${platform.id}`}
                    checked={platform.config.isDraft ?? true}
                    onChange={e => updateConfig(platform.id, { isDraft: e.target.checked })}
                    className="rounded-sm accent-[var(--accent)]"
                  />
                  <label htmlFor={`draft-${platform.id}`} className="text-[11px] text-[var(--fg-tertiary)] cursor-pointer select-none">保存为草稿</label>
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
      <label className="flex items-center gap-2 text-xs text-[var(--fg-tertiary)] cursor-pointer select-none">
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
      <div className="min-w-0">
        <label className="text-[11px] text-[var(--fg-tertiary)] block mb-1 font-medium">{label}</label>
        <Select value={typeof value === 'string' ? value : ''} onValueChange={v => onChange({ [field.key]: v })}>
          <SelectTrigger className="h-auto py-1.5 text-xs">
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map(option => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (field.type === 'tags') {
    return (
      <div className="min-w-0">
        <label className="text-[11px] text-[var(--fg-tertiary)] block mb-1 font-medium">{label}</label>
        <input
          type="text"
          placeholder={field.placeholder ?? '逗号分隔'}
          value={Array.isArray(value) ? value.join(', ') : ''}
          onChange={e => onChange({
            [field.key]: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
          })}
          className="block w-full min-w-0 text-xs border border-[var(--border-default)] rounded-md px-2 py-1.5 bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all duration-[120ms] ease-out hover:border-[var(--border-hover)] placeholder:text-[var(--fg-tertiary)]"
        />
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div className="min-w-0">
        <label className="text-[11px] text-[var(--fg-tertiary)] block mb-1 font-medium">{label}</label>
        <textarea
          rows={3}
          placeholder={field.key === 'summary' && autoSummary ? `自动摘要：${autoSummary}` : field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange({ [field.key]: e.target.value })}
          className="block w-full min-w-0 text-xs border border-[var(--border-default)] rounded-md px-2 py-1.5 resize-none bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all duration-[120ms] ease-out hover:border-[var(--border-hover)]"
        />
      </div>
    )
  }

  if (field.type === 'image') {
    const imageValue = typeof value === 'string' ? value : ''
    const isDataImage = imageValue.startsWith('data:image/')
    const setImageValue = (src?: string) => {
      const patch: Partial<PlatformConfig> = { [field.key]: src }
      if (field.key === 'cover') {
        patch.cover = src
      }
      onChange(patch)
    }

    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">{label}</label>
          {imageValue && (
            <button
              type="button"
              onClick={() => setImageValue(undefined)}
              className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
              title="清空图片"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {imageValue && (
          <img src={imageValue} alt="" className="w-full h-20 object-cover rounded border border-gray-200 mb-1" />
        )}
        <div className="flex min-w-0 items-center gap-1">
          {isDataImage ? (
            <div
              className="min-w-0 flex-1 truncate rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500"
              title="本地 base64 图片已设置"
            >
              本地图片已设置（{formatImageSize(imageValue)}）
            </div>
          ) : (
            <input
              type="text"
              placeholder="图片 URL"
              value={imageValue}
              onChange={e => setImageValue(e.target.value)}
              className="min-w-0 flex-1 text-xs border border-[var(--border-default)] rounded-md px-2 py-1.5 bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all duration-[120ms] ease-out hover:border-[var(--border-hover)] placeholder:text-[var(--fg-tertiary)]"
            />
          )}
          <label className="p-1.5 text-[var(--fg-tertiary)] border border-[var(--border-default)] rounded-md cursor-pointer hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)] transition-all duration-[120ms] ease-out active:scale-90" title="上传图片">
            <Upload size={13} />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => {
                  const src = ev.target?.result
                  if (typeof src === 'string') {
                    setImageValue(src)
                  }
                }
                reader.readAsDataURL(file)
                e.currentTarget.value = ''
              }}
            />
          </label>
        </div>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {images.slice(0, 6).map((src, index) => (
              <button
                key={`${index}-${src.length}-${src.slice(0, 24)}`}
                type="button"
                onClick={() => setImageValue(src)}
                className={`w-8 h-8 rounded border overflow-hidden ${imageValue === src ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-gray-200'}`}
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
    <div className="min-w-0">
      <label className="text-[11px] text-[var(--fg-tertiary)] block mb-1 font-medium">{label}</label>
      <input
        type="text"
        placeholder={field.placeholder}
        value={typeof value === 'string' ? value : ''}
        onChange={e => onChange({ [field.key]: e.target.value })}
        className="block w-full min-w-0 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
      />
    </div>
  )
}

function formatImageSize(src: string): string {
  const base64 = src.includes(',') ? src.split(',')[1] : src
  const bytes = Math.ceil(base64.length * 3 / 4)
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${bytes} B`
}
