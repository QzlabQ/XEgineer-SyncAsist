# XEgineer Sync — 多平台内容发布工作台

> 写一次，发到所有地方。

内容创作者的一站式发布工具：在所见即所得编辑器中写好文章，自动适配各平台格式，通过浏览器扩展一键同步发布到知乎、B站、掘金、微信公众号等平台。

---

## 功能特性

- **富文本编辑器**：基于 Tiptap，支持标题、加粗、代码块、表格、图片等全部常用格式，体验对标 Notion
- **`/` 命令菜单**：输入 `/` 快速插入标题、列表、代码块、表格等
- **悬浮工具栏**：选中文字弹出气泡菜单，快速调整格式
- **多平台实时预览**：编辑时右侧同步展示各平台的实际渲染效果
- **一键发布**：通过 Chrome 扩展调用各平台 API，使用浏览器已有登录状态，无需额外授权
- **定时发布**：支持设置发布时间，到点自动发布到所选平台
- **发布历史**：记录每次发布的状态和链接，失败可重试
- **图片上传**：支持拖拽、粘贴和文件选择三种方式插入图片
- **本地优先**：文章存储在浏览器 IndexedDB，离线可用，账号凭证不经过任何服务器
- **默认草稿模式**：发布默认保存为草稿，人工确认后再正式发布

**当前支持平台**

| 平台 | 预览格式 | 发布方式 |
|------|----------|----------|
| 知乎 | HTML | API 直发 |
| B站专栏 | HTML | API 直发 |
| 掘金 | Markdown | API 直发 |
| 微信公众号 | 内联样式 HTML | API 直发 |
| CSDN | Markdown | API 直发 |
| 小红书 | 图文 + 话题标签 | 页面辅助 |
| 简书 | HTML | API 直发 |

---

## 快速开始

### 环境要求

- Node.js 20+
- yarn 1.x（包管理器）
- Chrome 浏览器

### 一键初始化
（以下命令请在git bash里执行）
```bash
git clone git@github.com:QzlabQ/XEgineer-SyncAsist.git
cd XEgineer-SyncAsist
bash setup.sh
```

### 启动 Web App

```bash
yarn workspace @xegineer/web dev
```

访问 [http://localhost:3210](http://localhost:3210)

### 安装 Chrome 扩展

```bash
yarn workspace @xegineer/extension build
```

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目目录下的 `packages/extension/dist/` 文件夹

### 登录各平台

在浏览器中分别访问并登录各平台，然后在 XEgineer 设置页面点击「全部刷新」检测登录状态。

---

## 项目结构

```
XEgineer-SyncAsist/
├── packages/
│   ├── renderer/            # 平台格式渲染器
│   │   ├── src/ast/         # ContentAST 类型定义（平台无关内容模型）
│   │   ├── src/converters/  # Tiptap JSON → ContentAST
│   │   ├── src/base.ts      # BaseRenderer 基类
│   │   └── src/platforms/   # 各平台渲染器（7 个）
│   │
│   └── extension/           # Chrome 扩展（Manifest v3）
│       ├── src/platform-adapters/  # 平台适配框架
│       │   ├── adapters/    # BaseAdapter/CodeAdapter + 5 个平台实现
│       │   ├── runtime/     # RuntimeInterface 抽象
│       │   └── lib/         # 签名、日志、图片解析等工具
│       ├── src/adapters/    # 自定义适配器（小红书、简书）
│       ├── src/background/  # Service Worker，消息处理与发布调度
│       ├── src/bridge/      # Content Script，桥接 Web App ↔ Service Worker
│       └── src/runtime/     # ExtensionRuntime（RuntimeInterface 的 Chrome 实现）
│
├── apps/
│   └── web/                 # Next.js 15 Web App
│       └── src/
│           ├── app/         # 路由：/, /articles, /editor/[id], /history, /settings, /setup
│           ├── components/  # UI 组件（编辑器、工具栏、预览、发布面板、侧边栏）
│           ├── stores/      # Zustand 状态管理（文章、发布）
│           └── lib/         # IndexedDB 数据库、Extension Bridge
│
├── docx/                    # 产品与架构设计文档
├── setup.sh                 # 一键初始化脚本
└── package.json             # Yarn Workspaces 根配置
```

---

## 架构概览

```
Web App (localhost:3210)
    │  编辑内容 → ContentAST → 各平台 Renderer → PlatformPayload
    │
    │  postMessage
    ▼
Chrome Extension (Content Script)
    │
    │  chrome.runtime.sendMessage
    ▼
Service Worker（平台适配器）
    │
    │  fetch + 浏览器 Cookie
    ▼
各平台 API（知乎 / B站 / 掘金 / 微信公众号 / CSDN / 简书 ...）
```

核心设计：**ContentAST 中间层**将编辑器格式与各平台格式解耦。新增平台只需实现一个 Adapter（继承 BaseAdapter 或 CodeAdapter）和一个 Renderer（继承 BaseRenderer），各注册一行即可。

---

## 扩展新平台

参考 `docx/07-platform-extension-guide.md`，核心步骤：

1. 在 `packages/extension/src/platform-adapters/adapters/platforms/` 新增适配器（继承 BaseAdapter 或 CodeAdapter）
2. 在 `packages/renderer/src/platforms/` 新增渲染器（继承 BaseRenderer）
3. 在 `packages/renderer/src/index.ts` 注册渲染器，在 `packages/extension/src/background/index.ts` 注册适配器
4. 构建 renderer 和扩展

---

## 开发命令

```bash
# 启动 Web App 开发服务器
yarn workspace @xegineer/web dev

# 构建 renderer 包（修改 renderer 后需重新构建）
yarn workspace @xegineer/renderer build

# 构建 Chrome 扩展
yarn workspace @xegineer/extension build

# 类型检查
yarn workspace @xegineer/web run type-check
yarn workspace @xegineer/extension run type-check
```

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 编辑器 | Tiptap v2（ProseMirror） |
| Web App | Next.js 15 + React 19 + TypeScript |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 本地存储 | Dexie.js（IndexedDB） |
| 平台适配 | 自研 BaseAdapter/CodeAdapter 框架 |
| 格式转换 | 自研 ContentAST + PlatformRenderer |
| 浏览器扩展 | Chrome Manifest v3 + CRXJS |
| 定时任务 | Chrome Alarms API |

---

## 文档

详细设计文档见 [`docx/`](./docx/) 目录：

- [产品需求文档](./docx/01-product-requirements.md)
- [系统架构设计](./docx/02-architecture.md)
- [ContentAST 设计](./docx/03-content-ast.md)
- [平台渲染器设计](./docx/04-platform-renderer.md)
- [扩展桥接层设计](./docx/05-extension-bridge.md)
- [UI 设计](./docx/06-ui-design.md)
- [扩展新平台指南](./docx/07-platform-extension-guide.md)
- [技术选型](./docx/08-tech-stack.md)
- [开发路线图](./docx/09-roadmap.md)

---

## License

MIT
