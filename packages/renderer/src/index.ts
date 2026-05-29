export { ZhihuRenderer } from './platforms/zhihu'
export { BilibiliRenderer } from './platforms/bilibili'
export { JuejinRenderer } from './platforms/juejin'
export { tiptapToAST, extractPlainText, extractImages } from './converters/tiptap-to-ast'
export type { ContentDocument, ContentNode, InlineNode, ArticleMeta, Mark, PlatformRenderer, PlatformConfig, PlatformPayload, MetaField } from './types'

import { ZhihuRenderer } from './platforms/zhihu'
import { BilibiliRenderer } from './platforms/bilibili'
import { JuejinRenderer } from './platforms/juejin'
import type { PlatformRenderer } from './types'

export const renderers: Record<string, PlatformRenderer> = {
  zhihu: new ZhihuRenderer(),
  bilibili: new BilibiliRenderer(),
  juejin: new JuejinRenderer(),
}

export function getRenderer(platformId: string): PlatformRenderer | undefined {
  return renderers[platformId]
}

export function getAllRenderers(): PlatformRenderer[] {
  return Object.values(renderers)
}
