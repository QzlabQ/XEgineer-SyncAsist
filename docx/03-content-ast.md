# 内容中间层（ContentAST）设计

ContentAST 是整个系统的核心枢纽，所有平台格式转换都经过这一层。它是一个平台无关的内容表示，介于编辑器内部格式（ProseMirror JSON）和各平台发布格式之间。

---

## 1. 设计目标

- **平台无关**：不包含任何平台特定的概念
- **无损表示**：能完整表达富文本编辑器支持的所有内容类型
- **易于转换**：结构简单，方便各平台 Renderer 遍历处理
- **可序列化**：纯 JSON，方便存储和传输

---

## 2. 类型定义

```typescript
// ============================================================
// 文章元数据
// ============================================================
export interface ArticleMeta {
  title: string
  cover?: string           // 封面图 URL（已上传到 CDN 或 base64）
  summary?: string         // 摘要（自动截取或手动填写）
  tags: string[]
  categories: string[]
  publishTime?: string     // ISO 8601，定时发布
}

// ============================================================
// 内联节点（段落内的内容）
// ============================================================
export type Mark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }                          // 行内代码
  | { type: 'link'; href: string; title?: string }
  | { type: 'color'; color: string }          // 文字颜色
  | { type: 'highlight'; color: string }      // 背景高亮

export type InlineNode =
  | { type: 'text'; text: string; marks: Mark[] }
  | { type: 'hardBreak' }                     // 强制换行
  | { type: 'inlineImage'; src: string; alt?: string }

// ============================================================
// 块级节点（文章的顶层结构）
// ============================================================
export type ContentNode =
  | HeadingNode
  | ParagraphNode
  | ImageNode
  | CodeBlockNode
  | BlockquoteNode
  | BulletListNode
  | OrderedListNode
  | TaskListNode
  | TableNode
  | DividerNode
  | EmbedNode

export interface HeadingNode {
  type: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  children: InlineNode[]
  id?: string              // 锚点 ID（用于目录）
}

export interface ParagraphNode {
  type: 'paragraph'
  children: InlineNode[]
}

export interface ImageNode {
  type: 'image'
  src: string              // 原始 URL 或 base64
  alt?: string
  caption?: string         // 图片说明
  width?: number
  height?: number
}

export interface CodeBlockNode {
  type: 'code_block'
  lang: string             // 编程语言（'javascript', 'python', 等）
  code: string             // 代码内容（纯文本）
  filename?: string        // 文件名（可选展示）
}

export interface BlockquoteNode {
  type: 'blockquote'
  children: ContentNode[]  // 引用块内可嵌套其他块
}

export interface ListItem {
  children: ContentNode[]  // 列表项内可嵌套段落和子列表
}

export interface BulletListNode {
  type: 'bullet_list'
  items: ListItem[]
}

export interface OrderedListNode {
  type: 'ordered_list'
  start: number            // 起始序号（通常为 1）
  items: ListItem[]
}

export interface TaskItem {
  checked: boolean
  children: ContentNode[]
}

export interface TaskListNode {
  type: 'task_list'
  items: TaskItem[]
}

export interface TableCell {
  children: ContentNode[]
  colspan?: number
  rowspan?: number
  isHeader?: boolean
}

export interface TableRow {
  cells: TableCell[]
}

export interface TableNode {
  type: 'table'
  rows: TableRow[]
}

export interface DividerNode {
  type: 'divider'
}

// 嵌入内容（视频、Tweet 等）
export interface EmbedNode {
  type: 'embed'
  embedType: 'video' | 'tweet' | 'codepen' | 'custom'
  url: string
  title?: string
  thumbnail?: string
}

// ============================================================
// 完整文章
// ============================================================
export interface ContentDocument {
  meta: ArticleMeta
  body: ContentNode[]
}
```

---

## 3. Tiptap JSON → ContentAST 转换

`packages/renderer/src/converters/tiptap-to-ast.ts`

