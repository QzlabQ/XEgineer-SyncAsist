/**
 * CSS 内联样式引擎 — AST → H5 HTML 渲染器
 *
 * 将 ContentAST 转换为微信公众平台兼容的内联样式 HTML。
 *
 * 关键约束：
 * - 不使用 <style> 标签（微信会过滤）
 * - 不使用 class / id 选择器
 * - 所有样式通过 style="" 内联
 * - 图片 src 必须是完整 URL
 * - 不支持 JavaScript
 */

import type { ContentDocument, ContentNode, InlineNode, Mark } from '../ast/types'
import { toStyleString, text, flex, card, container, mergeStyles } from './builder'
import type { CSSProperties } from './builder'
import { DEFAULT_THEME, type ThemeTokens } from './tokens'
import { renderCard, renderQuote, renderDivider, renderFeatureList, renderTimeline, renderImageText, renderHorizontalScroll, renderButton, esc } from './components'
import type { H5Card, H5Quote, H5Divider, H5FeatureList, H5Timeline, H5ImageText } from './components'

// ===== 主题配置 =====

const T: ThemeTokens = DEFAULT_THEME
const { colors, typography, spacing, radius } = T

// ===== 渲染选项 =====

export interface RenderOptions {
  /** 是否包裹微信容器（max-width: 677px, margin: 0 auto）*/
  wrapContainer?: boolean
  /** 是否添加 CSS 动画 keyframes（微信可能支持） */
  includeAnimations?: boolean
  /** 自定义主题 */
  theme?: Partial<ThemeTokens>
}

// ===== 主渲染函数 =====

export function renderToH5HTML(doc: ContentDocument, options: RenderOptions = {}): string {
  const body = renderNodes(doc.body)
  const titleHTML = `<h1 style="${toStyleString(text({ size: typography.h1.size, weight: typography.h1.weight, lineHeight: typography.h1.lineHeight, color: colors.fg }))}">${esc(doc.meta.title)}</h1>`

  const content = titleHTML + body

  if (options.wrapContainer ?? true) {
    return wrapWechatContainer(content)
  }
  return content
}

/**
 * 微信公众平台标准容器
 * 正文宽度 677px，居中，白色背景
 */
export function wrapWechatContainer(content: string): string {
  return `<section style="${toStyleString(container({ maxWidth: '677px', padding: '20px 0 40px' }))}">${content}</section>`
}

// ===== 节点渲染 =====

function renderNodes(nodes: ContentNode[]): string {
  return nodes.map(renderNode).join('')
}

function renderNode(node: ContentNode): string {
  switch (node.type) {
    case 'heading': return renderHeading(node)
    case 'paragraph': return renderParagraph(node)
    case 'image': return renderImage(node)
    case 'code_block': return renderCodeBlock(node)
    case 'blockquote': return renderBlockquote(node)
    case 'bullet_list': return renderList(node, 'bullet')
    case 'ordered_list': return renderList(node, 'ordered')
    case 'task_list': return renderTaskList(node)
    case 'table': return renderTable(node)
    case 'divider': return renderDivider({ variant: 'line' })
    case 'embed': return renderEmbed(node)
    default: return ''
  }
}

// ===== 具体节点渲染 =====

function renderHeading(node: { level: number; children: InlineNode[] }): string {
  const level = Math.min(node.level, 6)
  const sizes: Record<number, { size: string; weight: string; lineHeight: string; margin: string }> = {
    1: typography.h1,
    2: typography.h2,
    3: typography.h3,
    4: { size: '15px', weight: '600', lineHeight: '1.5', margin: '18px 0 8px' },
    5: { size: '14px', weight: '600', lineHeight: '1.5', margin: '16px 0 6px' },
    6: { size: '13px', weight: '600', lineHeight: '1.5', margin: '14px 0 6px' },
  }
  const s = sizes[level]
  const headingStyle = toStyleString(mergeStyles(
    text({ size: s.size, weight: s.weight, lineHeight: s.lineHeight, color: colors.fg }),
    { margin: s.margin, padding: level === 2 ? `0 0 ${spacing.xs}` : undefined, borderBottom: level === 2 ? `1px solid ${colors.borderLight}` : undefined } as CSSProperties,
  ))

  return `<h${level} style="${headingStyle}">${renderInline(node.children)}</h${level}>`
}

