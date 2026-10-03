import { notFound } from 'next/navigation';
import { CASES, CASE_MAP } from '@/data/cases';
import PageClient from './PageClient';

// 静态导出需要枚举全部动态参数（本地 npm run dev/start 行为不变）
export function generateStaticParams() {
  return CASES.map((c) => ({ id: c.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = CASE_MAP[id];
  if (!c) notFound();
  return <PageClient id={id} />;
}
