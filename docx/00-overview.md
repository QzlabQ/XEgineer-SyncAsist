# XEgineer 多平台内容发布工具 — 产品总览

## 产品定位

XEgineer 是一个面向内容创作者的 **Web 端多平台内容发布工作台**。

用户在工具中完成一次富文本编辑，系统自动将内容适配为各平台所需的格式与风格，并通过浏览器扩展一键同步发布到微信公众号、知乎、B站、小红书、掘金等 29+ 内容平台。

**核心价值主张：写一次，发到所有地方。**

---

## 架构概述

XEgineer 采用自研的多平台适配架构，核心由以下层次构成：

- **编辑器层**：所见即所得富文本编辑器（Tiptap）
- **内容中间层**：平台无关的 ContentAST
- **渲染层**：各平台格式渲染器（PlatformRenderer）
- **发布层**：Chrome 扩展调用各平台 API（基于 RuntimeInterface 抽象）
- **前端层**：Next.js 15 Web 应用

---

## 文档目录

| 文件 | 内容 |
|------|------|
| `00-overview.md` | 本文件，产品总览与文档索引 |
| `01-product-requirements.md` | 产品需求文档（PRD） |
| `02-architecture.md` | 系统架构设计 |
| `03-content-ast.md` | 内容中间层（ContentAST）设计 |
| `04-platform-renderer.md` | 平台格式渲染器设计 |
| `05-extension-bridge.md` | 浏览器扩展桥接层设计 |
| `06-ui-design.md` | UI 布局与交互设计 |
| `07-platform-extension-guide.md` | 扩展新平台开发指南 |
| `08-tech-stack.md` | 技术选型说明 |
| `09-roadmap.md` | 开发路线图 |

---

## 核心设计原则

1. **编辑体验优先**：编辑器体验对标 Notion / 飞书，不要求用户懂 Markdown 语法
2. **平台适配透明**：用户无需关心各平台格式差异，系统自动处理
3. **平台适配透明**：平台适配器通过 BaseAdapter/CodeAdapter 框架抽象，统一的 RuntimeInterface 接口支持扩展和 Node 两种环境
4. **低扩展成本**：新增一个平台只需实现 Adapter + Renderer 两个文件
5. **本地优先**：核心发布能力通过浏览器扩展实现，无需服务端中转敏感数据
