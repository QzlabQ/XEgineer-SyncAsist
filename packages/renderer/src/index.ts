export { ZhihuRenderer } from './platforms/zhihu'
export { BilibiliRenderer } from './platforms/bilibili'
export { JuejinRenderer } from './platforms/juejin'
export { WeixinRenderer } from './platforms/weixin'
export { CSDNRenderer } from './platforms/csdn'
export { XiaohongshuRenderer } from './platforms/xiaohongshu'
export { JianshuRenderer } from './platforms/jianshu'
export { tiptapToAST, extractPlainText, extractImages } from './converters/tiptap-to-ast'
export type { ContentDocument, ContentNode, InlineNode, ArticleMeta, Mark, PlatformRenderer, PlatformConfig, PlatformPayload, MetaField } from './types'

// CSS inline style engine for WeChat H5
export { renderToH5HTML, wrapWechatContainer } from './css-engine/renderer'
export type { RenderOptions } from './css-engine/renderer'
export { DEFAULT_THEME, DARK_THEME, ANIMATIONS } from './css-engine/tokens'
export type { ThemeTokens } from './css-engine/tokens'
export { toStyleString, card, text, flex, grid, container } from './css-engine/builder'
export { renderCard, renderQuote, renderDivider, renderTimeline, renderImageText } from './css-engine/components'

import { ZhihuRenderer } from './platforms/zhihu'
import { BilibiliRenderer } from './platforms/bilibili'
import { JuejinRenderer } from './platforms/juejin'
import { WeixinRenderer } from './platforms/weixin'
import { CSDNRenderer } from './platforms/csdn'
import { XiaohongshuRenderer } from './platforms/xiaohongshu'
import { JianshuRenderer } from './platforms/jianshu'
import type { PlatformRenderer } from './types'

export const renderers: Record<string, PlatformRenderer> = {
  zhihu: new ZhihuRenderer(),
  bilibili: new BilibiliRenderer(),
  juejin: new JuejinRenderer(),
  weixin: new WeixinRenderer(),
  csdn: new CSDNRenderer(),
  xiaohongshu: new XiaohongshuRenderer(),
  jianshu: new JianshuRenderer(),
}

export function getRenderer(platformId: string): PlatformRenderer | undefined {
  return renderers[platformId]
}

export function getAllRenderers(): PlatformRenderer[] {
  return Object.values(renderers)
}
