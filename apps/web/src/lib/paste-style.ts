/**
 * Tiptap paste handler — preserves inline styles from pasted HTML
 *
 * When users paste WeChat H5 content into the editor, this handler
 * maps inline CSS styles to Tiptap marks so the rendering is preserved.
 */

import type { Editor } from '@tiptap/core'

interface StyleMap {
  tag: string
  marks: string[]
  attrs?: Record<string, string>
}

/**
 * Parse inline style="" string into key-value map
 */
function parseStyleString(style: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!style) return result
  style.split(';').forEach(prop => {
    const [key, ...valueParts] = prop.split(':')
    const value = valueParts.join(':').trim()
    if (key && value) {
      result[key.trim()] = value
    }
  })
  return result
}

/**
 * Map CSS properties to Tiptap marks and their attributes
 */
function stylesToMarks(cssProps: Record<string, string>): StyleMap[] {
  const marks: StyleMap[] = []

  // font-weight → bold
  const weight = cssProps['font-weight'] || cssProps['fontWeight']
  if (weight === 'bold' || weight === '700' || weight === '600' || Number(weight) >= 600) {
    marks.push({ tag: 'span', marks: ['bold'] })
  }

  // font-style → italic
  if (cssProps['font-style'] === 'italic' || cssProps['fontStyle'] === 'italic') {
    marks.push({ tag: 'span', marks: ['italic'] })
  }

  // text-decoration → underline / strike
  const decoration = cssProps['text-decoration'] || cssProps['textDecoration'] || ''
  if (decoration.includes('underline')) {
    marks.push({ tag: 'span', marks: ['underline'] })
  }
  if (decoration.includes('line-through')) {
    marks.push({ tag: 'span', marks: ['strike'] })
  }

  // color → textStyle color
  const color = cssProps['color']
  if (color && color !== 'inherit' && !color.startsWith('var(')) {
    marks.push({ tag: 'span', marks: ['textStyle'], attrs: { color } })
  }

  // background → highlight
  const bg = cssProps['background'] || cssProps['backgroundColor'] || cssProps['background-color']
  if (bg && bg !== 'transparent' && bg !== 'none' && !bg.includes('var(') && !bg.includes('url(')) {
    marks.push({ tag: 'span', marks: ['highlight'], attrs: { color: bg } })
  }

  // font-size
  const fontSize = cssProps['font-size'] || cssProps['fontSize']
  if (fontSize) {
    marks.push({ tag: 'span', marks: ['textStyle'], attrs: { fontSize } })
  }

  return marks
}

/**
 * Convert pasted inline-styled HTML to Tiptap-compatible HTML
 * by mapping style="" to data attributes that Tiptap can convert to marks
 */
export function convertPastedHTML(html: string): string {
  // Step 1: Replace style="" on inline elements with Tiptap-compatible attributes
  const inlineElements = ['span', 'strong', 'em', 'u', 's', 'code', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'figcaption']

  // Remove <style> blocks and CSS animations (WeChat strips these anyway)
  let cleaned = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  cleaned = cleaned.replace(/@keyframes[\s\S]*?{[\s\S]*?}/gi, '')

  // Convert inline style="" to Tiptap marks
  const styleRegex = /style="([^"]*)"/gi
  cleaned = cleaned.replace(styleRegex, (match, styleContent) => {
    const cssProps = parseStyleString(styleContent)
    const markDefs = stylesToMarks(cssProps)
    if (markDefs.length === 0) return match

    // Build Tiptap-compatible attributes
    const attrs: string[] = []
    const markTypes = new Set<string>()

    for (const def of markDefs) {
      def.marks.forEach(m => markTypes.add(m))
      if (def.attrs) {
        for (const [key, value] of Object.entries(def.attrs)) {
          if (key === 'color') attrs.push(`data-color="${value}"`)
          if (key === 'fontSize') attrs.push(`data-font-size="${value}"`)
        }
      }
    }

    // Keep original style for reference but add Tiptap data attrs
    return `${attrs.join(' ')} style="${styleContent}"`
  })

  return cleaned
}

/**
 * Register a paste handler on the Tiptap editor that preserves inline styles.
 * Call this inside RichEditor's editorProps.handlePaste or as a plugin.
 */
export function createPasteStyleHandler() {
  return {
    handlePaste: (view: { state: { tr: { replaceSelectionWith: (node: unknown) => void }; selection: { from: number; to: number } } }, event: ClipboardEvent) => {
      const html = event.clipboardData?.getData('text/html')
      if (!html) return false

      // Only intervene if the pasted HTML has inline styles
      if (!/<(span|p|h[1-6]|div|a|strong|em|code)\b[^>]*style="/i.test(html)) {
        return false
      }

      // For now, let Tiptap handle it natively — the inline styles will be
      // partially preserved by Tiptap's textStyle extension.
      // Full conversion requires more complex DOM parsing.
      return false
    },
  }
}

/**
 * Build a Tiptap doc node from H5 HTML string.
 * Used for "import H5 content" workflow.
 */
export function h5HTMLToTiptapHTML(h5HTML: string): string {
  let result = convertPastedHTML(h5HTML)

  // Remove the WeChat wrapper container for editor use
  result = result.replace(/<section[^>]*style="max-width:\s*677px[^"]*"[^>]*>/gi, '<div>')
  result = result.replace(/<\/section>/gi, '</div>')

  // Remove fullBleed/wrapper divs that break in editor
  result = result.replace(/margin-left:\s*calc\(50% - 50vw\)[^"]*/gi, '')

  return result
}
