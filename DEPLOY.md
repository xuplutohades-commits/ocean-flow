# 部署说明

## 本地开发 / 本地查看
- 服务已用 launchd 常驻（`com.oceanflow.prod`），每次启动/崩溃自动重建并监听 **http://localhost:3000**
- 手动方式：`npm run build && npm start`
- 管理：`launchctl unload/load ~/Library/LaunchAgents/com.oceanflow.prod.plist`

## 线上分享（GitHub Pages）
- 公开地址：**https://xuplutohades-commits.github.io/ocean-flow/**
- 源码仓库：https://github.com/xuplutohades-commits/ocean-flow （main 分支）
- 静态产物：gh-pages 分支（由 `out/` 生成）

每次改完代码后更新线上：
```sh
bash scripts/deploy-pages.sh
```
（等价于：`NEXT_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/ocean-flow npm run build` 然后推送 `out/` 到 gh-pages。）

## 要点
- 静态导出是子路径部署（`/ocean-flow/`），代码中所有本地资源统一走 `src/lib/asset.ts` 的 `asset()` 加前缀。
- `.nojekyll` 必须保留在 `public/` 里——没有它，GitHub Pages 的 Jekyll 会跳过 `_next` 目录导致全站无样式无交互。
- `/cases/[id]` 用 `generateStaticParams` 预渲染全部 9 个案例，新增案例要同步更新 `src/data/cases.ts`。
