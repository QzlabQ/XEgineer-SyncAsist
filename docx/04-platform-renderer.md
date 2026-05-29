# 平台格式渲染器设计

每个平台实现一个 `PlatformRenderer`，负责两件事：
1. 将 ContentAST 转换为该平台发布 API 所需的格式（`render`）
2. 生成该平台风格的预览 HTML（`renderPreview`）

---

## 1. 接口定义

```typescript
// packages/renderer/src/types.ts

export interface PlatformPayload {
  // 各平台发布所需的数据，传给对应的 Adapter.publish()
  [key: string]: unknown
}

// 平台专属配置字段的 Schema（用于自动生成配置 UI）
export interface MetaField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'image' | 'tags' | 'select' | 'boolean'
  required?: boolean
  placeholder?: string
  options?: { label: string; value: string }[]  // type=select 时使用
}

export interface PlatformRenderer {
  platformId: string

  // 将 ContentAST 转换为平台发布载荷
  render(doc: ContentDocument, platformConfig: PlatformConfig): PlatformPayload

  // 生成预览 HTML（在编辑器右侧展示）
  renderPreview(doc: ContentDocument): string

  // 平台专属配置字段定义（用于生成配置 UI）
  metaSchema: MetaField[]
}

// 用户为某平台填写的配置
export interface PlatformConfig {
  cover?: string
  summary?: string
  tags?: string[]
  categories?: string[]
  isDraft?: boolean
  [key: string]: unknown  // 平台专属字段
}
```

---

## 2. 各平台渲染策略

### 2.1 微信公众号

**发布格式**：带内联样式的富文本 HTML

微信编辑器不支持外部 CSS，所有样式必须内联。代码块需转为图片（或使用特殊样式）。

```
ContentAST
  ↓ WechatRenderer.render()
{
  content: '<section style="...">...</section>',  // 内联样式 HTML
  digest: '摘要文字',
  thumb_media_id: '封面图 media_id',
}
```

**关键处理**：
- 所有样式内联（使用 juice 库）
- 外链转为脚注（微信不允许外链）
- 代码块转为 `<pre>` + 特殊背景色样式
- 图片需先上传到微信素材库，替换为 `wx_fmt` URL

**预览样式**：模拟微信公众号文章页面样式（最大宽度 677px，宋体/苹方字体）

---

### 2.2 知乎

**发布格式**：知乎 Draft API 所需的 HTML

知乎使用自己的富文本编辑器，API 接受特定格式的 HTML。

```
ContentAST
  ↓ ZhihuRenderer.render()
{
  title: '文章标题',
  content: '<p>...</p>',   // 知乎格式 HTML
  topics: ['话题ID'],
  column: '专栏ID',
}
```

**关键处理**：
- 图片需包裹在 `<figure>` 标签中
- 表格需转换为知乎支持的格式
- 代码块使用 `<pre><code class="language-xxx">` 格式
- 外链保留（知乎支持外链）

**预览样式**：模拟知乎文章页面样式（最大宽度 690px，知乎蓝色主题）

---

### 2.3 小红书

**发布格式**：图文结构（正文为纯文本 + 图片列表 + 标签）

小红书以图片为主，文字为辅，格式最简单。

```
ContentAST
  ↓ XiaohongshuRenderer.render()
{
  title: '标题（不超过20字）',
  desc: '正文纯文本（不超过1000字）\n\n#标签1 #标签2',
  images: ['图片URL1', '图片URL2'],  // 至少1张图
  topics: ['话题'],
}
```

**关键处理**：
- 正文提取为纯文本（去除所有格式）
- 标签自动追加到正文末尾（`#tag` 格式）
- 图片列表从文章中提取，封面图排第一
- 代码块转为纯文本（小红书不支持代码格式）

**预览样式**：模拟小红书笔记页面（竖版，图片在上，文字在下）

---

### 2.4 B站专栏

**发布格式**：B站专栏 Draft API 格式

