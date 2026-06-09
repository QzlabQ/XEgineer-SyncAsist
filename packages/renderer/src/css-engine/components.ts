/**
 * CSS 内联样式引擎 — H5 组件库
 *
 * 每个组件返回带内联 style 属性的 HTML 字符串。
 * 微信公众平台兼容：不使用 <style> 标签、外部 CSS、class 选择器。
 */

import { toStyleString, card, text, flex, grid, gradient } from './builder'
import type { ThemeTokens, AnimationPreset } from './tokens'
import { DEFAULT_THEME, ANIMATIONS } from './tokens'
import type { CSSProperties } from './builder'

const T = DEFAULT_THEME
const { colors, typography, spacing, radius, shadows } = T

// ===== 卡片组件 =====

export interface H5Card {
  type: 'card'
  title?: string
  body: string
  cover?: string
  footer?: string
  variant?: 'default' | 'outline' | 'elevated' | 'quote'
  accent?: string
}

export function renderCard(cardData: H5Card): string {
  const variantStyles: Record<string, CSSProperties> = {
    default: { background: colors.bgCard, border: 'none' },
    outline: { background: colors.bg, border: `1px solid ${colors.border}` },
    elevated: { background: colors.bg, boxShadow: shadows.float },
    quote: { background: colors.accentSoft, border: `none`, borderLeft: `4px solid ${cardData.accent ?? colors.accent}` },
  }
  const vs = variantStyles[cardData.variant ?? 'default']
  const cardStyle = toStyleString({
    ...vs,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  })

  let html = `<div style="${cardStyle}">`
  if (cardData.cover) {
    html += `<img src="${esc(cardData.cover)}" alt="" style="${toStyleString({ display: 'block', width: '100%', height: 'auto', borderRadius: `${radius.md} ${radius.md} 0 0`, marginBottom: spacing.sm })}" />`
  }
  if (cardData.title) {
    html += `<h3 style="${toStyleString(text({ size: typography.h3.size, weight: typography.h3.weight, color: colors.fg }))}">${esc(cardData.title)}</h3>`
  }
  html += `<div style="${toStyleString(text({ size: typography.body.size, lineHeight: typography.body.lineHeight, color: typography.body.color }))}">${cardData.body}</div>`
  if (cardData.footer) {
    html += `<div style="${toStyleString({ marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${colors.borderLight}`, fontSize: typography.caption.size, color: typography.caption.color })}">${cardData.footer}</div>`
  }
  html += `</div>`
  return html
}

// ===== 引用气泡 =====

export interface H5Quote {
  text: string
  author?: string
  variant?: 'bubble' | 'line' | 'card'
}

export function renderQuote(quote: H5Quote): string {
  if (quote.variant === 'bubble') {
    return `<div style="${toStyleString({ background: '#f0fdf9', borderRadius: '12px 12px 12px 4px', padding: '16px 20px', marginBottom: spacing.md, position: 'relative', fontSize: typography.body.size, lineHeight: typography.body.lineHeight, color: colors.fgSecondary })}">"${esc(quote.text)}"${quote.author ? `<div style="${toStyleString({ marginTop: spacing.xs, fontSize: typography.caption.size, color: colors.fgMuted })}">— ${esc(quote.author)}</div>` : ''}</div>`
  }
  if (quote.variant === 'card') {
    return `<div style="${toStyleString(card({ bg: colors.accentSoft, radius: radius.lg, padding: spacing.md }))}"><div style="${toStyleString(text({ size: typography.body.size, lineHeight: typography.body.lineHeight, color: colors.fgSecondary }))}">"${esc(quote.text)}"</div>${quote.author ? `<div style="${toStyleString({ marginTop: spacing.sm, fontSize: typography.caption.size, color: colors.fgMuted, textAlign: 'right' })}">— ${esc(quote.author)}</div>` : ''}</div>`
  }
  // default: line
  return `<blockquote style="${toStyleString({ borderLeft: `4px solid ${colors.accent}`, padding: `8px ${spacing.md}`, margin: `0 0 ${spacing.md}`, background: colors.accentSoft, borderRadius: `0 ${radius.sm} ${radius.sm} 0`, fontSize: typography.body.size, lineHeight: typography.body.lineHeight, color: colors.fgSecondary })}">${esc(quote.text)}${quote.author ? `<footer style="${toStyleString({ marginTop: spacing.xs, fontSize: typography.caption.size, color: colors.fgMuted })}">— ${esc(quote.author)}</footer>` : ''}</blockquote>`
}

