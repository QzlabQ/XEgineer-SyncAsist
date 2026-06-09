/**
 * CSS 内联样式引擎 — 设计 Token 系统
 *
 * 所有视觉属性通过 Token 定义，最终内联到 HTML 元素。
 * 微信公众平台限制：不接受 <style> 标签和外部 CSS，
 * 所有样式必须通过 style="" 属性内联。
 */

// ===== 预设主题 =====
export interface ThemeTokens {
  colors: ColorTokens
  typography: TypographyTokens
  spacing: SpacingTokens
  radius: RadiusTokens
  shadows: ShadowTokens
}

export interface ColorTokens {
  bg: string
  bgCard: string
  bgSubtle: string
  fg: string
  fgSecondary: string
  fgMuted: string
  accent: string
  accentSoft: string
  accentText: string
  border: string
  borderLight: string
}

export interface TypographyTokens {
  fontSans: string
  fontMono: string
  h1: { size: string; weight: string; lineHeight: string; margin: string }
  h2: { size: string; weight: string; lineHeight: string; margin: string }
  h3: { size: string; weight: string; lineHeight: string; margin: string }
  body: { size: string; lineHeight: string; color: string }
  caption: { size: string; lineHeight: string; color: string }
}

export interface SpacingTokens {
  xs: string   // 4px
  sm: string   // 8px
  md: string   // 16px
  lg: string   // 24px
  xl: string   // 32px
  xxl: string  // 48px
  section: string // 40px
}

export interface RadiusTokens {
  sm: string   // 4px
  md: string   // 8px
  lg: string   // 12px
  xl: string   // 16px
  full: string // 9999px
}

export interface ShadowTokens {
  card: string
  cardHover: string
  float: string
}

// ===== 预设主题 =====

/** 默认主题 — 适配微信公众平台阅读习惯 */
export const DEFAULT_THEME: ThemeTokens = {
  colors: {
    bg: '#ffffff',
    bgCard: '#f8f9fa',
    bgSubtle: '#f1f3f5',
    fg: '#1a1a1a',
    fgSecondary: '#4a4a4a',
    fgMuted: '#999999',
    accent: '#0d9488',
    accentSoft: '#f0fdf9',
    accentText: '#0f766e',
    border: '#e5e7eb',
    borderLight: '#f0f0f0',
  },
  typography: {
    fontSans: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontMono: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
    h1: { size: '22px', weight: '700', lineHeight: '1.35', margin: '0 0 20px' },
    h2: { size: '18px', weight: '600', lineHeight: '1.4', margin: '24px 0 12px' },
    h3: { size: '16px', weight: '600', lineHeight: '1.45', margin: '20px 0 10px' },
    body: { size: '15px', lineHeight: '1.85', color: '#333333' },
    caption: { size: '12px', lineHeight: '1.5', color: '#999999' },
  },
  spacing: {
    xs: '4px', sm: '8px', md: '16px', lg: '24px',
    xl: '32px', xxl: '48px', section: '40px',
  },
  radius: {
    sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
  },
  shadows: {
    card: '0 1px 3px rgba(0,0,0,0.04)',
    cardHover: '0 2px 8px rgba(0,0,0,0.06)',
    float: '0 4px 16px rgba(0,0,0,0.08)',
  },
}

/** 暗色主题 */
export const DARK_THEME: ThemeTokens = {
  ...DEFAULT_THEME,
  colors: {
    bg: '#1a1a2e',
    bgCard: '#222240',
    bgSubtle: '#2a2a40',
    fg: '#e8e8e8',
    fgSecondary: '#b0b0b0',
    fgMuted: '#666666',
    accent: '#2dd4bf',
    accentSoft: '#0d2b26',
    accentText: '#5eead4',
    border: '#333355',
    borderLight: '#2a2a40',
  },
}

// ===== 动画预设 =====
export interface AnimationPreset {
  keyframes: string
  animation: string
}

export const ANIMATIONS: Record<string, AnimationPreset> = {
  fadeIn: {
    keyframes: '@keyframes fadeIn{from{opacity:0}to{opacity:1}}',
    animation: 'fadeIn 0.3s ease-out both',
  },
  slideUp: {
    keyframes: '@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
    animation: 'slideUp 0.35s ease-out both',
  },
  scaleIn: {
    keyframes: '@keyframes scaleIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}',
    animation: 'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both',
  },
  pulse: {
    keyframes: '@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}',
    animation: 'pulse 2s ease-in-out infinite',
  },
}
