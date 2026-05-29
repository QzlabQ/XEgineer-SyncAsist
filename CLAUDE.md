# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# First-time setup (after clone)
bash setup.sh

# Web App dev server (http://localhost:3210)
yarn workspace @xegineer/web dev

# Build Chrome Extension (reload in chrome://extensions/ after each build)
yarn workspace @xegineer/extension build

# Rebuild renderer package (required after any change to packages/renderer/src/)
yarn workspace @xegineer/renderer build

# Type-check all packages
yarn type-check
```

There is no test suite yet. Type-check is the primary correctness gate.

## Architecture

This is a Yarn Workspaces monorepo with three packages and one app:

```
Wechatsync/          ← git submodule (read-only, platform API adapters)
packages/renderer/   ← ContentAST types + platform format converters
packages/extension/  ← Chrome Extension MV3 (Service Worker + Content Script)
apps/web/            ← Next.js 15 Web App (editor UI)
```

### Data flow

```
Tiptap editor JSON
  → tiptapToAST()          (packages/renderer/src/converters/tiptap-to-ast.ts)
  → ContentDocument        (platform-agnostic AST)
  → PlatformRenderer.render()   → PlatformPayload  (sent to extension)
  → PlatformRenderer.renderPreview() → HTML string (shown in preview panel)

Web App (postMessage) → Content Script → chrome.runtime.sendMessage → Service Worker
  → Wechatsync Adapter.publish(article) → platform API
```

### ContentAST

`packages/renderer/src/ast/types.ts` defines the intermediate representation. `ContentDocument` has `meta: ArticleMeta` and `body: ContentNode[]`. `ContentNode` is a discriminated union of block types; `InlineNode` is a discriminated union of inline types with `marks`.

### Adding a new platform

1. Add a renderer in `packages/renderer/src/platforms/<id>.ts` extending `BaseRenderer` — implement `platformId`, `platformName`, `metaSchema`, `render()`, `renderPreview()`.
2. Register it in `packages/renderer/src/index.ts` (import + add to `renderers` map).
3. Import the Wechatsync adapter in `packages/extension/src/background/index.ts` and add it to the `ADAPTERS` map.
4. Run `yarn workspace @xegineer/renderer build` then `yarn workspace @xegineer/extension build`.

`BaseRenderer` provides `nodesToHTML`, `nodesToMarkdown`, `inlineToHTML`, `inlineToMarkdown`, and `autoSummary` helpers — use these rather than reimplementing.

### Extension bridge (SSR-safe)

`apps/web/src/lib/extension-bridge.ts` exports `getExtensionBridge()` — a lazy singleton that returns `null` during SSR. **Never import `ExtensionBridge` at module top-level** in Next.js code; always call `getExtensionBridge()` inside event handlers or effects. The Zustand publish store (`apps/web/src/stores/publish.ts`) demonstrates the correct pattern.

### Wechatsync submodule

`Wechatsync/` is a git submodule pointing to `git@github.com:wechatsync/Wechatsync.git`. Its dependencies are managed by pnpm (not yarn). The extension's `vite.config.ts` resolves `@wechatsync/core/...` imports via a path alias directly to `Wechatsync/packages/core/src/`, so Wechatsync is never built — only its source is consumed.

Wechatsync has an internal private submodule (`wechatsync-private-adapters`). `setup.sh` uses `git submodule update --init Wechatsync` (not `--recursive`) to skip it.

### ExtensionRuntime

`packages/extension/src/runtime/extension.ts` implements Wechatsync's `RuntimeInterface` for the Chrome Service Worker context. Key details:
- `getCookie` uses `chrome.cookies.getAll({ domain, name })` — not `chrome.cookies.get({ url })` — because domain strings like `.bilibili.com` are not valid URLs.
- `headerRules.add` returns `"rule_${numericId}"` and uses `ruleIdBase + ruleIdCounter++` to avoid ID collisions. `remove` parses the ID back with `parseInt(id.replace('rule_', ''), 10)`.
- `declarativeNetRequest` rules include `initiatorDomains: [chrome.runtime.id]` to scope rules to the extension.

### Local storage

`apps/web/src/lib/db.ts` — Dexie.js (IndexedDB) with three tables: `articles` (stores Tiptap JSON as string), `publishHistory`, `platformConfigs`. No backend; all data is local to the browser.
