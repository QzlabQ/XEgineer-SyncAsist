# 扩展新平台开发指南

本文档说明如何为 XEgineer 添加一个新的发布平台。整个过程分为两步：实现 Adapter（负责调用平台 API）和实现 Renderer（负责格式转换和预览）。

---

## 1. 概述

新增一个平台需要创建两个文件：

```
packages/core/src/adapters/platforms/new-platform.ts   # 平台 API 适配器
packages/renderer/src/platforms/new-platform.ts        # 格式渲染器
```

然后在各自的 `index.ts` 中注册一行。

---

## 2. Step 1：实现平台适配器

适配器运行在 Chrome Extension Service Worker 中，负责调用平台 API。

### 2.1 创建适配器文件

```typescript
// packages/core/src/adapters/platforms/new-platform.ts

import { BaseAdapter } from '../base'
import type { Article, SyncResult, AuthResult, PlatformMeta } from '../../types'

export class NewPlatformAdapter extends BaseAdapter {
  // 平台元信息（必填）
  static meta: PlatformMeta = {
    id: 'new-platform',           // 唯一 ID，小写字母+连字符
    name: '新平台',                // 显示名称
    icon: 'https://...',          // 平台图标 URL
    homeUrl: 'https://...',       // 平台首页（用于引导登录）
    capabilities: [               // 平台支持的能力
      'article',                  // 支持发布文章
      'draft',                    // 支持草稿
      'tags',                     // 支持标签
      'cover',                    // 支持封面图
      // 'categories',            // 支持分类
      // 'schedule',              // 支持定时发布
      // 'image_upload',          // 支持图片上传
    ],
  }

  // 检查登录状态（必须实现）
  async checkAuth(): Promise<AuthResult> {
    try {
      // 调用平台 API 获取当前用户信息
      const data = await this.request<{ user: { id: string; name: string; avatar: string } }>(
        'GET',
        'https://api.new-platform.com/v1/me',
      )
      return {
        isLoggedIn: true,
        userId: data.user.id,
        username: data.user.name,
        avatar: data.user.avatar,
      }
    } catch {
      return { isLoggedIn: false }
    }
  }

  // 发布文章（必须实现）
  async publish(article: Article): Promise<SyncResult> {
    try {
      // 1. 处理图片（如果平台需要先上传图片）
      const content = await this.processImages(article.content)

      // 2. 调用平台发布 API
      const result = await this.request<{ id: string; url: string }>(
        'POST',
        'https://api.new-platform.com/v1/articles',
        {
          title: article.title,
          content,
          tags: article.tags,
          is_draft: true,  // 默认保存为草稿
        },
      )

      return this.createResult(true, {
        articleId: result.id,
        url: result.url,
        isDraft: true,
      })
    } catch (error) {
      return this.createResult(false, { error: String(error) })
    }
  }

  // 处理图片：下载并上传到平台（如果需要）
  private async processImages(html: string): Promise<string> {
    // 使用正则匹配图片 URL（注意：Service Worker 中不能用 DOMParser）
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g
    let result = html
    let match

    while ((match = imgRegex.exec(html)) !== null) {
      const originalUrl = match[1]
      try {
        const uploadedUrl = await this.uploadImage(originalUrl)
        result = result.replace(originalUrl, uploadedUrl)
      } catch {
        // 图片上传失败时保留原 URL
      }
    }

    return result
  }

  private async uploadImage(imageUrl: string): Promise<string> {
    // 1. 下载图片
    const response = await this.runtime.fetch(imageUrl, { method: 'GET' })
    const blob = await response.blob()

    // 2. 上传到平台
    const formData = new FormData()
    formData.append('file', blob, 'image.jpg')

    const result = await this.request<{ url: string }>(
      'POST',
      'https://api.new-platform.com/v1/upload',
      formData,
    )

    return result.url
  }
}
```

### 2.2 注册适配器

```typescript
// packages/core/src/adapters/index.ts
// 在现有导出列表中添加一行：
export { NewPlatformAdapter } from './platforms/new-platform'
```

### 2.3 Service Worker 注意事项

适配器运行在 Chrome Extension Service Worker 中，有以下限制：

| 禁止使用 | 替代方案 |
|----------|----------|
| `DOMParser` | 正则表达式解析 HTML |
| `document` / `window` | 无（Service Worker 无 DOM） |
| `XMLHttpRequest` | `fetch` |
| `localStorage` | `chrome.storage.local` |
| `sessionStorage` | `chrome.storage.session` |

---

## 3. Step 2：实现格式渲染器

渲染器运行在 Web App 中（浏览器主线程），负责将 ContentAST 转换为平台格式。

### 3.1 创建渲染器文件

