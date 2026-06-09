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
      dom.style.cssText = 'position: relative; margin: 16px 0; border: 1px dashed #e2e5e9; border-radius: 8px; overflow: hidden;'

      const label = document.createElement('div')
      label.style.cssText = 'position: absolute; top: 4px; right: 8px; z-index: 1; font-size: 11px; color: #9ca3af; background: rgba(255,255,255,0.85); padding: 2px 6px; border-radius: 4px; pointer-events: none;'
      label.textContent = 'H5 渲染块'

      const content = document.createElement('div')
      content.style.cssText = 'padding: 16px;'
      content.innerHTML = node.attrs.html as string || ''

      dom.appendChild(label)
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
 * Parse pasted HTML and detect if it's H5 inline-styled content.
 * If so, insert as htmlBlock. Otherwise, let Tiptap handle it.
 */
export function shouldPasteAsHtmlBlock(html: string): boolean {
  if (!html) return false
  // Detect H5 content: has inline styles on block elements
  const hasInlineStyles = /<(div|section|figure|p|h[1-6])\b[^>]*style="[^"]*(?:background|box-shadow|border-radius|linear-gradient|flex|grid|animation|max-width|padding|margin)[^"]*"/i.test(html)
  const hasMultipleStyledBlocks = (html.match(/style="[^"]*"/g) || []).length >= 3
  return hasInlineStyles && hasMultipleStyledBlocks
}