```
ContentAST
  ↓ BilibiliRenderer.render()
{
  title: '文章标题',
  content: '<p>...</p>',   // B站专栏 HTML
  cover: '封面图URL',
  tags: ['标签'],
  category: 0,
}
```

**关键处理**：
- 移除所有外链（B站专栏不允许外链）
- 图片需先上传到 B站，替换为 B站 CDN URL
- 代码块使用 `<pre>` 格式

**预览样式**：模拟 B站专栏页面样式

---

### 2.5 掘金

**发布格式**：Markdown 字符串

掘金编辑器原生支持 Markdown，直接转换即可。

```
ContentAST
  ↓ JuejinRenderer.render()
{
  title: '文章标题',
  markdownContent: '# 标题\n\n正文...',
  coverImage: '封面图URL',
  tags: ['标签ID'],
  category: '分类ID',
}
```

**关键处理**：
- ContentAST → Markdown（标准 CommonMark）
- 图片使用 `![alt](url)` 格式
- 代码块使用 ` ``` lang ` 格式

**预览样式**：模拟掘金文章页面（Markdown 渲染，代码高亮）

---

## 3. 渲染器基类

```typescript
// packages/renderer/src/base.ts

export abstract class BaseRenderer implements PlatformRenderer {
  abstract platformId: string
  abstract metaSchema: MetaField[]
  abstract render(doc: ContentDocument, config: PlatformConfig): PlatformPayload
  abstract renderPreview(doc: ContentDocument): string

  // 通用工具：将 InlineNode[] 转为 HTML 字符串
  protected inlineToHTML(nodes: InlineNode[]): string {
    return nodes.map(node => {
      if (node.type === 'hardBreak') return '<br>'
      if (node.type !== 'text') return ''
      let html = escapeHTML(node.text)
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold':      html = `<strong>${html}</strong>`; break
          case 'italic':    html = `<em>${html}</em>`; break
          case 'underline': html = `<u>${html}</u>`; break
          case 'strike':    html = `<s>${html}</s>`; break
          case 'code':      html = `<code>${html}</code>`; break
          case 'link':      html = `<a href="${mark.href}">${html}</a>`; break
        }
      }
      return html
    }).join('')
  }

  // 通用工具：将 InlineNode[] 转为纯文本
  protected inlineToText(nodes: InlineNode[]): string {
    return nodes.map(n => n.type === 'text' ? n.text : '').join('')
  }

  // 通用工具：将 ContentAST 转为 Markdown
  protected astToMarkdown(nodes: ContentNode[]): string {
    return nodes.map(node => this.nodeToMarkdown(node)).join('\n\n')
  }

  private nodeToMarkdown(node: ContentNode): string {
    switch (node.type) {
      case 'heading':
        return `${'#'.repeat(node.level)} ${this.inlineToText(node.children)}`
      case 'paragraph':
        return this.inlineToHTML(node.children)  // inline marks → markdown syntax
      case 'image':
        return `![${node.alt ?? ''}](${node.src})`
      case 'code_block':
        return `\`\`\`${node.lang}\n${node.code}\n\`\`\``
      case 'divider':
        return '---'
      // ... 其他节点类型
      default:
        return ''
    }
  }
}
```

---

## 4. 渲染器注册表

```typescript
// packages/renderer/src/index.ts

import { WechatRenderer } from './platforms/wechat'
import { ZhihuRenderer } from './platforms/zhihu'
import { XiaohongshuRenderer } from './platforms/xiaohongshu'
import { BilibiliRenderer } from './platforms/bilibili'
import { JuejinRenderer } from './platforms/juejin'

export const renderers: Record<string, PlatformRenderer> = {
  wechat: new WechatRenderer(),
  zhihu: new ZhihuRenderer(),
  xiaohongshu: new XiaohongshuRenderer(),
  bilibili: new BilibiliRenderer(),
  juejin: new JuejinRenderer(),
}

export function getRenderer(platformId: string): PlatformRenderer | null {
  return renderers[platformId] ?? null
}

// 获取所有支持预览的平台
export function getPreviewPlatforms(): string[] {
  return Object.keys(renderers)
}
```
