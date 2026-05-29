import type { ContentDocument, ContentNode, InlineNode, Mark, PlatformRenderer, PlatformConfig, MetaField, PlatformPayload } from './types'
import { extractPlainText } from './converters/tiptap-to-ast'

export abstract class BaseRenderer implements PlatformRenderer {
  abstract platformId: string
  abstract platformName: string
  abstract metaSchema: MetaField[]
  abstract render(doc: ContentDocument, config: PlatformConfig): PlatformPayload
  abstract renderPreview(doc: ContentDocument): string

  protected inlineToHTML(nodes: InlineNode[]): string {
    return nodes.map(node => {
      if (node.type === 'hardBreak') return '<br>'
      if (node.type === 'inlineImage') return `<img src="${node.src}" alt="${node.alt ?? ''}">`
      if (node.type !== 'text') return ''
      let html = escapeHTML(node.text)
      // apply marks inside-out
      for (const mark of [...node.marks].reverse()) {
        html = applyMark(html, mark)
      }
      return html
    }).join('')
  }

  protected inlineToText(nodes: InlineNode[]): string {
    return nodes.map(n => n.type === 'text' ? n.text : '').join('')
  }

  protected nodesToHTML(nodes: ContentNode[]): string {
    return nodes.map(n => this.nodeToHTML(n)).join('\n')
  }

  protected nodeToHTML(node: ContentNode): string {
    switch (node.type) {
      case 'heading':
        return `<h${node.level}>${this.inlineToHTML(node.children)}</h${node.level}>`
      case 'paragraph': {
        const inner = this.inlineToHTML(node.children)
        return inner ? `<p>${inner}</p>` : '<p><br></p>'
      }
      case 'image':
        return `<figure><img src="${node.src}" alt="${node.alt ?? ''}">${node.caption ? `<figcaption>${escapeHTML(node.caption)}</figcaption>` : ''}</figure>`
      case 'code_block':
        return `<pre><code class="language-${node.lang}">${escapeHTML(node.code)}</code></pre>`
      case 'blockquote':
        return `<blockquote>${this.nodesToHTML(node.children)}</blockquote>`
      case 'bullet_list':
        return `<ul>${node.items.map(i => `<li>${this.nodesToHTML(i.children)}</li>`).join('')}</ul>`
      case 'ordered_list':
        return `<ol start="${node.start}">${node.items.map(i => `<li>${this.nodesToHTML(i.children)}</li>`).join('')}</ol>`
      case 'task_list':
        return `<ul>${node.items.map(i => `<li><input type="checkbox" ${i.checked ? 'checked' : ''} disabled> ${this.nodesToHTML(i.children)}</li>`).join('')}</ul>`
      case 'table':
        return `<table><tbody>${node.rows.map(r =>
          `<tr>${r.cells.map(c =>
            `<${c.isHeader ? 'th' : 'td'}${c.colspan ? ` colspan="${c.colspan}"` : ''}${c.rowspan ? ` rowspan="${c.rowspan}"` : ''}>${this.nodesToHTML(c.children)}</${c.isHeader ? 'th' : 'td'}>`
          ).join('')}</tr>`
        ).join('')}</tbody></table>`
      case 'divider':
        return '<hr>'
      case 'embed':
        return `<div class="embed"><a href="${node.url}">${escapeHTML(node.title ?? node.url)}</a></div>`
      default:
        return ''
    }
  }

  protected nodesToMarkdown(nodes: ContentNode[], depth = 0): string {
    return nodes.map(n => this.nodeToMarkdown(n, depth)).join('\n\n')
  }

  protected nodeToMarkdown(node: ContentNode, depth = 0): string {
    switch (node.type) {
      case 'heading':
        return `${'#'.repeat(node.level)} ${this.inlineToMarkdown(node.children)}`
      case 'paragraph':
        return this.inlineToMarkdown(node.children)
      case 'image':
        return `![${node.alt ?? ''}](${node.src})${node.caption ? `\n*${node.caption}*` : ''}`
      case 'code_block':
        return `\`\`\`${node.lang}\n${node.code}\n\`\`\``
      case 'blockquote':
        return this.nodesToMarkdown(node.children).split('\n').map(l => `> ${l}`).join('\n')
      case 'bullet_list':
        return node.items.map(i => {
          const content = this.nodesToMarkdown(i.children, depth + 1)
          return `${'  '.repeat(depth)}- ${content.replace(/\n/g, `\n${'  '.repeat(depth + 1)}`)}`
        }).join('\n')
      case 'ordered_list':
        return node.items.map((i, idx) => {
          const content = this.nodesToMarkdown(i.children, depth + 1)
          return `${'  '.repeat(depth)}${node.start + idx}. ${content.replace(/\n/g, `\n${'  '.repeat(depth + 1)}`)}`
        }).join('\n')
      case 'task_list':
        return node.items.map(i => `- [${i.checked ? 'x' : ' '}] ${this.nodesToMarkdown(i.children)}`).join('\n')
      case 'divider':
        return '---'
      case 'table': {
        if (!node.rows.length) return ''
        const rows = node.rows.map(r => r.cells.map(c => this.nodesToMarkdown(c.children).replace(/\|/g, '\\|')))
        const header = `| ${rows[0].join(' | ')} |`
        const sep = `| ${rows[0].map(() => '---').join(' | ')} |`
        const body = rows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n')
        return [header, sep, body].filter(Boolean).join('\n')
      }
      default:
        return ''
    }
  }

  protected inlineToMarkdown(nodes: InlineNode[]): string {
    return nodes.map(node => {
      if (node.type === 'hardBreak') return '  \n'
      if (node.type !== 'text') return ''
      let text = node.text
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold':      text = `**${text}**`; break
          case 'italic':    text = `*${text}*`; break
          case 'strike':    text = `~~${text}~~`; break
          case 'code':      text = `\`${text}\``; break
          case 'link':      text = `[${text}](${mark.href})`; break
          case 'underline': text = `<u>${text}</u>`; break
        }
      }
      return text
    }).join('')
  }

  protected autoSummary(doc: ContentDocument): string {
    return extractPlainText(doc.body, 120)
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function applyMark(html: string, mark: Mark): string {
  switch (mark.type) {
    case 'bold':      return `<strong>${html}</strong>`
    case 'italic':    return `<em>${html}</em>`
    case 'underline': return `<u>${html}</u>`
    case 'strike':    return `<s>${html}</s>`
    case 'code':      return `<code>${html}</code>`
    case 'link':      return `<a href="${mark.href}"${mark.title ? ` title="${mark.title}"` : ''}>${html}</a>`
    case 'color':     return `<span style="color:${mark.color}">${html}</span>`
    case 'highlight': return `<span style="background:${mark.color}">${html}</span>`
    default:          return html
  }
}
