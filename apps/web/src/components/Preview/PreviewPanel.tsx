'use client'

import { useState, useMemo, useRef } from 'react'
import { tiptapToAST, getRenderer, getAllRenderers, renderToH5HTML } from '@xegineer/renderer'

interface PreviewPanelProps {
  title: string
  tiptapJSON: string
}

const PLATFORMS = [
  { id: 'weixin-h5', name: 'H5 渲染' },
  ...getAllRenderers().map(renderer => ({
    id: renderer.platformId,
    name: renderer.platformName,
  })),
]

/* removed legacy static preview list
[
  { id: 'zhihu', name: '知乎' },
  { id: 'bilibili', name: 'B站' },
  { id: 'juejin', name: '掘金' },
]
*/

export function PreviewPanel({ title, tiptapJSON }: PreviewPanelProps) {
  const [activePlatform, setActivePlatform] = useState('zhihu')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const previewHTML = useMemo(() => {
    if (!tiptapJSON) return ''
    try {
      const doc = JSON.parse(tiptapJSON)
      const ast = tiptapToAST(doc, title)
      if (activePlatform === 'weixin-h5') {
        return renderToH5HTML(ast)
      }
      const renderer = getRenderer(activePlatform)
      if (!renderer) return '<p>暂无预览</p>'
      return renderer.renderPreview(ast)
    } catch {
      return '<p>预览生成失败</p>'
    }
  }, [title, tiptapJSON, activePlatform])

  const focusPlatform = (index: number) => {
    const next = (index + PLATFORMS.length) % PLATFORMS.length
    setActivePlatform(PLATFORMS[next].id)
    requestAnimationFrame(() => tabRefs.current[next]?.focus())
  }

  const handleTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusPlatform(index + 1)
      return
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusPlatform(index - 1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusPlatform(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusPlatform(PLATFORMS.length - 1)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] border-l border-[var(--border-default)]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)]" role="tablist" aria-label="平台预览">
        <span className="text-xs text-[var(--fg-tertiary)] mr-2 select-none">预览</span>
        {PLATFORMS.map((p, index) => (
          <button
            key={p.id}
            ref={(node) => { tabRefs.current[index] = node }}
            type="button"
            role="tab"
            aria-selected={activePlatform === p.id}
            tabIndex={activePlatform === p.id ? 0 : -1}
            onClick={() => setActivePlatform(p.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
            className={`px-3 py-1 text-xs rounded-md transition-all duration-[120ms] ease-out active:scale-[0.97] ${
              activePlatform === p.id
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="preview-content"
          dangerouslySetInnerHTML={{ __html: previewHTML }}
        />
      </div>
    </div>
  )
}
