'use client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useMemo, useState } from 'react';
import { OceanMap } from '@/components/map/OceanMap';
import { useCaseImages } from '@/components/cases/useCaseImages';
import { SstChart, FogViz, TempCompare } from '@/components/cases/CaseViz';
import FisheryViz from '@/components/impacts/FisheryViz';
import { Panel, Seg, Reveal } from '@/components/ui/kit';
import { CASES, CASE_MAP } from '@/data/cases';
import { CURRENT_MAP } from '@/data/currents';
import { useApp } from '@/store/app';
import { monsoonWind } from '@/lib/wind';
import type { Season } from '@/types';

export default function PageClient({ id }: { id: string }) {
  const c = CASE_MAP[id];
  if (!c) notFound();
  return <CaseBody cid={id} key={id} />;
}

function CaseBody({ cid }: { cid: string }) {
  const c = CASE_MAP[cid];
  const { season, setSeason } = useApp();
  const [sec, setSec] = useState(0);
  const imgs = useCaseImages();
  const main = CURRENT_MAP[c.currentIds[0]];
  const windField = useMemo(() => (lng: number, lat: number) => monsoonWind(lng, lat, season), [season]);

  const vizFor = (viz: string | undefined) => {
    switch (viz) {
      case 'upwelling': return <FisheryViz type="upwelling" />;
      case 'convergence': return <FisheryViz type="convergence" />;
      case 'fog': return <FogViz />;
      case 'climate-compare': return (
        c.id === 'gulfstream'
          ? <TempCompare warmLabel="伦敦（受暖流）" warmV={5} coldLabel="魁北克（同纬度）" coldV={-15} />
          : c.id === 'peru'
            ? <TempCompare warmLabel="赤道东太（无寒流）" warmV={27} coldLabel="秘鲁沿岸（寒流+上升流）" coldV={19} />
            : c.id === 'benguela'
              ? <TempCompare warmLabel="同纬度西非内陆" warmV={26} coldLabel="纳米布沿岸（本格拉寒流）" coldV={17} />
              : <TempCompare warmLabel="受暖流影响沿岸" warmV={8} coldLabel="同纬度对岸" coldV={-9} />
      );
      case 'seasonal': return (
        <div className="rounded-[10px] overflow-hidden relative" style={{ border: '1px solid rgba(126,190,255,0.16)' }}>
          <OceanMap currentIds={['monsoonSummer', 'somaliSummer', 'indSouthEq']} region={{ center: [67, 10], zoom: 2.8 }}
            season={season} showLabels dense={1} windField={windField} upwelling />
          <div className="absolute bottom-2 left-2">
            <Seg<Season> options={[{ id: 'summer', label: '夏季·顺时针' }, { id: 'winter', label: '冬季·逆时针' }]}
              value={season} onChange={setSeason} />
          </div>
        </div>
      );
      default: return null;
    }
  };

  return (
    <div style={{ paddingTop: 96 }} className="pb-14">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-10">
        <Reveal>
          <div className="flex items-center gap-2 text-[12px] text-[#5f7b99]">
            <Link href="/cases" className="hover:text-[#d9fffd]">← 洋流档案馆</Link>
            <span>/</span>
            <span className="text-[#9db4cf]">{c.title}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="kicker">{main?.nameEn}</div>
              <h1 className="title-disp text-[28px] md:text-[38px] mt-1.5 grad-text">{c.title}</h1>
              <p className="mt-2 text-[14px] text-[#a9c3de] max-w-2xl">{c.subtitle}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {c.currentIds.map((id2) => (
                <span key={id2} className={`badge ${CURRENT_MAP[id2]?.type === 'warm' ? 'badge-warm' : 'badge-cold'}`}>
                  {CURRENT_MAP[id2]?.nameZh}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-4">
            <div className="rounded-[16px] overflow-hidden relative" style={{ border: '1px solid rgba(126,190,255,0.18)', minHeight: 480, height: '62vh' }}>
              <OceanMap
                currentIds={c.currentIds}
                region={c.region}
                season={season}
                interactive
                showLabels
                dense={1}
                speed={1.2}
                selectedId={c.currentIds[0]}
                dimUnselected
              />
              <div className="absolute top-3 left-3 pointer-events-none">
                <span className="badge" style={{ background: 'rgba(4,14,28,0.8)' }}>位置与路径 · 滚轮缩放 · 拖动平移</span>
              </div>
            </div>
            <div className="space-y-4">
              <Panel className="p-5">
                <div className="kicker text-[10px]">KEY DATA · 关键数据</div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {c.facts.map((f) => (
                    <div key={f.label} className="rounded-[10px] px-3 py-2.5" style={{ background: 'rgba(8,22,40,0.6)', border: '1px solid rgba(126,190,255,0.13)' }}>
                      <div className="text-[10.5px] text-[#5f7b99]">{f.label}</div>
                      <div className="text-[12.5px] font-semibold text-[#dff4ff] mt-1 leading-snug">{f.value}</div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel className="p-5">
                <div className="kicker text-[10px]">WHY IT EXISTS · 它为什么形成</div>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#a9c3de]">{c.formation}</p>
              </Panel>
              {c.sstProfile && (
                <Panel className="p-5">
                  <div className="kicker text-[10px]">SST PROFILE · 水温剖面</div>
                  <SstChart profile={c.sstProfile} />
                </Panel>
              )}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-10">
            <div className="kicker">WHAT IT CHANGES · 它改变了什么</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.sections.map((s, i) => (
                <button key={i} onClick={() => setSec(i)}
                  className={`chip ${sec === i ? 'chip-on' : ''}`}>
                  {s.title}
                </button>
              ))}
            </div>
            <div key={sec} className="mt-4 grid lg:grid-cols-[1fr_380px] gap-5">
              <Panel className="p-6">
                <h3 className="text-[17px] font-bold text-[#eaf6ff]">{c.sections[sec].title}</h3>
                <p className="mt-2.5 text-[13px] leading-[1.9] text-[#a9c3de]">{c.sections[sec].body}</p>
              </Panel>
              <div>{vizFor(c.sections[sec].viz)}</div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-12">
            <div className="kicker">REAL IMAGERY · 真实影像（NASA）</div>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              {c.imageKeys.map((k) => {
                const img = imgs?.[k];
                if (!img) return <div key={k} className="glass p-6 text-[12px] text-[#5f7b99]">正在加载影像元数据…</div>;
                return (
                  <div key={k} className="glass p-4">
                    <img src={img.url} alt={img.caption} loading="lazy"
                      className="w-full rounded-[10px] max-h-[340px] object-cover"
                      style={{ border: '1px solid rgba(126,190,255,0.16)', filter: 'saturate(0.92) brightness(0.96)', background: '#03101f' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.25'; }}
                    />
                    <div className="mt-2.5 text-[12px] leading-relaxed text-[#a9c3de]">{img.caption}</div>
                    <div className="mt-1.5 text-[10.5px] text-[#5f7b99]">
                      <b>{img.source}</b> · {img.license} ·{' '}
                      <a href={img.pageUrl} target="_blank" rel="noreferrer" className="underline hover:text-[#d9fffd]">影像原始页面</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-10 rounded-[16px] p-6" style={{ border: '1px solid rgba(111,227,224,0.3)', background: 'linear-gradient(135deg, rgba(111,227,224,0.08), rgba(8,22,40,0.6))' }}>
            <div className="kicker text-[10px]">TEXTBOOK · 教材知识点</div>
            <ul className="mt-3 grid md:grid-cols-2 gap-x-8 gap-y-2">
              {c.teaching.map((t, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-[#cfe4ff] flex gap-2.5"><span className="text-[#6fe3e0]">✓</span>{t}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {CASES.filter((x) => x.id !== c.id).slice(0, 3).map((x) => (
                <Link key={x.id} href={`/cases/${x.id}`} className="badge badge-accent hover:brightness-125">相关档案：{x.title} →</Link>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
