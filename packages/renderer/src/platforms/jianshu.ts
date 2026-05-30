import { BaseRenderer } from '../base'
import type { ContentDocument, PlatformConfig, PlatformPayload, MetaField } from '../types'

export class JianshuRenderer extends BaseRenderer {
  platformId = 'jianshu'
  platformName = '简书'

  metaSchema: MetaField[] = [
    { key: 'cover', label: '封面图', type: 'image' },
    { key: 'summary', label: '摘要', type: 'textarea', placeholder: '不填则自动截取正文前120字' },
  ]

  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload {
    return {
      title: doc.meta.title,
      content: this.nodesToHTML(doc.body),
      markdownContent: this.nodesToMarkdown(doc.body),
      cover: config.cover ?? doc.meta.cover,
      summary: config.summary ?? this.autoSummary(doc),
      isDraft: config.isDraft ?? true,
    }
  }

  renderPreview(doc: ContentDocument): string {
    const body = this.nodesToHTML(doc.body)
    return `<div style="max-width:700px;margin:0 auto;padding:40px 24px;font-family:Georgia,'Times New Roman','PingFang SC','Microsoft YaHei',serif;color:#2c2c2c;line-height:1.9;">
<h1 style="font-size:26px;font-weight:700;margin:0 0 8px;line-height:1.4;color:#1a1a1a;">${esc(doc.meta.title)}</h1>
<div style="height:2px;background:linear-gradient(90deg,#ea6f5a,transparent);margin:0 0 32px;width:60px;"></div>
<style>
  p{margin:0 0 18px;font-size:16px}
  h1,h2,h3,h4{font-weight:700;margin:32px 0 14px;color:#1a1a1a}
  h2{font-size:22px;border-bottom:1px solid #f0f0f0;padding-bottom:8px}
  h3{font-size:18px}
  pre{background:#f7f7f7;border-radius:4px;padding:16px;overflow-x:auto;border-left:3px solid #ea6f5a}
  code{font-family:'SFMono-Regular',Consolas,monospace;font-size:14px}
  p code{background:#f7f7f7;padding:2px 5px;border-radius:3px;font-size:14px}
  blockquote{border-left:3px solid #ea6f5a;margin:0 0 18px;padding:8px 16px;background:#fdf6f5;color:#666;font-style:italic}
  img{max-width:100%;border-radius:4px;display:block;margin:16px auto}
  figure{margin:20px 0;text-align:center}
  figcaption{font-size:13px;color:#999;margin-top:6px}
  table{border-collapse:collapse;width:100%;margin:18px 0}
  td,th{border:1px solid #e8e8e8;padding:8px 12px;font-size:14px}
  th{background:#fafafa;font-weight:600}
  ul,ol{padding-left:24px;margin:0 0 18px}
  li{margin-bottom:6px}
  hr{border:none;border-top:1px solid #f0f0f0;margin:28px 0}
  a{color:#ea6f5a;text-decoration:none}
</style>
${body}</div>`
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
