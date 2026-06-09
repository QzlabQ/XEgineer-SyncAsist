/**
 * CSS 内联样式引擎 — Style Builder
 *
 * 提供声明式 API 构建内联样式字符串。
 * 所有输出均为 CSS 属性 key:value 对，可直接放入 style="" 属性。
 */

export type CSSProperties = Record<string, string | number | undefined>

/**
 * 将 CSSProperties 对象序列化为内联样式字符串
 */
export function toStyleString(styles: CSSProperties): string {
  return Object.entries(styles)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${toCSSKey(k)}: ${v}`)
    .join('; ')
}

/**
 * camelCase → kebab-case
 */
function toCSSKey(key: string): string {
  return key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
}

// ===== 布局工具 =====

export function flex(options: {
  direction?: 'row' | 'column'
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch'
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
  gap?: string
  wrap?: 'nowrap' | 'wrap'
}): CSSProperties {
  return {
    display: 'flex',
    flexDirection: options.direction ?? 'row',
    alignItems: options.align ?? 'center',
    justifyContent: options.justify ?? 'flex-start',
    gap: options.gap,
    flexWrap: options.wrap,
  }
}

export function grid(options: {
  columns?: string
  rows?: string
  gap?: string
  columnGap?: string
  rowGap?: string
}): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: options.columns,
    gridTemplateRows: options.rows,
    gap: options.gap,
    columnGap: options.columnGap,
    rowGap: options.rowGap,
  }
}

// ===== 视觉工具 =====

export interface CardOptions {
  bg?: string
  radius?: string
  shadow?: string
  padding?: string
  border?: string
  maxWidth?: string
}

export function card(options: CardOptions = {}): CSSProperties {
  return {
    background: options.bg ?? '#ffffff',
    borderRadius: options.radius ?? '12px',
    boxShadow: options.shadow ?? '0 1px 3px rgba(0,0,0,0.04)',
    padding: options.padding ?? '20px',
    border: options.border,
    maxWidth: options.maxWidth,
    overflow: 'hidden',
  }
}

export interface TextOptions {
  size?: string
  weight?: string | number
  lineHeight?: string
  color?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  tracking?: string
  decoration?: 'none' | 'underline' | 'line-through'
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
}

export function text(options: TextOptions = {}): CSSProperties {
  return {
    fontSize: options.size,
    fontWeight: options.weight as string,
    lineHeight: options.lineHeight,
    color: options.color,
    textAlign: options.align,
    letterSpacing: options.tracking,
    textDecoration: options.decoration,
    textTransform: options.transform as string,
  }
}

export interface ContainerOptions {
  maxWidth?: string
  padding?: string
  margin?: string
  bg?: string
  radius?: string
  shadow?: string
  border?: string
}

export function container(options: ContainerOptions = {}): CSSProperties {
  return {
    maxWidth: options.maxWidth ?? '677px',
    margin: options.margin ?? '0 auto',
    padding: options.padding ?? '0',
    background: options.bg,
    borderRadius: options.radius,
    boxShadow: options.shadow,
    border: options.border,
  }
}

// ===== 渐变工具 =====

export interface GradientOptions {
  colors: string[]
  direction?: string
}

export function gradient(options: GradientOptions): string {
  const dir = options.direction ?? '135deg'
  const stops = options.colors.join(', ')
  return `linear-gradient(${dir}, ${stops})`
}

// ===== 动画工具 =====

export interface AnimationOptions {
  name: string
  duration?: string
  easing?: string
  delay?: string
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both'
}

export function animation(options: AnimationOptions): CSSProperties {
  const parts = [
    options.name,
    options.duration ?? '0.3s',
    options.easing ?? 'ease-out',
    options.delay,
    options.fillMode ?? 'both',
  ].filter(Boolean)
  return { animation: parts.join(' ') }
}

// ===== 响应式图片 =====

export function responsiveImage(aspectRatio?: string): CSSProperties {
  return {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '4px',
    aspectRatio,
  }
}

// ===== 通栏 / 全宽 =====

export function fullBleed(contentWidth = '677px'): CSSProperties {
  return {
    width: '100vw',
    marginLeft: 'calc(50% - 50vw)',
    marginRight: 'calc(50% - 50vw)',
    maxWidth: '100%',
  }
}

// ===== 合并多个样式对象 =====

export function mergeStyles(...styles: CSSProperties[]): CSSProperties {
  return Object.assign({}, ...styles.filter(Boolean))
}
