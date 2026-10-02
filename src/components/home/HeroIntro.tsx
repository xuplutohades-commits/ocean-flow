'use client';
import Link from 'next/link';
import SplitText from '@/components/ui/reactbits/SplitText';
import Magnet from '@/components/ui/reactbits/Magnet';
import { Reveal } from '@/components/ui/kit';

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

/** 纯客户端岛屿：逐字标题动画 + 磁吸入口（避免 hydration 属性不匹配） */
export default function HeroIntro() {
  return (
    <>
      <SplitText
        text="OCEAN FLOW"
        tag="h1"
        textAlign="left"
        splitType="chars"
        className="title-disp text-[42px] sm:text-[58px] md:text-[66px] lg:text-[74px] mt-5 leading-[1.05] text-[#eef4fb]"
        from={{ opacity: 0.15, y: 30, filter: 'blur(10px)' }}
        to={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        delay={34}
        duration={1.05}
        ease="power3.out"
        threshold={0.05}
        rootMargin="-60px"
      />
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
          {ENTRIES.map((e) => (
            <Magnet key={e.href} padding={36} magnetStrength={3} wrapperClassName="block h-full" innerClassName="h-full">
              <Link href={e.href}
                className="btn h-full flex-col items-start !p-4 text-left group" style={{ borderColor: 'rgba(126,190,255,0.18)' }}>
                <span className="text-[10px] tracking-[0.28em]" style={{ color: e.color }}>{e.en}</span>
                <span className="text-[15px] font-bold text-[#eaf6ff] mt-1.5">{e.title}</span>
                <span className="text-[11.5px] text-[#7996b5] leading-relaxed mt-1">{e.desc}</span>
                <span className="text-[13px] text-[#6fe3e0] mt-2 opacity-0 group-hover:opacity-100 transition-opacity">进入 →</span>
              </Link>
            </Magnet>
          ))}
        </div>
      </Reveal>
    </>
  );
}
