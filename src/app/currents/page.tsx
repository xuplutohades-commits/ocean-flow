'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { OceanMap, type OceanMapHandle } from '@/components/map/OceanMap';
import { Panel, Seg, Toggle, Stat, DotLegend, Reveal } from '@/components/ui/kit';
import { CURRENTS, CURRENT_MAP, typeColor, seasonalType } from '@/data/currents';
import { useApp } from '@/store/app';
import type { OceanCurrent, Season } from '@/types';

function CurrentDetail({ c, season, onFocus, onClear }: {
  c: OceanCurrent; season: Season; onFocus: (id: string) => void; onClear: () => void;
}) {
  const col = typeColor(seasonalType(c, season));
  const st = seasonalType(c, season);
  return (
    <div className="p-5 space-y-4 overflow-y-auto scroll-thin" style={{ maxHeight: 'calc(100vh - 260px)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="kicker text-[10px]">{st === 'warm' ? 'WARM CURRENT · 暖流' : 'COLD CURRENT · 寒流'}</div>
          <h2 className="text-[19px] font-bold text-[#eaf6ff] mt-1">{c.nameZh}</h2>
          <div className="text-[11.5px] text-[#6b87a5] mt-0.5 font-medium tracking-wide">{c.nameEn}</div>
        </div>
        <button onClick={onClear} className="w-7 h-7 rounded-lg border border-[rgba(126,190,255,0.2)] text-[13px] text-[#8ba7c6] hover:text-white">✕</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="badge" style={{ color: col, borderColor: `${col}66`, background: `${col}1f` }}>● {st === 'warm' ? '暖流（增温增湿）' : '寒流（降温减湿）'}</span>
        <span className="badge">海域：{c.ocean}</span>
        {c.seasonal && <span className="badge badge-accent">季风海流 · 夏{season === 'summer' ? '顺时针' : ''}</span>}
      </div>

      {c.stats && (
        <div className="grid grid-cols-2 gap-2">
          {c.stats.lengthKm && <Stat label="路径长度" value={`≈${c.stats.lengthKm.toLocaleString()} km`} />}
          {c.stats.speed && <Stat label="表层流速" value={c.stats.speed} />}
          {c.stats.temp && <Stat label="水温" value={c.stats.temp} />}
          {c.stats.note && <Stat label="备注" value={c.stats.note} />}
        </div>
      )}

      <div>
        <div className="kicker-dim mb-1.5">形成原因</div>
        <p className="text-[12.5px] leading-relaxed text-[#a9c3de]">{c.formation}</p>
      </div>
      <div>
        <div className="kicker-dim mb-1.5">地理影响</div>
        <ul className="space-y-1.5">
          {c.effects.map((e, i) => (
            <li key={i} className="text-[12.5px] leading-relaxed text-[#a9c3de] flex gap-2">
              <span className="text-[#6fe3e0] mt-0.5">›</span>{e}
            </li>
          ))}
        </ul>
      </div>
      {c.cases.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] text-[#5f7b99]">进入档案馆：</span>
          {c.cases.map((cid) => (
            <Link key={cid} href={`/cases/${cid}`} className="badge badge-accent hover:brightness-125">{CURRENT_MAP[cid]?.nameZh ?? cid} →</Link>
          ))}
        </div>
      )}
      <div className="rounded-[10px] border border-[rgba(111,227,224,0.22)] bg-[rgba(111,227,224,0.06)] p-3">
        <div className="kicker-dim mb-1">教材衔接</div>
        <p className="text-[12px] leading-relaxed text-[#c9e4e2]">{c.textbook}</p>
      </div>
      <button className="btn btn-primary w-full" onClick={() => onFocus(c.id)}>在地图上定位这条洋流 ◎</button>
    </div>
  );
}

const TEACH_STEPS = [
  {
    t: '第一步 · 找规律',
    d: '观察全球界面：太平洋、大西洋各自有“8”字形环流——中低纬一个、中高纬一个；印度洋南半球同形，北半球被季风改写。',
    focus: 'none',
  },
  {
    t: '第二步 · 中低纬环流（北顺南逆）',
    d: '点击日本暖流 vs 秘鲁寒流对比：北太平洋中低纬环流顺时针（西侧暖流北上、东侧寒流南下）；南半球逆时针。为什么？——信风在西侧堆积，地转偏向力使流动转向。',
    focus: 'kuroshio',
  },
  {
    t: '第三步 · 中高纬环流',
    d: '北半球中高纬环流逆时针：千岛寒流南下、北太平洋暖流东行、西风漂流纵贯三大洋；南极洲周边还有环绕地球的南极环流。',
    focus: 'oyashio',
  },
  {
    t: '第四步 · 北印度洋季风环流',
    d: '全球独一份：冬季逆时针、夏季顺时针。用右上角“季节”开关切换，注意索马里沿岸夏季变寒流（上升流）、冬季变暖流。',
    focus: 'monsoonSummer',
  },
];

export default function CurrentsPage() {
  const { mode, season, setSeason } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBelts, setShowBelts] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [dense, setDense] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [step, setStep] = useState(0);
  const mapRef = useRef<OceanMapHandle>(null);

  const selected = selectedId ? CURRENT_MAP[selectedId] : null;

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) mapRef.current?.focus(id);
    else mapRef.current?.reset();
  }, []);

  const handleFocus = useCallback((id: string) => {
    setSelectedId(id);
    mapRef.current?.focus(id);
  }, []);

  const oceanGroups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const c of CURRENTS) {
      (g[c.ocean] ??= []).push(c.id);
    }
    return g;
  }, []);

  return (
    <div style={{ paddingTop: 76 }}>
      <div className="relative">
        {/* 地图主体 */}
        <div className="map-shell" style={{ height: 'calc(100vh - 76px)', borderRadius: 0 }}>
          <OceanMap
            ref={mapRef}
            season={season}
            interactive
            showWindBelts={showBelts}
            showLabels={showLabels}
            dense={dense}
            speed={speed}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
          {/* 顶部标题 */}
          <div className="absolute top-4 left-5 right-5 flex items-start justify-between gap-3 pointer-events-none z-10">
            <div>
              <div className="kicker">MODULE 01 · GLOBAL CURRENTS</div>
              <h1 className="title-disp text-[22px] md:text-[28px] mt-1 grad-text">全球洋流</h1>
              <div className="text-[12px] text-[#8ba7c6] mt-1 hidden md:block">点击任意洋流查看详情 · 滚轮缩放 · 拖动平移</div>
            </div>
            <div className="pointer-events-auto rounded-xl px-3 py-2" style={{ background: 'rgba(4,14,28,0.7)', border: '1px solid rgba(126,190,255,0.15)', backdropFilter: 'blur(8px)' }}>
              <DotLegend />
            </div>
          </div>

          {/* 底部工具条 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-3xl">
            <Panel className="p-3.5 pointer-events-auto">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                <label className="flex items-center gap-2 text-[12.5px] text-[#a9c3de]">
                  季节
                  <Seg<Season>
                    options={[{ id: 'summer', label: '夏季' }, { id: 'winter', label: '冬季' }]}
                    value={season}
                    onChange={(v) => { setSeason(v); mapRef.current?.reset(); }}
                  />
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-[#a9c3de]">
                  风带
                  <span className={`toggle ${showBelts ? 'toggle-on' : ''}`} onClick={() => setShowBelts(!showBelts)} />
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-[#a9c3de]">
                  名称
                  <span className={`toggle ${showLabels ? 'toggle-on' : ''}`} onClick={() => setShowLabels(!showLabels)} />
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-[#a9c3de] min-w-[140px]">
                  粒子密度
                  <input type="range" className="slider" min={0.4} max={1.8} step={0.1} value={dense}
                    onChange={(e) => setDense(Number(e.target.value))} />
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-[#a9c3de] min-w-[130px]">
                  流速
                  <input type="range" className="slider" min={0.3} max={2} step={0.1} value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))} />
                </label>
                {mode !== 'explore' && (
                  <button className="btn !py-1.5 !px-3 text-[12px]" onClick={() => mapRef.current?.reset()}>
                    {mode === 'teach' ? '全班视角（复位）' : '复位视角'}
                  </button>
                )}
              </div>
            </Panel>
          </div>

          {/* 教学模式分步条 */}
          {mode === 'teach' && (
            <div className="absolute left-5 top-24 bottom-40 w-[300px] hidden xl:block z-20">
              <Panel className="p-4 h-full flex flex-col">
                <div className="kicker text-[10px] mb-3">TEACHING FLOW · 跟着教材走</div>
                <div className="space-y-2 overflow-y-auto scroll-thin flex-1">
                  {TEACH_STEPS.map((s, i) => (
                    <button key={i}
                      onClick={() => { setStep(i); if (s.focus !== 'none') handleFocus(s.focus); else mapRef.current?.reset(); }}
                      className={`w-full text-left rounded-[10px] border p-3 transition-all ${step === i ? 'border-[rgba(111,227,224,0.5)] bg-[rgba(111,227,224,0.08)]' : 'border-[rgba(126,190,255,0.12)] bg-[rgba(8,22,40,0.5)] hover:bg-[rgba(15,38,66,0.6)]'}`}>
                      <div className={`text-[12.5px] font-semibold ${step === i ? 'text-[#d9fffd]' : 'text-[#a9c3de]'}`}>{s.t}</div>
                      <div className="text-[11px] leading-relaxed text-[#7996b5] mt-1">{s.d}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-[#5f7b99]">点击任意步骤，地图会自动定位到示例洋流。</div>
              </Panel>
            </div>
          )}

          {/* 右侧信息面板 */}
          <div className="absolute top-20 right-4 w-[340px] max-w-[90vw] z-30" style={{ maxHeight: 'calc(100vh - 240px)' }}>
            {selected ? (
              <Panel className="h-full">
                <CurrentDetail c={selected} season={season} onFocus={handleFocus} onClear={() => handleSelect(null)} />
              </Panel>
            ) : (
              <Panel className="p-4">
                <div className="kicker text-[10px]">CURRENT CATALOG · 教材洋流</div>
                <div className="mt-3 space-y-2.5 max-h-[46vh] overflow-y-auto scroll-thin pr-1">
                  {Object.entries(oceanGroups).map(([ocean, ids]) => (
                    <div key={ocean}>
                      <div className="text-[11px] tracking-wide text-[#5f7b99] mb-1.5">{ocean}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ids.map((id) => {
                          const c = CURRENT_MAP[id];
                          return (
                            <button key={id}
                              onClick={() => handleFocus(id)}
                              className="chip !py-1 !px-2.5 text-[11.5px]"
                              style={{ color: typeColor(c.type), borderColor: `${typeColor(c.type)}33` }}>
                              {c.nameZh.replace(/（[^）]*）/g, '')}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-[#5f7b99]">共 {CURRENTS.length} 条教材范围洋流（含冬夏两套路径的季风海流）。</div>
              </Panel>
            )}
          </div>
        </div>
      </div>

      {/* 规律小结 */}
      <section className="mx-auto max-w-[1500px] px-6 lg:px-10 py-12">
        <Reveal>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="glass p-5">
              <div className="kicker text-[10px]">RULE 01</div>
              <h3 className="text-[16px] font-bold mt-2">“8 字形”环流</h3>
              <p className="text-[12.5px] leading-relaxed text-[#8ba7c6] mt-2">
                每个大洋的副热带海区都有一个环流：北半球顺时针、南半球逆时针；中高纬（副极地）海区北半球逆时针、南半球由西风漂流贯通。暖流在低纬流向高纬，寒流在高纬流向低纬。
              </p>
            </div>
            <div className="glass p-5">
              <div className="kicker text-[10px]">RULE 02</div>
              <h3 className="text-[16px] font-bold mt-2">岸别定冷暖</h3>
              <p className="text-[12.5px] leading-relaxed text-[#8ba7c6] mt-2">
                中低纬环流：大洋西侧（大陆东岸）是暖流，大洋东侧（大陆西岸）是寒流。判断口诀：“东寒西暖”——日本黑潮暖、加利福尼亚冷冷；澳大利亚东岸暖、西岸冷。
              </p>
            </div>
            <div className="glass p-5">
              <div className="kicker text-[10px]">RULE 03</div>
              <h3 className="text-[16px] font-bold mt-2">季风改写印度洋</h3>
              <p className="text-[12.5px] leading-relaxed text-[#8ba7c6] mt-2">
                北印度洋是唯一冬夏流向相反的洋流区：夏季西南季风 → 顺时针；冬季东北季风 → 逆时针。用“季节”开关对比观察索马里沿岸的变化。
              </p>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
