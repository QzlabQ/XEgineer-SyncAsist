#!/usr/bin/env bash
# setup.sh — 一键初始化开发环境
set -e

echo "▶ 初始化 Wechatsync submodule..."
# 只初始化 Wechatsync 这一层，跳过其内部的私有 submodule
git submodule update --init Wechatsync

echo "▶ 安装 Wechatsync 依赖..."
(cd Wechatsync && pnpm install --ignore-scripts)

echo "▶ 安装项目依赖..."
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
