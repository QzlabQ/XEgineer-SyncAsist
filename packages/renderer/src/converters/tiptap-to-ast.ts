import type {
  ContentDocument,
  ContentNode,
  InlineNode,
  Mark,
  ListItem,
  TaskItem,
  TableRow,
  TableCell,
} from '../ast/types'

// Tiptap JSON shape (simplified)
interface TiptapNode {
  type?: string
  text?: string
  content?: TiptapNode[]
  marks?: TiptapMark[]
  attrs?: Record<string, unknown>
}

interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
}

export function tiptapToAST(doc: TiptapNode, title: string): ContentDocument {
  return {
    meta: {
      title,
      tags: [],
      categories: [],
    },
    body: (doc.content ?? []).flatMap(convertNode).filter(Boolean) as ContentNode[],
  }
}

function convertNode(node: TiptapNode): ContentNode[] {
  switch (node.type) {
    case 'heading':
      return [{
        type: 'heading',
        level: (node.attrs?.level as 1 | 2 | 3 | 4 | 5 | 6) ?? 1,
        children: convertInlineNodes(node.content),
      }]

    case 'paragraph':
      return [{
        type: 'paragraph',
        children: convertInlineNodes(node.content),
      }]

    case 'image':
      return [{
        type: 'image',
        src: (node.attrs?.src as string) ?? '',
        alt: node.attrs?.alt as string | undefined,
        caption: node.attrs?.title as string | undefined,
        width: node.attrs?.width as number | undefined,
        height: node.attrs?.height as number | undefined,
      }]

    case 'codeBlock':
      return [{
        type: 'code_block',
        lang: (node.attrs?.language as string) ?? '',
        code: extractText(node.content),
      }]

    case 'blockquote':
      return [{
        type: 'blockquote',
        children: (node.content ?? []).flatMap(convertNode).filter(Boolean) as ContentNode[],
      }]

    case 'bulletList':
      return [{
        type: 'bullet_list',
        items: (node.content ?? []).map(convertListItem),
      }]

    case 'orderedList':
      return [{
        type: 'ordered_list',
        start: (node.attrs?.start as number) ?? 1,
        items: (node.content ?? []).map(convertListItem),
      }]

    case 'taskList':
      return [{
        type: 'task_list',
        items: (node.content ?? []).map(convertTaskItem),
      }]

    case 'table':
      return [{
        type: 'table',
        rows: (node.content ?? []).map(convertTableRow),
      }]

    case 'horizontalRule':
      return [{ type: 'divider' }]

    default:
      return []
  }
}

function convertListItem(node: TiptapNode): ListItem {
  return {
    children: (node.content ?? []).flatMap(convertNode).filter(Boolean) as ContentNode[],
  }
}

function convertTaskItem(node: TiptapNode): TaskItem {
  return {
    checked: (node.attrs?.checked as boolean) ?? false,
    children: (node.content ?? []).flatMap(convertNode).filter(Boolean) as ContentNode[],
  }
}

function convertTableRow(node: TiptapNode): TableRow {
  return {
    cells: (node.content ?? []).map(convertTableCell),
  }
}

function convertTableCell(node: TiptapNode): TableCell {
  return {
    isHeader: node.type === 'tableHeader',
    colspan: node.attrs?.colspan as number | undefined,
    rowspan: node.attrs?.rowspan as number | undefined,
    children: (node.content ?? []).flatMap(convertNode).filter(Boolean) as ContentNode[],
  }
}

function convertInlineNodes(content?: TiptapNode[]): InlineNode[] {
  if (!content) return []
  const result: InlineNode[] = []
  for (const node of content) {
    if (node.type === 'text') {
      result.push({
        type: 'text',
        text: node.text ?? '',
        marks: (node.marks ?? []).map(convertMark).filter(Boolean) as Mark[],
      })
    } else if (node.type === 'hardBreak') {
      result.push({ type: 'hardBreak' })
    }
  }
  return result
}

function convertMark(mark: TiptapMark): Mark | null {
  switch (mark.type) {
    case 'bold':      return { type: 'bold' }
    case 'italic':    return { type: 'italic' }
    case 'underline': return { type: 'underline' }
    case 'strike':    return { type: 'strike' }
    case 'code':      return { type: 'code' }
    case 'link':      return { type: 'link', href: (mark.attrs?.href as string) ?? '', title: mark.attrs?.title as string | undefined }
    case 'textStyle': return mark.attrs?.color ? { type: 'color', color: mark.attrs.color as string } : null
    case 'highlight': return { type: 'highlight', color: (mark.attrs?.color as string) ?? '#ffff00' }
    default:          return null
  }
}

function extractText(content?: TiptapNode[]): string {
  if (!content) return ''
  return content.map(n => n.text ?? extractText(n.content)).join('')
}

export function extractPlainText(nodes: ContentNode[], maxLength?: number): string {
  let text = ''
  for (const node of nodes) {
    if (node.type === 'paragraph' || node.type === 'heading') {
      text += node.children.map(n => n.type === 'text' ? n.text : '').join('') + '\n'
    }
    if (maxLength && text.length >= maxLength) break
  }
  const result = text.trim()
  return maxLength ? result.slice(0, maxLength) : result
}

export function extractImages(nodes: ContentNode[]): string[] {
  const images: string[] = []
  for (const node of nodes) {
    if (node.type === 'image') images.push(node.src)
    if ('children' in node && Array.isArray((node as { children?: ContentNode[] }).children)) {
      images.push(...extractImages((node as { children: ContentNode[] }).children))
    }
    if ('items' in node) {
      const items = (node as { items: Array<{ children: ContentNode[] }> }).items
      for (const item of items) {
        images.push(...extractImages(item.children))
      }
    }
  }
  return images
}
