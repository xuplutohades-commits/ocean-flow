import type { NextConfig } from "next";

// NEXT_EXPORT=1 时做纯静态导出（用于 GitHub Pages 等静态托管）；
// 本地开发 / npm start 不受影响。子路径部署用 NEXT_PUBLIC_BASE_PATH 指定前缀。
const isExport = process.env.NEXT_EXPORT === '1';

const nextConfig: NextConfig = isExport
  ? {
      output: 'export',
      trailingSlash: true,
      basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
      images: { unoptimized: true },
    }
  : { /* 本地模式保持默认 */ };

export default nextConfig;
