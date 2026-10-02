'use client';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-[rgba(126,190,255,0.1)] mt-2"
      style={{ background: 'linear-gradient(180deg, rgba(3,10,22,0.2), rgba(2,7,15,0.9))' }}>
      <div className="mx-auto max-w-[1500px] px-6 lg:px-8 py-10 flex flex-col md:flex-row gap-8 md:items-start md:justify-between">
        <div className="max-w-md">
          <div className="text-[15px] font-bold tracking-wide">OCEAN FLOW <span className="ml-2 text-[13px] font-normal text-[#8ba7c6]">高中地理 · 洋流互动实验室</span></div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[#5f7b99]">
            面向高中地理课堂的交互式海洋实验室。内容涵盖：世界洋流分布规律、暖流与寒流、洋流形成机制及其对气候、渔场、航海与污染的影响。
            所有模拟均为教学简化模型，用于理解概念而非预报。
          </p>
        </div>
        <div className="flex gap-12">
          <div>
            <div className="kicker-dim mb-3">模块</div>
            <ul className="space-y-2 text-[12.5px] text-[#8ba7c6]">
              {[['/currents', '全球洋流'], ['/formation', '洋流如何形成'], ['/atmosphere', '洋流 × 大气'], ['/impacts', '洋流带来什么'], ['/cases', '洋流档案馆'], ['/lab', '地理实验室']].map(([h, l]) => (
                <li key={h}><Link href={h} className="hover:text-[#dffcfb] transition-colors">{l}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="kicker-dim mb-3">影像来源</div>
            <ul className="space-y-2 text-[12.5px] text-[#8ba7c6]">
              <li><a href="https://images.nasa.gov" target="_blank" rel="noreferrer" className="hover:text-[#dffcfb]">NASA 图像库</a></li>
              <li><a href="https://svs.gsfc.nasa.gov" target="_blank" rel="noreferrer" className="hover:text-[#dffcfb]">NASA SVS / GSFC</a></li>
              <li><a href="https://worldview.earthdata.nasa.gov" target="_blank" rel="noreferrer" className="hover:text-[#dffcfb]">NASA Worldview</a></li>
              <li><a href="https://www.ncei.noaa.gov" target="_blank" rel="noreferrer" className="hover:text-[#dffcfb]">NOAA NCEI</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-[rgba(126,190,255,0.08)] py-4 text-center text-[11px] text-[#43617f]">
        教学用途 · 数据与影像版权归各自来源所有 · “洋流，正在重新分配这个星球的热量”
      </div>
    </footer>
  );
}
