import type { JSONContent } from '@tiptap/core'

export interface TextSelectionSnapshot {
  from: number
  to: number
  text: string
}

export function textToTiptapDoc(text: string): JSONContent {
  return {
    type: 'doc',
    content: textToParagraphs(text),
  }
}

export function textToTiptapContent(text: string): JSONContent[] {
  return textToParagraphs(text)
}

function textToParagraphs(text: string): JSONContent[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)

  if (!paragraphs.length) {
    return [{ type: 'paragraph' }]
  }

  return paragraphs.map(paragraph => ({
    type: 'paragraph',
    content: [{ type: 'text', text: paragraph }],
  }))
}

export function plainTextFromTiptapJSON(value: string): string {
  try {
    const json = JSON.parse(value) as JSONContent
    return extractText(json).replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    return ''
  }
}

function extractText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  const children = node.content ?? []
  const text = children.map(extractText).join('')
  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote') return `${text}\n\n`
  if (node.type === 'listItem') return `${text}\n`
  if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') return `${text}\n`
  if (node.type === 'hardBreak') return '\n'
  return text
}