// ===== 分割线 =====

export interface H5Divider {
  variant?: 'line' | 'gradient' | 'dash' | 'space'
  color?: string
}

export function renderDivider(opts: H5Divider = {}): string {
  const color = opts.color ?? colors.border
  switch (opts.variant) {
    case 'gradient':
      return `<div style="${toStyleString({ height: '2px', margin: `${spacing.lg} 0`, background: gradient({ colors: ['transparent', color, 'transparent'] }) })}"></div>`
    case 'dash':
      return `<div style="${toStyleString({ height: '1px', margin: `${spacing.lg} 0`, border: 'none', borderTop: `1px dashed ${color}` })}"></div>`
    case 'space':
      return `<div style="${toStyleString({ height: spacing.lg })}"></div>`
    default:
      return `<hr style="${toStyleString({ border: 'none', borderTop: `1px solid ${color}`, margin: `${spacing.lg} 0` })}" />`
  }
}

// ===== 特性列表 (Feature Grid) =====

export interface H5FeatureList {
  items: Array<{ icon?: string; title: string; desc: string }>
  columns?: number
}

export function renderFeatureList(list: H5FeatureList): string {
  const cols = list.columns ?? 2
  const items = list.items.map(item => {
    const iconHtml = item.icon ? `<span style="${toStyleString({ fontSize: '24px', marginRight: spacing.sm })}">${esc(item.icon)}</span>` : ''
    return `<div style="${toStyleString({ ...flex({ direction: 'column', align: 'flex-start', gap: spacing.xs }), padding: spacing.md })}">
      <div style="${toStyleString(flex({ gap: spacing.sm }))}">${iconHtml}<strong style="${toStyleString(text({ size: typography.body.size, weight: '600', color: colors.fg }))}">${esc(item.title)}</strong></div>
      <p style="${toStyleString(text({ size: typography.body.size, color: colors.fgSecondary, lineHeight: typography.body.lineHeight }))}">${esc(item.desc)}</p>
    </div>`
  }).join('')

  return `<div style="${toStyleString(grid({ columns: `repeat(${cols}, 1fr)`, gap: spacing.md }))}">${items}</div>`
}

// ===== 时间轴 =====

export interface H5Timeline {
  items: Array<{ time: string; title: string; desc?: string }>
  color?: string
}

export function renderTimeline(timeline: H5Timeline): string {
  const color = timeline.color ?? colors.accent
  const items = timeline.items.map((item, i) => {
    const isLast = i === timeline.items.length - 1
    return `<div style="${toStyleString(flex({ gap: spacing.md, align: 'flex-start' }))}">
      <div style="${toStyleString({ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: '0' })}">
        <div style="${toStyleString({ width: '12px', height: '12px', borderRadius: '50%', background: color, flexShrink: '0', marginTop: '6px' })}"></div>
        ${isLast ? '' : `<div style="${toStyleString({ width: '2px', flex: '1', background: color, opacity: '0.3', minHeight: spacing.lg })}"></div>`}
      </div>
      <div style="${toStyleString({ paddingBottom: spacing.lg })}">
        <div style="${toStyleString(text({ size: typography.caption.size, color: colors.fgMuted }))}">${esc(item.time)}</div>
        <div style="${toStyleString(text({ size: typography.body.size, weight: '600', color: colors.fg }))}">${esc(item.title)}</div>
        ${item.desc ? `<p style="${toStyleString(text({ size: typography.body.size, color: colors.fgSecondary }))}">${esc(item.desc)}</p>` : ''}
      </div>
    </div>`
  }).join('')

  return `<div style="${toStyleString({ paddingLeft: spacing.xs })}">${items}</div>`
}

