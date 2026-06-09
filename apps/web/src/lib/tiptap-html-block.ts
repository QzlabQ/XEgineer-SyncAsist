/**
 * Tiptap HTML Block Extension
 *
 * Adds a custom node that renders raw inline-styled HTML.
 * Used for pasting WeChat H5 content into the editor and seeing it rendered.
 * The HTML is stored and displayed via dangerouslySetInnerHTML.
 */
import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    htmlBlock: {
      insertHtmlBlock: (html: string) => ReturnType
    }
  }
}

export const HtmlBlock = Node.create({
  name: 'htmlBlock',

  group: 'block',

  atom: true,
  isolating: true,

  addAttributes() {
    return {
      html: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-html-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const html = HTMLAttributes.html as string || ''
    return [
      'div',
      {
        'data-html-block': '',
        style: 'position: relative; margin: 16px 0;',
      },
      ['div', { style: 'pointer-events: none;' }, 0], // placeholder, replaced in Vue
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.setAttribute('data-html-block', '')
      dom.style.cssText = 'position: relative; margin: 24px 0; background: #ffffff; border: 1px solid #e2e5e9; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);'

      const toolbar = document.createElement('div')
      toolbar.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f8f9fa; border-bottom: 1px solid #eef0f2;'
      toolbar.innerHTML = '<span style="font-size:12px;color:#6b7280;font-weight:500;">📄 渲染块</span><span style="font-size:11px;color:#9ca3af;">内容已内联渲染 · 可拖拽移动</span>'

      const content = document.createElement('div')
      content.style.cssText = 'padding: 0;'
      content.innerHTML = node.attrs.html as string || ''

      dom.appendChild(toolbar)
      dom.appendChild(content)
      return { dom }
    }
  },

  addCommands() {
    return {
      insertHtmlBlock:
        (html: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: 'htmlBlock',
            attrs: { html },
          })
        },
    }
  },
})

/**
 * Detect if pasted HTML is "rich" enough to warrant HtmlBlock rendering.
 *
 * Triggered when HTML has:
 * - Any inline style="" attributes (WeChat H5, website copy)
 * - Complex layout tags beyond basic formatting
 * - Multiple paragraphs with styling
 *
 * Basic text formatting (bold/italic/links only) is still handled by Tiptap.
 */
export function shouldPasteAsHtmlBlock(html: string): boolean {
  if (!html) return false

  // Strip basic text-formatting tags and check if anything substantial remains
  const richOnly = html
    .replace(/<\/?(b|strong|i|em|u|s|a|span|br|code)\b[^>]*>/gi, '')
    .replace(/<\/?(h[1-6]|p|li|ul|ol|blockquote|pre)\b[^>]*>/gi, '')
    .trim()

  // After removing basic formatting, check for:
  // 1. Inline style attributes (the key signal)
  const hasStyleAttr = /style="[^"]{10,}"/i.test(richOnly)

  // 2. Complex HTML tags (div, section, figure, table, header, footer, nav, article, main, aside)
  const hasComplexTags = /<\/?(div|section|figure|table|header|footer|nav|article|main|aside|form|svg|canvas|video|audio)\b/i.test(richOnly)

  // 3. Class attributes (website CSS carries visual meaning)
  const hasClassAttr = /\bclass="[^"]{4,}"/i.test(richOnly)

  // 4. Rich HTML with multiple style occurrences
  const styleCount = (html.match(/\bstyle="[^"]*"/g) || []).length
  const styleCountOnBlocks = (html.match(/<(div|section|figure|table|p|h[1-6])\b[^>]*style="[^"]*"/gi) || []).length

  return hasStyleAttr || hasComplexTags || hasClassAttr || styleCount >= 2 || styleCountOnBlocks >= 1
}
