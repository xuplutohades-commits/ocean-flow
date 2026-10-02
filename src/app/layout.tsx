import type { Metadata, Viewport } from 'next';
import Nav from '@/components/shell/Nav';
import Footer from '@/components/shell/Footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'OCEAN FLOW · 洋流互动实验室',
  description:
    '高中地理《洋流》互动教学网站：全球洋流地图、洋流形成实验、洋流×大气联动、真实世界案例档案馆与地理实验室。',
  keywords: ['洋流', '高中地理', '暖流', '寒流', '日本暖流', '秘鲁寒流', '厄尔尼诺', '上升流'],
};

export const viewport: Viewport = {
  themeColor: '#02070f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      {/* suppressHydrationWarning：忽略浏览器扩展注入的属性（如 data-atm-ext-installed）
          导致的 hydration 差异，仅影响该元素属性，不影响功能与安全检查 */}
      <body className="grain" style={{ position: 'relative' }}>
        <div aria-hidden style={{
          position: 'fixed', inset: 0, zIndex: -2, pointerEvents: 'none',
          background:
            'radial-gradient(1100px 700px at 15% -10%, rgba(16, 64, 110, 0.28), transparent 60%),' +
            'radial-gradient(900px 700px at 90% 110%, rgba(7, 30, 58, 0.55), transparent 60%),' +
            'linear-gradient(180deg, #02070f, #03101e 55%, #05182c)',
        }} />
        <Nav />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
