/**
 * 部署到子路径（如 GitHub Pages 的 /ocean-flow/）时，本地资源都要带上前缀。
 * 本地开发时 NEXT_PUBLIC_BASE_PATH 为空 → asset() 原样返回，行为不变。
 */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const asset = (p: string): string => (p && p.startsWith('/') ? BASE + p : p);