```typescript
// packages/renderer/src/platforms/new-platform.ts

import { BaseRenderer } from '../base'
import type { ContentDocument, PlatformPayload, PlatformConfig, MetaField } from '../types'

export class NewPlatformRenderer extends BaseRenderer {
  platformId = 'new-platform'

  // 平台专属配置字段（用于自动生成配置 UI）
  metaSchema: MetaField[] = [
    {
      key: 'cover',
      label: '封面图',
      type: 'image',
      required: false,
    },
    {
      key: 'summary',
      label: '摘要',
      type: 'textarea',
      placeholder: '不填则自动截取正文前100字',
    },
    {
      key: 'tags',
      label: '标签',
      type: 'tags',
      placeholder: '输入标签后按回车',
    },
    // 平台专属字段示例：
    {
      key: 'column_id',
      label: '发布到专栏',
      type: 'select',
      options: [],  // 运行时动态加载
    },
  ]

  // 将 ContentAST 转换为平台发布载荷
  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload {
    const html = this.renderBodyHTML(doc.body)

    return {
      title: doc.meta.title,
      content: html,
      cover: config.cover,
      summary: config.summary ?? this.extractSummary(doc),
      tags: config.tags ?? doc.meta.tags,
      is_draft: config.isDraft ?? true,
      // 平台专属字段：
      column_id: config.column_id,
    }
  }

  // 生成预览 HTML
  renderPreview(doc: ContentDocument): string {
    const bodyHTML = this.renderBodyHTML(doc.body)

    // 包裹平台样式
    return `
      <div class="new-platform-preview" style="
        max-width: 680px;
        margin: 0 auto;
        font-family: -apple-system, sans-serif;
        font-size: 16px;
        line-height: 1.8;
        color: #333;
      ">
        <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 24px;">
          ${escapeHTML(doc.meta.title)}
        </h1>
        ${bodyHTML}
      </div>
    `
  }

  // 将 ContentAST body 转为 HTML
  private renderBodyHTML(nodes: ContentNode[]): string {
    return nodes.map(node => this.renderNode(node)).join('\n')
  }

  private renderNode(node: ContentNode): string {
    switch (node.type) {
      case 'heading':
        return `<h${node.level}>${this.inlineToHTML(node.children)}</h${node.level}>`

      case 'paragraph':
        return `<p>${this.inlineToHTML(node.children)}</p>`

      case 'image':
        return `<figure>
          <img src="${node.src}" alt="${node.alt ?? ''}" />
          ${node.caption ? `<figcaption>${escapeHTML(node.caption)}</figcaption>` : ''}
        </figure>`

      case 'code_block':
        return `<pre><code class="language-${node.lang}">${escapeHTML(node.code)}</code></pre>`

      case 'blockquote':
        return `<blockquote>${this.renderBodyHTML(node.children)}</blockquote>`

      case 'bullet_list':
        return `<ul>${node.items.map(item =>
          `<li>${this.renderBodyHTML(item.children)}</li>`
        ).join('')}</ul>`

      case 'ordered_list':
        return `<ol start="${node.start}">${node.items.map(item =>
          `<li>${this.renderBodyHTML(item.children)}</li>`
        ).join('')}</ol>`

      case 'divider':
        return '<hr>'

      default:
        return ''
    }
  }

  private extractSummary(doc: ContentDocument): string {
    return extractPlainText(doc.body, 100)
  }
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

### 3.2 注册渲染器

```typescript
// packages/renderer/src/index.ts
// 在现有导出列表中添加一行：
import { NewPlatformRenderer } from './platforms/new-platform'

export const renderers: Record<string, PlatformRenderer> = {
  // ... 现有渲染器
  'new-platform': new NewPlatformRenderer(),
}
```

---

## 4. 验证清单

新平台开发完成后，按以下清单验证：

- [ ] `checkAuth()` 在已登录状态下返回正确的用户信息
- [ ] `checkAuth()` 在未登录状态下返回 `{ isLoggedIn: false }`，不抛出异常
- [ ] `publish()` 成功时返回包含 `url` 或 `articleId` 的结果
- [ ] `publish()` 失败时返回包含 `error` 的结果，不抛出异常
- [ ] `render()` 输出的格式符合平台 API 要求
- [ ] `renderPreview()` 输出的 HTML 在浏览器中正确渲染
- [ ] `metaSchema` 中的字段与 `render()` 中使用的 `config` 字段一致
- [ ] 适配器中没有使用 `DOMParser`、`document`、`localStorage` 等禁用 API

---

## 5. 常见平台 API 模式参考

| 平台类型 | 认证方式 | 发布方式 | 图片处理 |
|----------|----------|----------|----------|
| 知乎/掘金 | Cookie（已有） | 创建草稿 → 更新内容 | 上传到平台 CDN |
| 微信公众号 | Cookie（已有） | 上传素材 → 创建草稿 | 上传到微信素材库 |
| 小红书 | Cookie（已有） | 直接发布 | 上传到小红书 CDN |
| WordPress | 用户名+密码 / API Key | REST API 直接发布 | 媒体库上传 |
| 自建博客 | API Key | Webhook / Git Push | 自定义 |