function renderParagraph(node: { children: InlineNode[] }): string {
  const inner = renderInline(node.children)
  if (!inner || inner === '<br>') {
    return `<p style="${toStyleString(text({ size: typography.body.size, lineHeight: typography.body.lineHeight, color: typography.body.color }))}"><br></p>`
  }
  return `<p style="${toStyleString(text({ size: typography.body.size, lineHeight: typography.body.lineHeight, color: typography.body.color }))}">${inner}</p>`
}

function renderImage(node: { src: string; alt?: string; caption?: string }): string {
  const figStyle = toStyleString({ margin: `${spacing.lg} 0`, textAlign: 'center' })
  const imgStyle = toStyleString({
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: radius.md,
    margin: '0 auto',
    border: `1px solid ${colors.borderLight}`,
  })
  const capStyle = toStyleString(text({ size: typography.caption.size, color: typography.caption.color, align: 'center' }))

  let html = `<figure style="${figStyle}"><img src="${esc(node.src)}" alt="${esc(node.alt ?? '')}" style="${imgStyle}" />`
  if (node.caption) {
    html += `<figcaption style="${capStyle}">${esc(node.caption)}</figcaption>`
  }
  html += `</figure>`
  return html
}

function renderCodeBlock(node: { lang: string; code: string }): string {
  const preStyle = toStyleString({
    background: '#1e293b',
    color: '#e2e8f0',
    borderRadius: radius.md,
    padding: spacing.md,
    overflow: 'auto',
    margin: `${spacing.md} 0`,
    fontFamily: typography.fontMono,
    fontSize: '14px',
    lineHeight: '1.65',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  })
  return `<pre style="${preStyle}"><code>${esc(node.code)}</code></pre>`
}

function renderBlockquote(node: { children: ContentNode[] }): string {
  const textContent = extractText(node)
  return renderQuote({ text: textContent, variant: 'line' })
}

function renderList(node: { items: Array<{ children: ContentNode[] }>; start?: number }, type: 'bullet' | 'ordered'): string {
  const tag = type === 'ordered' ? 'ol' : 'ul'
  const listStyle = toStyleString({
    paddingLeft: '24px',
    margin: `0 0 ${spacing.md}`,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    color: typography.body.color,
  })

  const items = node.items.map((item, i) => {
    const prefix = type === 'ordered' ? `${(node.start ?? 1) + i}.` : '•'
    const itemStyle = toStyleString({ marginBottom: spacing.xs })
    const content = renderNodes(item.children) || `<span>${prefix}</span>`
    return `<li style="${itemStyle}">${content}</li>`
  }).join('')

  return `<${tag} style="${listStyle}">${items}</${tag}>`
}

function renderTaskList(node: { items: Array<{ checked: boolean; children: ContentNode[] }> }): string {
  const listStyle = toStyleString({
    paddingLeft: '0',
    margin: `0 0 ${spacing.md}`,
    listStyle: 'none',
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    color: typography.body.color,
  })

  const items = node.items.map(item => {
    const checkbox = item.checked ? '☑' : '☐'
    const itemStyle = toStyleString(flex({ gap: spacing.sm, align: 'flex-start' }))
    const content = renderNodes(item.children) || ''
    return `<li style="${itemStyle}"><span style="${toStyleString({ color: item.checked ? colors.accent : colors.fgMuted, flexShrink: '0' })}">${checkbox}</span> <span>${content}</span></li>`
  }).join('')

  return `<ul style="${listStyle}">${items}</ul>`
}

