import { BaseRenderer } from '../base'
import type { ContentDocument, PlatformConfig, PlatformPayload, MetaField } from '../types'

export class BilibiliRenderer extends BaseRenderer {
  platformId = 'bilibili'
  platformName = 'B站专栏'

  metaSchema: MetaField[] = [
    { key: 'cover', label: '封面图', type: 'image', required: true },
    { key: 'summary', label: '摘要', type: 'textarea', placeholder: '不填则自动截取正文前120字' },
    { key: 'tags', label: '标签', type: 'tags', placeholder: '最多10个标签' },
    {
      key: 'category',
      label: '分类',
      type: 'select',
      options: [
        { label: '日常', value: '0' },
        { label: '游戏', value: '1' },
        { label: '科技', value: '4' },
        { label: '生活', value: '5' },
        { label: '动画', value: '6' },
        { label: '音乐', value: '7' },
        { label: '影视', value: '8' },
        { label: '美食', value: '9' },
        { label: '运动', value: '10' },
        { label: '文化', value: '11' },
      ],
    },
  ]

  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload {
    // B站不允许外链，移除 <a> 标签保留文字
    const html = this.nodesToHTML(doc.body).replace(/<a[^>]*>(.*?)<\/a>/g, '$1')
    return {
      title: doc.meta.title,
      content: html,
      cover: config.cover ?? doc.meta.cover ?? '',
      summary: config.summary ?? this.autoSummary(doc),
      tags: config.tags ?? doc.meta.tags ?? [],
      category: config.category ?? '0',
      isDraft: config.isDraft ?? true,
    }
  }

  renderPreview(doc: ContentDocument): string {
    const body = this.nodesToHTML(doc.body).replace(/<a[^>]*>(.*?)<\/a>/g, '$1')
    return `<div style="max-width:680px;margin:0 auto;font-family:'PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;line-height:1.8;color:#212121;padding:24px">
<h1 style="font-size:26px;font-weight:700;margin:0 0 20px;line-height:1.4;color:#18191c">${escHtml(doc.meta.title)}</h1>
<style>
  p{margin:0 0 16px}
  h1,h2,h3,h4{font-weight:700;margin:24px 0 12px;color:#18191c}
  h2{font-size:20px}h3{font-size:17px}
  pre{background:#23262f;border-radius:8px;padding:16px;overflow-x:auto}
  pre code{color:#abb2bf;font-family:monospace;font-size:14px}
  p code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-family:monospace}
  blockquote{border-left:3px solid #00a1d6;margin:0 0 16px;padding:8px 16px;background:#f4fbff;color:#666}
  img{max-width:100%;border-radius:6px}
  figure{margin:16px 0;text-align:center}
  figcaption{font-size:13px;color:#aaa;margin-top:6px}
  table{border-collapse:collapse;width:100%;margin:16px 0}
  td,th{border:1px solid #e3e5e7;padding:8px 12px}
  th{background:#f1f2f3;font-weight:600}
  ul,ol{padding-left:24px;margin:0 0 16px}
  li{margin-bottom:4px}
  hr{border:none;border-top:1px solid #e3e5e7;margin:24px 0}
</style>
${body}</div>`
  }
}

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
