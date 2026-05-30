import { BaseRenderer } from '../base'
import type { ContentDocument, ContentNode, InlineNode, PlatformConfig, PlatformPayload, MetaField } from '../types'

export class XiaohongshuRenderer extends BaseRenderer {
  platformId = 'xiaohongshu'
  platformName = '小红书'

  metaSchema: MetaField[] = [
    { key: 'cover', label: '封面图', type: 'image' },
    { key: 'summary', label: '正文摘要', type: 'textarea', placeholder: '不填则自动截取正文前150字' },
    { key: 'tags', label: '话题标签', type: 'tags', placeholder: '输入标签，逗号分隔（不含 #）' },
  ]

  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload {
    const body = this.renderXhsBody(doc.body)
    const tags = (config.tags ?? doc.meta.tags ?? []) as string[]
    const tagLine = tags.length > 0 ? '\n\n' + tags.map(t => `#${t}`).join(' ') : ''

    return {
      title: doc.meta.title,
      content: body + tagLine,
      cover: config.cover ?? doc.meta.cover,
      summary: config.summary ?? this.autoSummary(doc),
      tags,
      isDraft: config.isDraft ?? true,
    }
  }

  renderPreview(doc: ContentDocument): string {
    const body = this.renderXhsBody(doc.body)
    const tags = (doc.meta.tags ?? []).map(t => `#${t}`).join(' ')

    return `<div style="max-width:375px;margin:0 auto;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#ff2442,#ff6b81);padding:20px 16px 16px;color:#fff;">
    <div style="font-size:18px;font-weight:700;line-height:1.4;margin-bottom:4px;">${esc(doc.meta.title)}</div>
    <div style="font-size:12px;opacity:.8;">小红书笔记预览</div>
  </div>
  <div style="padding:16px;font-size:15px;line-height:1.75;color:#333;white-space:pre-wrap;">${body}</div>
  ${tags ? `<div style="padding:0 16px 16px;font-size:14px;color:#ff2442;">${tags}</div>` : ''}
</div>`
  }

  private renderXhsBody(nodes: ContentNode[]): string {
    return nodes.map(node => this.renderXhsNode(node)).filter(Boolean).join('\n\n')
  }

  private renderXhsNode(node: ContentNode): string {
    switch (node.type) {
      case 'heading':
        return `【${this.xhsInline(node.children)}】`
      case 'paragraph': {
        const text = this.xhsInline(node.children)
        return text || ''
      }
      case 'image':
        return `[图片${node.alt ? `：${node.alt}` : ''}]`
      case 'code_block':
        return `\`\`\`\n${node.code}\n\`\`\``
      case 'blockquote':
        return this.renderXhsBody(node.children).split('\n').map(l => `❝ ${l}`).join('\n')
      case 'bullet_list':
        return node.items.map(item => `• ${this.renderXhsBody(item.children)}`).join('\n')
      case 'ordered_list':
        return node.items.map((item, i) => `${node.start + i}. ${this.renderXhsBody(item.children)}`).join('\n')
      case 'task_list':
        return node.items.map(item => `${item.checked ? '✅' : '⬜'} ${this.renderXhsBody(item.children)}`).join('\n')
      case 'divider':
        return '——————'
      case 'table': {
        return node.rows.map(row =>
          row.cells.map(cell => this.renderXhsBody(cell.children)).join(' | ')
        ).join('\n')
      }
      default:
        return ''
    }
  }

  private xhsInline(nodes: InlineNode[]): string {
    return nodes.map(node => {
      if (node.type === 'hardBreak') return '\n'
      if (node.type !== 'text') return ''
      let text = node.text
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold': text = `「${text}」`; break
          case 'link': text = `${text}（${mark.href}）`; break
        }
      }
      return text
    }).join('')
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
