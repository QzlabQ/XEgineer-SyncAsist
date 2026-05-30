#!/usr/bin/env bash
# setup.sh — 一键初始化开发环境
set -e

echo "▶ 初始化 Wechatsync submodule..."
# 只初始化 Wechatsync 这一层，跳过其内部的私有 submodule
git submodule update --init Wechatsync

echo "▶ 安装 Wechatsync 依赖..."
# 【核心修复】用一行 node 脚本给子模块注入 pnpm 声明，防止 Corepack 向上查找到父目录的 yarn 从而拦截报错
node -e "
  const fs = require('fs');
  const pkgPath = 'Wechatsync/package.json';
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.packageManager = 'pnpm@9.0.0'; 
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log('   已成功为子模块配置 pnpm 隔离圈');
  }
"
# 子模块内部必须用 pnpm 安装，以解析 workspace:* 协议
(cd Wechatsync && pnpm install --ignore-scripts)

echo "▶ 安装项目依赖..."
# 根项目遵照原样，使用 yarn 安装
yarn install

echo "▶ 构建 renderer 包..."
yarn workspace @xegineer/renderer build

echo ""
echo "✅ 初始化完成！"
echo ""
echo "启动开发服务器："
echo "  yarn workspace @xegineer/web dev"
echo ""
echo "构建 Chrome 扩展："
echo "  yarn workspace @xegineer/extension build"
echo "  然后在 chrome://extensions/ 加载 packages/extension/dist/ 目录"