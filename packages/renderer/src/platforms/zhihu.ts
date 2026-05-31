import { BaseRenderer } from '../base'
import type { ContentDocument, PlatformConfig, PlatformPayload, MetaField } from '../types'

export class ZhihuRenderer extends BaseRenderer {
  platformId = 'zhihu'
  platformName = '知乎'

  metaSchema: MetaField[] = [
    { key: 'cover', label: '封面图', type: 'image' },
    { key: 'summary', label: '摘要', type: 'textarea', placeholder: '不填则自动截取正文前120字' },
    { key: 'tags', label: '话题', type: 'tags', placeholder: '输入话题后按回车' },
  ]

  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload {
    const tags = config.tags ?? doc.meta.tags
    const summary = config.summary ?? this.autoSummary(doc)
    const cover = config.cover ?? doc.meta.cover

    return {
      title: doc.meta.title,
      content: this.nodesToHTML(doc.body),
      tags,
      topics: tags,
      cover,
      summary,
      excerpt: summary,
      isDraft: config.isDraft ?? true,
    }
  }

  renderPreview(doc: ContentDocument): string {
    const body = this.nodesToHTML(doc.body)
    return `<div style="max-width:690px;margin:0 auto;font-family:'PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;line-height:1.8;color:#1a1a1a;padding:24px">
<h1 style="font-size:28px;font-weight:600;margin:0 0 24px;line-height:1.4">${escHtml(doc.meta.title)}</h1>
<style>
  p{margin:0 0 16px}
  h1,h2,h3,h4{font-weight:600;margin:24px 0 12px}
  h2{font-size:22px}h3{font-size:18px}
  pre{background:#f6f8fa;border-radius:6px;padding:16px;overflow-x:auto}
  code{font-family:monospace;font-size:14px}
  p code{background:#f0f0f0;padding:2px 6px;border-radius:3px}
  blockquote{border-left:4px solid #0084ff;margin:0 0 16px;padding:8px 16px;background:#f0f7ff;color:#555}
  img{max-width:100%;border-radius:4px}
  figure{margin:16px 0;text-align:center}
  figcaption{font-size:13px;color:#999;margin-top:6px}
  table{border-collapse:collapse;width:100%;margin:16px 0}
  td,th{border:1px solid #e0e0e0;padding:8px 12px}
  th{background:#f5f5f5;font-weight:600}
  ul,ol{padding-left:24px;margin:0 0 16px}
  li{margin-bottom:4px}
  hr{border:none;border-top:1px solid #e0e0e0;margin:24px 0}
</style>
${body}</div>`
  }
}

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
