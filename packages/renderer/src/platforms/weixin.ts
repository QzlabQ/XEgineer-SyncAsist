import { BaseRenderer } from '../base'
import type { ContentDocument, ContentNode, InlineNode, PlatformConfig, PlatformPayload, MetaField } from '../types'

export class WeixinRenderer extends BaseRenderer {
  platformId = 'weixin'
  platformName = '微信公众号'

  metaSchema: MetaField[] = [
    { key: 'cover', label: '封面图', type: 'image' },
    { key: 'summary', label: '摘要', type: 'textarea', placeholder: '不填则自动截取正文前120字' },
  ]

  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload {
    return {
      title: doc.meta.title,
      content: this.renderBody(doc.body),
      summary: config.summary ?? this.autoSummary(doc),
      cover: config.cover ?? doc.meta.cover,
      isDraft: config.isDraft ?? true,
    }
  }

  renderPreview(doc: ContentDocument): string {
    return `<div style="max-width:677px;margin:0 auto;padding:24px 18px;background:#fff;color:#333;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
<h1 style="font-size:22px;line-height:1.4;font-weight:600;margin:0 0 20px;color:#111;">${esc(doc.meta.title)}</h1>
${this.renderBody(doc.body)}
</div>`
  }

  private renderBody(nodes: ContentNode[]): string {
    return nodes.map(node => this.renderBlock(node)).join('')
  }

  private renderBlock(node: ContentNode): string {
    switch (node.type) {
      case 'heading': {
        const sizes: Record<number, string> = { 1: '20px', 2: '18px', 3: '16px' }
        return `<h${node.level} style="font-size:${sizes[node.level] ?? '16px'};line-height:1.55;font-weight:600;margin:24px 0 12px;color:#222;">${this.renderInline(node.children)}</h${node.level}>`
      }
      case 'paragraph': {
        const inner = this.renderInline(node.children)
        return `<p style="font-size:15px;line-height:1.85;margin:0 0 14px;color:#333;">${inner || '<br>'}</p>`
      }
      case 'image':
        return `<figure style="margin:18px 0;text-align:center;"><img src="${attr(node.src)}" alt="${attr(node.alt ?? '')}" style="max-width:100%;height:auto;border-radius:4px;display:block;margin:0 auto;" />${node.caption ? `<figcaption style="font-size:13px;color:#888;margin-top:8px;">${esc(node.caption)}</figcaption>` : ''}</figure>`
      case 'code_block':
        return `<pre style="background:#f6f8fa;border-radius:6px;padding:14px;overflow:auto;font-size:13px;line-height:1.6;margin:16px 0;"><code>${esc(node.code)}</code></pre>`
      case 'blockquote':
        return `<blockquote style="border-left:4px solid #d0d7de;background:#f6f8fa;margin:16px 0;padding:10px 14px;color:#57606a;">${this.renderBody(node.children)}</blockquote>`
      case 'bullet_list':
        return `<ul style="padding-left:22px;margin:0 0 14px;">${node.items.map(item => `<li style="margin:4px 0;line-height:1.8;">${this.renderBody(item.children)}</li>`).join('')}</ul>`
      case 'ordered_list':
        return `<ol start="${node.start}" style="padding-left:22px;margin:0 0 14px;">${node.items.map(item => `<li style="margin:4px 0;line-height:1.8;">${this.renderBody(item.children)}</li>`).join('')}</ol>`
      case 'task_list':
        return `<ul style="padding-left:0;margin:0 0 14px;list-style:none;">${node.items.map(item => `<li style="margin:4px 0;line-height:1.8;"><input type="checkbox" ${item.checked ? 'checked' : ''} disabled /> ${this.renderBody(item.children)}</li>`).join('')}</ul>`
      case 'table':
        return `<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;"><tbody>${node.rows.map(row => `<tr>${row.cells.map(cell => `<${cell.isHeader ? 'th' : 'td'} style="border:1px solid #d8dee4;padding:8px 10px;text-align:left;vertical-align:top;${cell.isHeader ? 'background:#f6f8fa;font-weight:600;' : ''}">${this.renderBody(cell.children)}</${cell.isHeader ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table>`
      case 'divider':
        return '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />'
      case 'embed':
        return `<p style="font-size:15px;line-height:1.85;margin:0 0 14px;"><a href="${attr(node.url)}" style="color:#576b95;text-decoration:none;">${esc(node.title ?? node.url)}</a></p>`
      default:
        return ''
    }
  }

  private renderInline(nodes: InlineNode[]): string {
    return nodes.map(node => {
      if (node.type === 'hardBreak') return '<br>'
      if (node.type === 'inlineImage') return `<img src="${attr(node.src)}" alt="${attr(node.alt ?? '')}" style="max-width:100%;height:auto;vertical-align:middle;" />`
      if (node.type !== 'text') return ''

      let html = esc(node.text)
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold': html = `<strong style="font-weight:600;">${html}</strong>`; break
          case 'italic': html = `<em>${html}</em>`; break
          case 'underline': html = `<span style="text-decoration:underline;">${html}</span>`; break
          case 'strike': html = `<span style="text-decoration:line-through;">${html}</span>`; break
          case 'code': html = `<code style="background:#f2f3f5;border-radius:3px;padding:2px 4px;font-size:13px;">${html}</code>`; break
          case 'link': html = `<a href="${attr(mark.href)}" style="color:#576b95;text-decoration:none;">${html}</a>`; break
          case 'color': html = `<span style="color:${attr(mark.color)};">${html}</span>`; break
          case 'highlight': html = `<span style="background:${attr(mark.color)};">${html}</span>`; break
        }
      }
      return html
    }).join('')
  }
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function attr(value: string): string {
  return esc(value).replace(/'/g, '&#39;')
}
