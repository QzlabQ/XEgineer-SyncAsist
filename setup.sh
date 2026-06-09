#!/usr/bin/env bash
# setup.sh — 一键初始化开发环境
set -e

echo "▶ 安装项目依赖..."
yarn install

echo "▶ 构建 renderer 包..."
yarn workspace @xegineer/renderer build

echo "▶ 创建环境配置..."
if [ ! -f apps/web/.env ]; then
  cp apps/web/.env.example apps/web/.env
  echo "  已从 .env.example 创建 .env，请编辑其中敏感配置后继续"
else
  echo "  .env 已存在，跳过"
fi

echo ""
echo "✅ 初始化完成！"
echo ""
echo "接下来请执行："
echo "  1. 编辑 apps/web/.env（修改 JWT_SECRET 等）"
echo "  2. docker compose up -d postgres"
echo "  3. yarn workspace @xegineer/web prisma db push"
echo "  4. yarn workspace @xegineer/web dev"
echo ""
echo "构建 Chrome 扩展："
echo "  yarn workspace @xegineer/extension build"
echo "  然后在 chrome://extensions/ 加载 packages/extension/dist/ 目录"
