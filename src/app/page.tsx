'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Reveal, DotLegend } from '@/components/ui/kit';

const GlobeCanvas = dynamic(() => import('@/components/globe/GlobeCanvas'), { ssr: false });

const ENTRIES = [
  {
    href: '/currents', en: 'EXPLORE', title: '探索全球洋流',
    desc: '世界表层洋流分布 · 暖流与寒流 · 点击任意洋流查看知识卡片',
    color: 'rgba(94,200,255,0.55)',
  },
  {
    href: '/formation', en: 'FORMATION LAB', title: '看看洋流如何形成',
    desc: '风带 → 盛行风 → 地转偏向力 → 海陆分布，亲手搭建大洋环流',
    color: 'rgba(111,227,224,0.55)',
  },
  {
    href: '/atmosphere', en: 'OCEAN × AIR', title: '进入海气实验室',
    desc: '季风洋流 · 沃克环流 · 厄尔尼诺与拉尼娜，海洋与大气怎样互相牵动',
    color: 'rgba(255,157,92,0.55)',
  },
];

const MODULES = [
  { href: '/currents', n: '01', zh: '全球洋流', en: 'GLOBAL CURRENTS', desc: '教材范围的世界洋流分布图，粒子沿流线运动，鼠标悬停 / 点击查看每条洋流的名称、方向、性质与路径。' },
  { href: '/formation', n: '02', zh: '为什么会有洋流', en: 'FORMATION', desc: '交互实验室：依次打开风带、盛行风、地转偏向力、海陆分布，看海水粒子如何被“组装”成环流。' },
  { href: '/atmosphere', n: '03', zh: '洋流 × 大气', en: 'OCEAN & ATMOSPHERE', desc: '三圈环流、季风与北印度洋季风洋流、沃克环流和厄尔尼诺 / 拉尼娜的简化教学模拟。' },
  { href: '/impacts', n: '04', zh: '洋流会带来什么', en: 'IMPACTS', desc: '气候、渔场、航海、污染——四条因果链，用动画讲清洋流如何塑造人间。' },
  { href: '/cases', n: '05', zh: '真实世界 · 洋流档案馆', en: 'ARCHIVE', desc: '日本暖流、秘鲁寒流、本格拉寒流、湾流……卫星影像、真实案例与教材知识点。' },
  { href: '/lab', n: '06', zh: '地理实验室', en: 'LAB', desc: '漂流瓶、上升流、寒暖流交汇、季风切换、航海路线、厄尔尼诺模拟——亲自操作。' },
];