function renderTable(node: { rows: Array<{ cells: Array<{ children: ContentNode[]; isHeader?: boolean; colspan?: number; rowspan?: number }> }> }): string {
  if (!node.rows.length) return ''

  const tableStyle = toStyleString({
    width: '100%',
    borderCollapse: 'collapse',
    margin: `${spacing.md} 0`,
    fontSize: '14px',
    overflow: 'auto',
    display: 'block',
  })

  const rows = node.rows.map((row, ri) => {
    const cells = row.cells.map(cell => {
      const tag = cell.isHeader ? 'th' : 'td'
      const cellStyle = toStyleString({
        border: `1px solid ${colors.border}`,
        padding: '8px 12px',
        textAlign: 'left',
        verticalAlign: 'top',
        background: cell.isHeader ? colors.bgSubtle : undefined,
        fontWeight: cell.isHeader ? '600' : undefined,
        fontSize: cell.isHeader ? '13px' : undefined,
        color: cell.isHeader ? colors.fg : undefined,
      })
      const colspan = cell.colspan ? ` colspan="${cell.colspan}"` : ''
      const rowspan = cell.rowspan ? ` rowspan="${cell.rowspan}"` : ''
      return `<${tag} style="${cellStyle}"${colspan}${rowspan}>${renderNodes(cell.children)}</${tag}>`
    }).join('')

    const rowStyle = toStyleString({
      background: ri % 2 === 1 ? colors.bgCard : 'transparent',
    })
    return `<tr style="${rowStyle}">${cells}</tr>`
  }).join('')

  return `<div style="${toStyleString({ overflowX: 'auto', marginBottom: spacing.md })}"><table style="${tableStyle}"><tbody>${rows}</tbody></table></div>`
}

function renderEmbed(node: { url: string; title?: string }): string {
  return `<p style="${toStyleString(text({ size: typography.body.size, color: colors.accent }))}"><a href="${esc(node.url)}" style="color:${colors.accent};text-decoration:none;">${esc(node.title ?? node.url)}</a></p>`
}

// ===== 行内渲染 =====

function renderInline(nodes: InlineNode[]): string {
  return nodes.map(node => {
    if (node.type === 'hardBreak') return '<br>'
    if (node.type === 'inlineImage') {
      return `<img src="${esc(node.src)}" alt="${esc(node.alt ?? '')}" style="${toStyleString({ display: 'inline', maxWidth: '100%', height: 'auto', verticalAlign: 'middle', borderRadius: radius.sm })}" />`
    }
    if (node.type !== 'text') return ''

    let html = esc(node.text)
    // Apply marks from outermost to innermost
    for (const mark of [...node.marks].reverse()) {
      html = applyMark(html, mark)
    }
    return html
  }).join('')
}

function applyMark(content: string, mark: Mark): string {
  switch (mark.type) {
    case 'bold':
      return `<strong style="font-weight:600;">${content}</strong>`
    case 'italic':
      return `<em>${content}</em>`
    case 'underline':
      return `<span style="text-decoration:underline;text-underline-offset:2px;">${content}</span>`
    case 'strike':
      return `<span style="text-decoration:line-through;">${content}</span>`
    case 'code':
      return `<code style="${toStyleString({ fontFamily: typography.fontMono, fontSize: '0.875em', background: colors.bgSubtle, padding: '2px 5px', borderRadius: radius.sm, border: `1px solid ${colors.borderLight}` })}">${content}</code>`
    case 'link':
      return `<a href="${esc(mark.href)}" style="color:${colors.accent};text-decoration:none;border-bottom:1px solid ${colors.accent}30;">${content}</a>`
    case 'color':
      return `<span style="color:${esc(mark.color)};">${content}</span>`
    case 'highlight':
      return `<span style="background:${esc(mark.color)};padding:0 2px;border-radius:2px;">${content}</span>`
    default:
      return content
  }
}

// ===== 工具函数 =====

function extractText(node: { children?: ContentNode[] } & Record<string, unknown>): string {
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map(child => {
      if ('children' in child && Array.isArray(child.children)) {
        return extractInlineText(child.children as unknown as InlineNode[])
      }
      return extractText(child as unknown as { children: ContentNode[] })
    }).join(' ')
  }
  return ''
}

function extractInlineText(nodes: InlineNode[]): string {
  return nodes.map(n => n.type === 'text' ? n.text : '').join('')
}
