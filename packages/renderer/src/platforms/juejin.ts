import { BaseRenderer } from '../base'
import type { ContentDocument, PlatformConfig, PlatformPayload, MetaField } from '../types'

export class JuejinRenderer extends BaseRenderer {
  platformId = 'juejin'
  platformName = '掘金'

  metaSchema: MetaField[] = [
    { key: 'cover', label: '封面图', type: 'image' },
    { key: 'summary', label: '摘要', type: 'textarea', placeholder: '不填则自动截取正文前120字' },
    { key: 'tags', label: '标签', type: 'tags', placeholder: '最多5个标签' },
    {
      key: 'category',
      label: '分类',
      type: 'select',
      options: [
        { label: '前端', value: '6809637767543259144' },
        { label: '后端', value: '6809637769959178254' },
        { label: 'Android', value: '6809635626879549454' },
        { label: 'iOS', value: '6809635626661445640' },
        { label: '人工智能', value: '6809637773935378440' },
        { label: '开发工具', value: '6809637771511070734' },
        { label: '代码人生', value: '6809637776263217160' },
        { label: '阅读', value: '6809637772874219534' },
      ],
    },
  ]

  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload {
    return {
      title: doc.meta.title,
      markdownContent: this.nodesToMarkdown(doc.body),
      coverImage: config.cover ?? doc.meta.cover ?? '',
      brief: config.summary ?? this.autoSummary(doc),
      tags: config.tags ?? doc.meta.tags ?? [],
      categoryId: config.category ?? '6809637767543259144',
      isDraft: config.isDraft ?? true,
    }
  }

  renderPreview(doc: ContentDocument): string {
    const md = this.nodesToMarkdown(doc.body)
    // Simple markdown → HTML for preview (no external deps)
    const html = simpleMarkdownToHTML(md)
    return `<div style="max-width:700px;margin:0 auto;font-family:-apple-system,'PingFang SC',sans-serif;font-size:16px;line-height:1.8;color:#252933;padding:24px">
<h1 style="font-size:28px;font-weight:700;margin:0 0 24px;line-height:1.4">${escHtml(doc.meta.title)}</h1>
<style>
  p{margin:0 0 16px}
  h1,h2,h3,h4{font-weight:700;margin:24px 0 12px}
  h2{font-size:22px;border-bottom:1px solid #eee;padding-bottom:8px}
  h3{font-size:18px}
  pre{background:#1e1e1e;border-radius:8px;padding:16px;overflow-x:auto}
  pre code{color:#d4d4d4;font-family:'Fira Code',monospace;font-size:14px}
  p code{background:#f2f3f5;padding:2px 6px;border-radius:3px;font-family:monospace;color:#e96900}
  blockquote{border-left:4px solid #1e80ff;margin:0 0 16px;padding:8px 16px;background:#f0f7ff;color:#666}
  img{max-width:100%;border-radius:4px}
  table{border-collapse:collapse;width:100%;margin:16px 0}
  td,th{border:1px solid #e4e6eb;padding:8px 12px}
  th{background:#f2f3f5;font-weight:600}
  ul,ol{padding-left:24px;margin:0 0 16px}
  li{margin-bottom:4px}
  hr{border:none;border-top:1px solid #e4e6eb;margin:24px 0}
  strong{font-weight:600}
  em{font-style:italic}
</style>
${html}</div>`
  }
}

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// Minimal markdown renderer for preview (handles common cases)
function simpleMarkdownToHTML(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inCode = false
  let codeLang = ''
  let codeLines: string[] = []
  let inList = false

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        if (inList) { out.push('</ul>'); inList = false }
        inCode = true
        codeLang = line.slice(3).trim()
        codeLines = []
      } else {
        out.push(`<pre><code class="language-${escHtml(codeLang)}">${escHtml(codeLines.join('\n'))}</code></pre>`)
        inCode = false
      }
      continue
    }
    if (inCode) { codeLines.push(line); continue }

    if (line.startsWith('# '))       { if(inList){out.push('</ul>');inList=false} out.push(`<h1>${inlineHTML(line.slice(2))}</h1>`); continue }
    if (line.startsWith('## '))      { if(inList){out.push('</ul>');inList=false} out.push(`<h2>${inlineHTML(line.slice(3))}</h2>`); continue }
    if (line.startsWith('### '))     { if(inList){out.push('</ul>');inList=false} out.push(`<h3>${inlineHTML(line.slice(4))}</h3>`); continue }
    if (line.startsWith('#### '))    { if(inList){out.push('</ul>');inList=false} out.push(`<h4>${inlineHTML(line.slice(5))}</h4>`); continue }
    if (line.startsWith('> '))       { if(inList){out.push('</ul>');inList=false} out.push(`<blockquote><p>${inlineHTML(line.slice(2))}</p></blockquote>`); continue }
    if (line.startsWith('---'))      { if(inList){out.push('</ul>');inList=false} out.push('<hr>'); continue }
    if (line.match(/^[-*] /))        { if(!inList){out.push('<ul>');inList=true} out.push(`<li>${inlineHTML(line.slice(2))}</li>`); continue }
    if (line.match(/^\d+\. /))       { if(inList){out.push('</ul>');inList=false} out.push(`<li>${inlineHTML(line.replace(/^\d+\. /,''))}</li>`); continue }

    if (inList) { out.push('</ul>'); inList = false }
    if (line.trim() === '') { out.push(''); continue }
    out.push(`<p>${inlineHTML(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.join('\n')
}

function inlineHTML(s: string): string {
  return s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/~~(.+?)~~/g,'<s>$1</s>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>')
    .replace(/!\[(.+?)\]\((.+?)\)/g,'<img src="$2" alt="$1">')
}
