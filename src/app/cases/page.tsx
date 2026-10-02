'use client';
import Link from 'next/link';
import { OceanMap } from '@/components/map/OceanMap';
import { Reveal } from '@/components/ui/kit';
import { CASES, CASE_MAP } from '@/data/cases';
import { CURRENT_MAP } from '@/data/currents';

export default function CasesIndexPage() {
  return (
    <div style={{ paddingTop: 96 }} className="pb-14">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-10">
        <Reveal>
          <div className="kicker">MODULE 05 · REAL WORLD ARCHIVE</div>
          <h1 className="title-disp text-[26px] md:text-[34px] mt-2 grad-text">真实世界 · 洋流档案馆</h1>
          <p className="mt-3 text-[13.5px] text-[#8ba7c6] max-w-3xl leading-relaxed">
            每一条教材洋流都不只是地图上的箭头。点开档案：看它的位置与路径、它为什么形成、它改变了什么，
            配以 NASA / NOAA 卫星影像与真实地理案例。本档案馆聚焦教材核心洋流，不追求穷举。
          </p>
        </Reveal>

        <div className="mt-8 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {CASES.map((c, i) => {
            const main = CURRENT_MAP[c.currentIds[0]];
            return (
              <Reveal key={c.id} delay={i * 0.04}>
                <Link href={`/cases/${c.id}`} className="glass overflow-hidden block group h-full hover:-translate-y-1 transition-transform">
                  <div className="relative h-[190px]">
                    <OceanMap
                      currentIds={c.currentIds}
                      region={c.region}
                      showLabels
                      dense={0.85}
                      speed={1}
                      interactive={false}
                      selectedId={c.currentIds[0]}
                      dimUnselected
                    />
                    <div className="absolute top-2.5 left-2.5">
                      <span className={`badge ${main?.type === 'warm' ? 'badge-warm' : 'badge-cold'}`}>
                        {main?.type === 'warm' ? '暖流' : '寒流'}
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="kicker text-[9.5px]">{main?.nameEn ?? c.id}</div>
                    <h2 className="text-[18px] font-bold text-[#eaf6ff] mt-1.5 group-hover:text-[#d9fffd] transition-colors">{c.title}</h2>
                    <p className="text-[12px] text-[#7996b5] mt-1.5 leading-relaxed">{c.subtitle}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11.5px] text-[#6fe3e0] flex items-center gap-1">
                        {c.currentIds.map((id, idx) => (
                          <span key={id} className="badge !text-[10.5px] !py-0.5 !px-2" style={{ color: CURRENT_MAP[id]?.type === 'warm' ? '#ffb27a' : '#7fd4ff', borderColor: 'transparent' }}>
                            {CURRENT_MAP[id]?.nameZh.replace(/（[^）]*）/g, '')}
                          </span>
                        ))}
                      </span>
                      <span className="text-[12px] text-[#6fe3e0] opacity-0 group-hover:opacity-100 transition-opacity">打开档案 →</span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>

        <Reveal>
          <div className="mt-10 glass p-5 text-[12.5px] leading-relaxed text-[#8ba7c6]">
            <b className="text-[#cfe4ff]">影像与数据说明：</b>全部真实影像来自 NASA 图像与视频库（NASA Image and Video Library），
            每张影像均保留标题、来源与页面链接；水温、流速等数据为教学量级估计（来源于 NOAA / NASA 科普资料与教材表述），用于概念理解，不替代官方数据集。
            共 {Object.keys(CASE_MAP).length} 个档案 · 规则：“怎么形成 → 改变了什么 → 可信的影像 → 教材怎么说”。
          </div>
        </Reveal>
      </div>
    </div>
  );
}
