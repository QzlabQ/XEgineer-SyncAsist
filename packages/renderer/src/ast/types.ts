// ContentAST — platform-agnostic content representation

export interface ArticleMeta {
  title: string
  cover?: string
  summary?: string
  tags: string[]
  categories: string[]
  publishTime?: string
}

export type Mark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'link'; href: string; title?: string }
  | { type: 'color'; color: string }
  | { type: 'highlight'; color: string }

export type InlineNode =
  | { type: 'text'; text: string; marks: Mark[] }
  | { type: 'hardBreak' }
  | { type: 'inlineImage'; src: string; alt?: string }

export interface HeadingNode {
  type: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  children: InlineNode[]
}

export interface ParagraphNode {
  type: 'paragraph'
  children: InlineNode[]
}

export interface ImageNode {
  type: 'image'
  src: string
  alt?: string
  caption?: string
  width?: number
  height?: number
}

export interface CodeBlockNode {
  type: 'code_block'
  lang: string
  code: string
  filename?: string
}

export interface BlockquoteNode {
  type: 'blockquote'
  children: ContentNode[]
}

export interface ListItem {
  children: ContentNode[]
}

export interface BulletListNode {
  type: 'bullet_list'
  items: ListItem[]
}

export interface OrderedListNode {
  type: 'ordered_list'
  start: number
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

export interface EmbedNode {
  type: 'embed'
  embedType: 'video' | 'tweet' | 'codepen' | 'custom'
  url: string
  title?: string
  thumbnail?: string
}

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

export interface ContentDocument {
  meta: ArticleMeta
  body: ContentNode[]
}