```typescript
import type { JSONContent } from '@tiptap/core'
import type { ContentNode, InlineNode, Mark, ContentDocument } from '../ast/types'

export function tiptapToAST(doc: JSONContent, title: string): ContentDocument {
  return {
    meta: {
      title,
      tags: [],
      categories: [],
    },
    body: (doc.content ?? []).map(convertNode).filter(Boolean) as ContentNode[],
  }
}

function convertNode(node: JSONContent): ContentNode | null {
  switch (node.type) {
    case 'heading':
      return {
        type: 'heading',
        level: node.attrs?.level ?? 1,
        children: convertInlineNodes(node.content),
      }
    case 'paragraph':
      return {
        type: 'paragraph',
        children: convertInlineNodes(node.content),
      }
    case 'image':
      return {
        type: 'image',
        src: node.attrs?.src ?? '',
        alt: node.attrs?.alt,
        caption: node.attrs?.title,
      }
    case 'codeBlock':
      return {
        type: 'code_block',
        lang: node.attrs?.language ?? '',
        code: extractText(node.content),
      }
    case 'blockquote':
      return {
        type: 'blockquote',
        children: (node.content ?? []).map(convertNode).filter(Boolean) as ContentNode[],
      }
    case 'bulletList':
      return {
        type: 'bullet_list',
        items: (node.content ?? []).map(item => ({
          children: (item.content ?? []).map(convertNode).filter(Boolean) as ContentNode[],
        })),
      }
    case 'orderedList':
      return {
        type: 'ordered_list',
        start: node.attrs?.start ?? 1,
        items: (node.content ?? []).map(item => ({
          children: (item.content ?? []).map(convertNode).filter(Boolean) as ContentNode[],
        })),
      }
    case 'table':
      return convertTable(node)
    case 'horizontalRule':
      return { type: 'divider' }
    default:
      return null
  }
}

function convertInlineNodes(content?: JSONContent[]): InlineNode[] {
  if (!content) return []
  return content.flatMap(node => {
    if (node.type === 'text') {
      return [{
        type: 'text' as const,
        text: node.text ?? '',
        marks: (node.marks ?? []).map(convertMark).filter(Boolean) as Mark[],
      }]
    }
    if (node.type === 'hardBreak') return [{ type: 'hardBreak' as const }]
    return []
  })
}

function convertMark(mark: JSONContent): Mark | null {
  switch (mark.type) {
    case 'bold':      return { type: 'bold' }
    case 'italic':    return { type: 'italic' }
    case 'underline': return { type: 'underline' }
    case 'strike':    return { type: 'strike' }
    case 'code':      return { type: 'code' }
    case 'link':      return { type: 'link', href: mark.attrs?.href ?? '', title: mark.attrs?.title }
    case 'textStyle': return mark.attrs?.color ? { type: 'color', color: mark.attrs.color } : null
    case 'highlight': return { type: 'highlight', color: mark.attrs?.color ?? '#ffff00' }
    default:          return null
  }
}
```

---

## 4. 工具函数

```typescript
// 从 ContentAST 提取纯文本（用于自动生成摘要）
export function extractPlainText(nodes: ContentNode[], maxLength?: number): string {
  let text = ''
  for (const node of nodes) {
    if (node.type === 'paragraph' || node.type === 'heading') {
      text += node.children.map(n => n.type === 'text' ? n.text : '').join('') + '\n'
    }
    if (maxLength && text.length >= maxLength) break
  }
  return maxLength ? text.slice(0, maxLength) : text.trim()
}

// 从 ContentAST 提取所有图片 URL（用于封面选择）
export function extractImages(nodes: ContentNode[]): string[] {
  const images: string[] = []
  for (const node of nodes) {
    if (node.type === 'image') images.push(node.src)
    if ('children' in node) images.push(...extractImages(node.children as ContentNode[]))
  }
  return images
}
```
