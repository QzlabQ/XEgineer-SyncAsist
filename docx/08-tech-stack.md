# 技术选型说明

---

## 1. 编辑器：Tiptap v2

**选型理由**：
- 基于 ProseMirror，业界最成熟的富文本编辑器底层框架
- 输出标准 JSON AST，方便做格式转换（相比 Quill 的 Delta 格式更易处理）
- 扩展系统完善，`@tiptap/extension-*` 覆盖所有常见需求
- 原生支持协同编辑（Yjs 集成），为未来团队协作预留空间
- TypeScript 原生支持，类型安全

**对比其他方案**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| Tiptap v2 | 扩展丰富，JSON AST，TS 支持好 | 学习曲线略高 |
| Quill | 简单易用 | Delta 格式转换麻烦，扩展性差 |
| Slate.js | 高度可定制 | 需要大量自己实现，维护成本高 |
| Draft.js | Facebook 出品 | 已停止维护 |
| wangEditor | 中文社区友好 | 生态较小，扩展性有限 |

---

## 2. 前端框架：Next.js 15（App Router）

**选型理由**：
- React 生态，与 Wechatsync 技术栈一致（React 18 + TypeScript）
- App Router 支持 Server Components，首屏加载快
- 文件路由清晰，`/editor/[id]`、`/articles` 等路由自然映射
- 内置图片优化、字体优化
- 部署灵活（Vercel / 自托管）

**注意**：编辑器核心功能（Tiptap、IndexedDB）均为纯客户端，使用 `'use client'` 指令。

---

## 3. 状态管理：Zustand

**选型理由**：
- Wechatsync 已在使用，保持技术栈一致
- 轻量（< 1KB），无样板代码
- 支持 devtools，调试方便
- 与 React 18 并发模式兼容

---

## 4. 样式：Tailwind CSS

**选型理由**：
- Wechatsync 已在使用，保持一致
- 原子化 CSS，无命名困扰
- 与 shadcn/ui 组件库配合使用，快速构建 UI

**UI 组件库**：shadcn/ui（基于 Radix UI + Tailwind，无样式锁定，可完全自定义）

---

## 5. 本地存储：Dexie.js（IndexedDB 封装）

**选型理由**：
- IndexedDB 原生 API 繁琐，Dexie 提供简洁的 Promise API
- 支持存储大量文章和图片 Blob
- 支持事务，数据安全
- 离线优先，无需网络连接即可编辑

**存储结构**：
```typescript
const db = new Dexie('XEgineer')
db.version(1).stores({
  articles: '++id, title, updatedAt',      // 文章列表
  articleContent: 'id',                    // 文章内容（分离存储，避免列表查询慢）
  publishHistory: '++id, articleId, platform, publishedAt',
  images: 'hash',                          // 图片缓存（以内容 hash 为 key）
})
```

---

## 6. 构建工具

| 工具 | 用途 |
|------|------|
| Vite | Web App 开发服务器和构建 |
| CRXJS | Chrome Extension 构建（热更新支持） |
| tsup | packages/core、packages/renderer 库构建 |
| Yarn Workspaces | Monorepo 包管理 |

---

## 7. 格式转换相关库

| 库 | 用途 |
|----|------|
| juice | CSS 内联（微信公众号需要内联样式） |
| highlight.js | 代码块语法高亮（预览用） |
| marked | Markdown 渲染（掘金预览用） |
| html-to-image | 代码块转图片（微信公众号可选） |

---

## 8. 技术栈总览

```
前端（Web App）
├── Next.js 15 (App Router)
├── React 18
├── TypeScript 5.3+
├── Tiptap v2 (编辑器)
├── Zustand (状态管理)
├── Tailwind CSS + shadcn/ui (样式)
├── Dexie.js (本地存储)
└── Vite (构建)

浏览器扩展
├── Chrome Extension Manifest v3
├── React 18 (Popup UI)
├── TypeScript
└── CRXJS (构建)

核心库（复用 Wechatsync）
├── packages/core (29+ 平台适配器)
└── packages/renderer (格式渲染器，新增)

后端（可选，P2 阶段）
├── Node.js 20+
├── Hono (轻量 HTTP 框架)
├── PostgreSQL (文章存储)
└── S3/OSS (图片存储)
```
