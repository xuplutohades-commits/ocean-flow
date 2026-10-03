#!/usr/bin/env bash
# 一键发布到 GitHub Pages：构建静态导出 → 推送到 gh-pages 分支
# 用法：bash scripts/deploy-pages.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NEXT_EXPORT=1
export NEXT_PUBLIC_BASE_PATH=/ocean-flow
echo "==> 静态导出构建"
npm run build

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "==> 推送 out/ 到 gh-pages"
git clone --quiet "https://github.com/xuplutohades-commits/ocean-flow.git" "$TMP"
cd "$TMP"
git checkout -q --orphan pages-tmp
git rm -rf -q . >/dev/null 2>&1 || true
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$ROOT/out/." .
git add -A
git -c user.name="deploy" -c user.email="deploy@ocean-flow.local" commit -q -m "deploy $(date +%Y-%m-%d_%H%M)"
git branch -M gh-pages
git push -q -f origin gh-pages
echo "==> 完成：https://xuplutohades-commits.github.io/ocean-flow/（CDN 约 1-2 分钟生效）"
