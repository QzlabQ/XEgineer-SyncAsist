import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'path'
import manifest from './manifest.json'

const wechatSyncCore = resolve(__dirname, '../../Wechatsync/packages/core/src')

export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: [
      // Allow @wechatsync/core/adapters/... style imports
      { find: /^@wechatsync\/core\/(.*)$/, replacement: `${wechatSyncCore}/$1` },
      { find: '@wechatsync/core', replacement: `${wechatSyncCore}/index.ts` },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