export default function Home() {
  return (
    <div>
      {/* 沉浸式主屏 */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden" style={{ paddingTop: 84 }}>
        {/* 左侧氛围光 */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(900px 620px at 8% 18%, rgba(22, 82, 132, 0.35), transparent 60%),' +
              'radial-gradient(700px 700px at 92% 85%, rgba(9, 40, 74, 0.5), transparent 55%)',
          }} />
        <div className="mx-auto max-w-[1500px] w-full px-6 lg:px-10 grid lg:grid-cols-[1.05fr_1fr] gap-8 items-center relative z-10">
          <div>
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="kicker">Interactive Geography Lab</span>
                <span className="marquee-line" style={{ width: 90 }} />
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="title-disp text-[46px] md:text-[64px] lg:text-[76px] mt-5 leading-[1.02]">
                <span className="grad-text">OCEAN</span>
                <br />
                <span className="grad-text-warm">FLOW</span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-[17px] md:text-[19px] text-[#cfe4ff] font-medium leading-snug max-w-xl">
                洋流，正在重新分配这个星球的热量。
              </p>
              <p className="mt-3 text-[13.5px] text-[#8ba7c6] leading-relaxed max-w-xl">
                风推动海水，地球自转让海水偏转，大陆把它围成一个个环流——<br className="hidden md:block" />
                这是一间面向高中地理课堂的互动实验室：地图、动画、模拟与真实世界案例，带你亲手“看见”洋流。
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-8 grid sm:grid-cols-3 gap-3 max-w-2xl">
                {ENTRIES.map((e, i) => (
                  <Link key={e.href} href={e.href}
                    className="btn btn-glow h-full flex-col items-start !p-4 text-left group" style={{ borderColor: 'rgba(126,190,255,0.18)' }}>
                    <span className="text-[10px] tracking-[0.28em]" style={{ color: e.color }}>{e.en}</span>
                    <span className="text-[15px] font-bold text-[#eaf6ff] mt-1.5">{e.title}</span>
                    <span className="text-[11.5px] text-[#7996b5] leading-relaxed mt-1">{e.desc}</span>
                    <span className="text-[13px] text-[#6fe3e0] mt-2 opacity-0 group-hover:opacity-100 transition-opacity">进入 →</span>
                  </Link>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.32}>
              <div className="mt-6 flex items-center gap-6 text-[11.5px] text-[#5f7b99]">
                <DotLegend />
                <span className="hidden md:inline">拖动地球查看 · 洋流粒子持续流动</span>
              </div>
            </Reveal>
          </div>

          <div className="relative h-[52vh] md:h-[72vh] lg:h-[82vh] hidden md:block">
            <div aria-hidden className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(12, 52, 92, 0.5), transparent 62%)',
                filter: 'blur(10px)',
              }} />
            <div className="absolute inset-0 animate-floaty">
              <GlobeCanvas />
            </div>
            <div aria-hidden className="absolute bottom-[8%] left-1/2 -translate-x-1/2 text-center select-none"
              style={{ pointerEvents: 'none' }}>
              <div className="kicker-dim">DRAG TO ROTATE</div>
            </div>
          </div>
        </div>

        <div aria-hidden className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-[#56738f]">
          <span className="text-[10px] tracking-[0.3em]">SCROLL</span>
          <span className="w-[1px] h-10" style={{ background: 'linear-gradient(180deg, #6fe3e0, transparent)' }} />
        </div>
      </section>

      {/* 六大模块 */}
      <section className="mx-auto max-w-[1500px] px-6 lg:px-10 py-20">
        <Reveal>
          <div className="kicker">SIX MODULES · 六个模块</div>
          <h2 className="title-disp text-[26px] md:text-[32px] mt-2 grad-text">从地图到实验室，一条完整的学习路径</h2>
          <p className="mt-3 text-[13.5px] text-[#8ba7c6] max-w-3xl">
            顺序即教材逻辑：先认识“是什么”，再追问“为什么”，然后把单向知识连成作用网络，最后用真实世界与动手实验收束。每个模块都可以独立进入。
          </p>
        </Reveal>
        <div className="mt-10 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {MODULES.map((m, i) => (
            <Reveal key={m.href} delay={i * 0.05}>
              <Link href={m.href} className="glass p-6 block h-full transition-transform hover:-translate-y-1 group relative overflow-hidden">
                <div aria-hidden className="absolute -right-10 -top-12 text-[110px] font-bold text-transparent select-none"
                  style={{ WebkitTextStroke: '1px rgba(126,190,255,0.10)' }}>{m.n}</div>
                <div className="kicker text-[10px]">{m.en}</div>
                <div className="text-[19px] font-bold text-[#eaf6ff] mt-2 group-hover:text-[#d9fffd] transition-colors">{m.zh}</div>
                <p className="text-[12.5px] leading-relaxed text-[#7996b5] mt-2.5">{m.desc}</p>
                <span className="inline-block mt-4 text-[12px] text-[#6fe3e0] opacity-0 group-hover:opacity-100 transition-opacity">进入模块 →</span>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-14 glass p-6 md:p-8 grid md:grid-cols-[auto_1fr] gap-6 items-center">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-[20px]" style={{ background: 'linear-gradient(140deg,#0b2c4e,#06203c)', border: '1px solid rgba(111,227,224,.35)' }}>🌊</span>
              <div>
                <div className="text-[15px] font-bold">三种使用方式</div>
                <div className="kicker-dim mt-1">THREE MODES</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-[12.5px] leading-relaxed text-[#8ba7c6]">
              <div className="rounded-[12px] border border-[rgba(94,200,255,0.2)] bg-[rgba(94,200,255,0.05)] p-3.5">
                <b className="text-[#cfeaff] block mb-1">探索模式</b>自由浏览地图与案例，适合预习与复习。
              </div>
              <div className="rounded-[12px] border border-[rgba(242,198,109,0.2)] bg-[rgba(242,198,109,0.05)] p-3.5">
                <b className="text-[#ffe9c2] block mb-1">教学模式</b>按“分布→成因→影响”的教材逻辑分步讲解，突出知识点。
              </div>
              <div className="rounded-[12px] border border-[rgba(111,227,224,0.2)] bg-[rgba(111,227,224,0.05)] p-3.5">
                <b className="text-[#d9fffd] block mb-1">实验模式</b>拖动滑杆、切换参数，观察洋流的因果响应。
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
