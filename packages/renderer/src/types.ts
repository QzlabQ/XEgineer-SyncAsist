import type { ContentDocument, ContentNode, InlineNode } from './ast/types'

export type { ContentDocument, ContentNode, InlineNode }
export type { ArticleMeta, Mark, HeadingNode, ParagraphNode, ImageNode, CodeBlockNode, BlockquoteNode, BulletListNode, OrderedListNode, TaskListNode, TableNode, DividerNode, EmbedNode, ListItem, TaskItem, TableRow, TableCell } from './ast/types'

export interface PlatformPayload {
  [key: string]: unknown
}

export interface MetaField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'image' | 'tags' | 'select' | 'boolean'
  required?: boolean
  placeholder?: string
  options?: { label: string; value: string }[]
}

export interface PlatformConfig {
  cover?: string
  summary?: string
  tags?: string[]
  categories?: string[]
  isDraft?: boolean
  [key: string]: unknown
}

export interface PlatformRenderer {
  platformId: string
  platformName: string
  render(doc: ContentDocument, config: PlatformConfig): PlatformPayload
  renderPreview(doc: ContentDocument): string
  metaSchema: MetaField[]
}
