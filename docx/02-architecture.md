# 系统架构设计

## 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Web App (Next.js SPA)                   │   │
│  │                                                           │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │   │
│  │  │  富文本编辑器  │  │  平台预览面板  │  │  发布控制台     │  │   │
│  │  │  (Tiptap v2) │  │  (多Tab预览)  │  │  (状态追踪)    │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │   │
│  │         │                 │                   │           │   │
│  │         └─────────────────┼───────────────────┘           │   │
│  │                           │                               │   │
│  │              packages/renderer (ContentAST)               │   │
│  └───────────────────────────┼───────────────────────────────┘   │
│                              │ postMessage                        │
│  ┌───────────────────────────┼───────────────────────────────┐   │
│  │     Chrome Extension      │    (Manifest v3)              │   │
│  │                           │                               │   │
│  │  ┌────────────────────────▼──────────────────────────┐   │   │
│  │  │  Service Worker (packages/core 平台适配器)          │   │   │
│  │  │  ZhihuAdapter / WechatAdapter / BilibiliAdapter... │   │   │
│  │  └────────────────────────┬──────────────────────────┘   │   │
│  └───────────────────────────┼───────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────┘
                               │ HTTPS（携带平台 Cookie）
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         知乎 API          微信 API         B站 API  ...
```

---

## 2. 分层架构

### 第一层：编辑层（Editor Layer）

**职责**：提供所见即所得的富文本编辑体验

- 技术：Tiptap v2（基于 ProseMirror）
- 内部数据格式：ProseMirror JSON Document
- 输出：触发 ContentAST 转换

### 第二层：内容中间层（Content AST Layer）

**职责**：平台无关的内容表示，是格式转换的枢纽

- 定义统一的 `ContentNode` 类型树
- 实现 `tiptap-to-ast.ts`：ProseMirror JSON → ContentAST
- 所有平台渲染器的输入均为 ContentAST

详见 `03-content-ast.md`

### 第三层：渲染层（Renderer Layer）

**职责**：将 ContentAST 转换为各平台所需的发布格式

- 每个平台实现一个 `PlatformRenderer`
- 同时提供 `renderPreview()` 用于编辑器右侧预览
- 提供 `metaSchema` 定义平台专属配置字段

详见 `04-platform-renderer.md`

### 第四层：发布层（Publish Layer）

**职责**：通过 Chrome 扩展调用各平台 API 完成实际发布

- 复用 Wechatsync `packages/core` 全部平台适配器
- Web App 通过 postMessage 与扩展通信
- 扩展 Service Worker 执行 API 调用（携带浏览器 Cookie）

详见 `05-extension-bridge.md`

---

## 3. Monorepo 包结构

```
xegineer/
├── packages/
│   ├── core/                    # 从 Wechatsync 复用（不改动）
│   │   ├── src/adapters/        # 29+ 平台适配器
│   │   ├── src/runtime/         # RuntimeInterface 抽象
│   │   └── src/types.ts         # Article、SyncResult 等核心类型
│   │
│   ├── renderer/                # 【新增】平台格式渲染器
│   │   ├── src/ast/             # ContentAST 类型定义
│   │   ├── src/converters/      # Tiptap JSON → ContentAST
│   │   ├── src/platforms/       # 各平台 Renderer 实现
│   │   └── src/index.ts
│   │
│   ├── editor/                  # 【新增】编辑器 React 组件库
│   │   ├── src/components/
│   │   │   ├── Editor/          # Tiptap 封装
│   │   │   ├── Preview/         # 多平台预览面板
│   │   │   ├── PublishPanel/    # 发布控制台
│   │   │   └── PlatformConfig/  # 平台专属配置 UI
│   │   └── src/stores/          # Zustand 状态
│   │
│   └── extension/               # 从 Wechatsync 扩展
│       ├── src/background/      # Service Worker（复用）
│       ├── src/bridge/          # 【新增】与 Web App 通信协议
│       └── src/runtime/         # Extension RuntimeInterface（复用）
│
├── apps/
│   └── web/                     # Next.js 15 应用
│       └── app/
│           ├── editor/[id]/     # 编辑器页面
│           ├── articles/        # 文章列表页
│           └── settings/        # 账号与平台管理
│
└── package.json                 # Yarn Workspaces 根配置
```

---

## 4. 核心数据流

### 4.1 编辑 → 预览

```
用户输入
  ↓ (Tiptap onChange)
ProseMirror JSON
  ↓ (tiptap-to-ast, debounce 300ms)
ContentAST
  ↓ (并行，各平台 Renderer.renderPreview)
  ├─ 微信预览 HTML
  ├─ 知乎预览 HTML
  ├─ 小红书预览（图文结构）
  └─ B站预览 HTML
  ↓
预览面板更新
```

### 4.2 发布流程

```
用户点击"发布"
  ↓
收集各平台配置（封面、摘要、标签等）
  ↓
ContentAST → 各平台 PlatformPayload（Renderer.render）
  ↓
postMessage 发送到 Chrome Extension
  ↓
Extension Service Worker
  ├─ 调用 ZhihuAdapter.publish(payload)
  ├─ 调用 WechatAdapter.publish(payload)
  └─ 调用 BilibiliAdapter.publish(payload)
  ↓（各平台并行，携带浏览器 Cookie）
各平台 API 返回结果
  ↓
postMessage 回传结果
  ↓
Web App 展示发布状态（成功链接 / 错误信息）
```

---

## 5. 状态管理

使用 Zustand，核心 Store 划分：

```typescript
// 文章内容 Store
interface ArticleStore {
  articles: Article[]           // 文章列表
  currentArticle: Article       // 当前编辑的文章
  contentAST: ContentNode[]     // 当前内容的 AST（实时更新）
  updateContent(doc: ProseMirrorJSON): void
  saveArticle(): void
}

// 发布 Store
interface PublishStore {
  selectedPlatforms: string[]   // 已勾选的目标平台
  platformConfigs: Record<string, PlatformConfig>  // 各平台配置
  publishStatus: Record<string, PublishStatus>     // 各平台发布状态
  publish(): Promise<void>
}

// 平台 Store
interface PlatformStore {
  platforms: PlatformMeta[]     // 所有支持的平台
  authStatus: Record<string, AuthResult>  // 各平台登录状态
  checkAuth(platformId: string): Promise<void>
}
```

---

## 6. 本地存储方案

- **文章内容**：IndexedDB（通过 Dexie.js），支持离线编辑
- **平台配置**：localStorage（轻量，随时读取）
- **发布历史**：IndexedDB
- **图片缓存**：IndexedDB（Blob 存储）

服务端存储（可选，P2 阶段）：
- PostgreSQL 存储文章与发布记录
- S3/OSS 存储图片
- 支持多设备同步
