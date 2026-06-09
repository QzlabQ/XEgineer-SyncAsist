/**
 * CSS 内联样式引擎
 *
 * 将 ContentAST 渲染为微信公众平台兼容的 H5 HTML。
 * 所有样式通过 style="" 内联，不使用 <style> 标签或外部 CSS。
 */

// Design tokens
export { DEFAULT_THEME, DARK_THEME, ANIMATIONS } from './tokens'
export type { ThemeTokens, ColorTokens, TypographyTokens, SpacingTokens, RadiusTokens, ShadowTokens, AnimationPreset } from './tokens'

// Style builder
export { toStyleString, flex, grid, card, text, container, gradient, animation, responsiveImage, fullBleed, mergeStyles } from './builder'
export type { CSSProperties, CardOptions, TextOptions, ContainerOptions, AnimationOptions } from './builder'

// H5 components
export { renderCard, renderQuote, renderDivider, renderFeatureList, renderTimeline, renderImageText, renderHorizontalScroll, renderButton } from './components'
export type { H5Card, H5Quote, H5Divider, H5FeatureList, H5Timeline, H5ImageText, H5Button } from './components'

// AST → H5 HTML renderer
export { renderToH5HTML, wrapWechatContainer } from './renderer'
export type { RenderOptions } from './renderer'
