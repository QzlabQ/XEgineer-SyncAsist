// Type declarations for adapter dependencies without @types packages
declare module 'js-md5' {
  const md5: (input: string) => string
  export default md5
}

declare module 'juice' {
  interface Juice {
    (html: string, options?: Record<string, unknown>): string
    inlineContent(html: string, css: string): string
  }
  const juice: Juice
  export default juice
}
