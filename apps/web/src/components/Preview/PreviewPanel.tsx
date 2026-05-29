'use client'

import { useState, useMemo } from 'react'
import { tiptapToAST, getRenderer } from '@xegineer/renderer'

interface PreviewPanelProps {
  title: string
  tiptapJSON: string
}

const PLATFORMS = [
  { id: 'zhihu', name: '知乎' },
  { id: 'bilibili', name: 'B站' },
  { id: 'juejin', name: '掘金' },
]

export function PreviewPanel({ title, tiptapJSON }: PreviewPanelProps) {
  const [activePlatform, setActivePlatform] = useState('zhihu')

  const previewHTML = useMemo(() => {
    if (!tiptapJSON) return ''
    try {
      const doc = JSON.parse(tiptapJSON)
      const ast = tiptapToAST(doc, title)
      const renderer = getRenderer(activePlatform)
      if (!renderer) return '<p>暂无预览</p>'
      return renderer.renderPreview(ast)
    } catch {
      return '<p>预览生成失败</p>'
    }
  }, [title, tiptapJSON, activePlatform])

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white">
        <span className="text-xs text-gray-500 mr-2">预览</span>
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePlatform(p.id)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              activePlatform === p.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
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