// ===== 图文混排 =====

export interface H5ImageText {
  image: string
  text: string
  layout?: 'left' | 'right' | 'top' | 'background'
  ratio?: string
}

export function renderImageText(data: H5ImageText): string {
  const layout = data.layout ?? 'top'
  if (layout === 'background') {
    return `<div style="${toStyleString({ position: 'relative', borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md, minHeight: '200px' })}">
      <img src="${esc(data.image)}" alt="" style="${toStyleString({ position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover' })}" />
      <div style="${toStyleString({ position: 'relative', zIndex: '1', background: 'rgba(0,0,0,0.4)', color: '#ffffff', padding: spacing.lg, display: 'flex', alignItems: 'flex-end', minHeight: '200px' })}">${data.text}</div>
    </div>`
  }
  if (layout === 'left' || layout === 'right') {
    const imgWidth = '45%'
    const textWidth = '55%'
    const imgOrder = layout === 'right' ? '2' : '1'
    const textOrder = layout === 'right' ? '1' : '2'
    return `<div style="${toStyleString(flex({ gap: spacing.md, align: 'flex-start' }))}">
      <div style="${toStyleString({ order: imgOrder, width: imgWidth, flexShrink: '0' })}">
        <img src="${esc(data.image)}" alt="" style="${toStyleString({ display: 'block', width: '100%', height: 'auto', borderRadius: radius.md })}" />
      </div>
      <div style="${toStyleString({ order: textOrder, width: textWidth, fontSize: typography.body.size, lineHeight: typography.body.lineHeight, color: colors.fgSecondary })}">${data.text}</div>
    </div>`
  }
  // default: top (image above text)
  return `<div style="${toStyleString({ marginBottom: spacing.md })}">
    <img src="${esc(data.image)}" alt="" style="${toStyleString({ display: 'block', width: '100%', height: 'auto', borderRadius: radius.md, marginBottom: spacing.sm })}" />
    <p style="${toStyleString(text({ size: typography.body.size, lineHeight: typography.body.lineHeight, color: colors.fgSecondary }))}">${data.text}</p>
  </div>`
}

// ===== 滚动容器（横向滚动） =====

export function renderHorizontalScroll(items: string[]): string {
  const cards = items.map(item =>
    `<div style="${toStyleString({ flexShrink: '0', width: '220px', ...card({ bg: colors.bgCard, radius: radius.lg, padding: spacing.md }) })}">${item}</div>`
  ).join('')
  return `<div style="${toStyleString({ display: 'flex', gap: spacing.md, overflowX: 'auto', paddingBottom: spacing.sm, WebkitOverflowScrolling: 'touch' })}">${cards}</div>`
}

// ===== 链接按钮 =====

export interface H5Button {
  text: string
  url: string
  variant?: 'primary' | 'outline' | 'ghost'
  fullWidth?: boolean
}

export function renderButton(btn: H5Button): string {
  const variantStyles: Record<string, CSSProperties> = {
    primary: { background: colors.accent, color: '#ffffff', border: 'none' },
    outline: { background: 'transparent', color: colors.accent, border: `1px solid ${colors.accent}` },
    ghost: { background: 'transparent', color: colors.accent, border: 'none' },
  }
  const vs = variantStyles[btn.variant ?? 'primary']
  return `<a href="${esc(btn.url)}" style="${toStyleString({
    display: btn.fullWidth ? 'block' : 'inline-block',
    textAlign: 'center',
    textDecoration: 'none',
    padding: '10px 24px',
    borderRadius: radius.md,
    fontSize: typography.body.size,
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    width: btn.fullWidth ? '100%' : undefined,
    ...vs,
  })}">${esc(btn.text)}</a>`
}

// ===== 辅助函数 =====

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export { esc }
