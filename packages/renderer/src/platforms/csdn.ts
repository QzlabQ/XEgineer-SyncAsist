import { BaseRenderer } from '../base'
import type { ContentDocument, PlatformConfig, PlatformPayload, MetaField } from '../types'

export class CSDNRenderer extends BaseRenderer {
  platformId = 'csdn'
  platformName = 'CSDN'

  metaSchema: MetaField[] = [
    { key: 'title', label: '标题', type: 'text', placeholder: '不填则使用文章标题' },
    { key: 'cover', label: '封面图', type: 'image' },
    { key: 'summary', label: '摘要', type: 'textarea', placeholder: '不填则自动截取正文前120字' },
    { key: 'tags', label: '标签', type: 'tags', placeholder: '逗号分隔' },
    {
      key: 'category',
      label: '分类',
      type: 'select',
      options: [
        { label: '前端', value: '前端' },
        { label: '后端', value: '后端' },
        { label: '移动开发', value: '移动开发' },
        { label: '人工智能', value: '人工智能' },
        { label: '开发工具', value: '开发工具' },
        { label: '程序人生', value: '程序人生' },
      ],
    },
  ]

  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload {
    const title = typeof config.title === 'string' && config.title.trim()
      ? config.title.trim()
      : doc.meta.title

    return {
      title,
      markdownContent: this.nodesToMarkdown(doc.body),
      content: this.nodesToHTML(doc.body),
      cover: config.cover ?? doc.meta.cover,
      summary: config.summary ?? this.autoSummary(doc),
      tags: config.tags ?? doc.meta.tags ?? [],
      category: config.category ?? '',
      isDraft: config.isDraft ?? true,
    }
  }

  renderPreview(doc: ContentDocument): string {
    return `<div style="max-width:760px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#222;line-height:1.78;">
<h1 style="font-size:28px;line-height:1.35;margin:0 0 24px;font-weight:700;">${esc(doc.meta.title)}</h1>
${simpleMarkdownToHTML(this.nodesToMarkdown(doc.body))}
</div>`
  }
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function simpleMarkdownToHTML(markdown: string): string {
  return markdown
    .split('\n')
    .map(line => {
      if (line.startsWith('### ')) return `<h3 style="font-size:18px;margin:22px 0 10px;">${esc(line.slice(4))}</h3>`
      if (line.startsWith('## ')) return `<h2 style="font-size:22px;margin:26px 0 12px;border-bottom:1px solid #eee;padding-bottom:6px;">${esc(line.slice(3))}</h2>`
      if (line.startsWith('# ')) return `<h1 style="font-size:26px;margin:28px 0 14px;">${esc(line.slice(2))}</h1>`
      if (line.startsWith('> ')) return `<blockquote style="border-left:4px solid #cbd5e1;background:#f8fafc;margin:14px 0;padding:8px 14px;color:#475569;">${esc(line.slice(2))}</blockquote>`
      if (line.startsWith('![')) {
        const match = line.match(/^!\[(.*?)\]\((.*?)\)/)
        if (match) return `<p style="text-align:center;"><img src="${esc(match[2])}" alt="${esc(match[1])}" style="max-width:100%;border-radius:4px;" /></p>`
      }
      if (!line.trim()) return ''
      return `<p style="margin:0 0 14px;">${inlineMarkdown(line)}</p>`
    })
    .join('\n')
}

function inlineMarkdown(value: string): string {
  return esc(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background:#f2f3f5;padding:2px 4px;border-radius:3px;">$1</code>')
}
