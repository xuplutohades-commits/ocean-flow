'use client';
import { useMemo, useRef, useState } from 'react';
import { OceanMap, type OceanMapHandle } from '@/components/map/OceanMap';
import { CURRENT_MAP } from '@/data/currents';
import { useApp } from '@/store/app';

const PRESETS = [
  { zh: '台湾东岸 · 黑潮起点', lng: 121.8, lat: 23.5 },
  { zh: '福岛近海', lng: 141.5, lat: 37.8 },
  { zh: '秘鲁沿岸 · 上升流区', lng: -77.2, lat: -12 },
  { zh: '悉尼外海 · 东澳暖流', lng: 154, lat: -33 },
  { zh: '加那利 · 跨大西洋', lng: -16, lat: 28 },
  { zh: '好望角 · 厄加勒斯', lng: 19, lat: -35 },
];
const COLORS = ['#ffe08a', '#ff9d5c', '#7fe3e0', '#b79bff', '#ff8f9d', '#9fe870'];

export default function DriftBottle() {
  const { season } = useApp();
  const mapRef = useRef<OceanMapHandle>(null);
  const [bottles, setBottles] = useState<{ lng: number; lat: number; label: string; color: string; n: number }[]>([]);
  const [speed, setSpeed] = useState(1.2);
  const [lastPos, setLastPos] = useState<{ lng: number; lat: number; currentId: string | null } | null>(null);
  const nRef = useRef(0);

  const drop = (lng: number, lat: number, label: string) => {
    nRef.current += 1;
    const color = COLORS[(nRef.current - 1) % COLORS.length];
    mapRef.current?.dropTracker({ lng, lat, color, label: `${label}` });
    setBottles((b) => [{ lng, lat, label, color, n: nRef.current }, ...b].slice(0, 6));
    mapRef.current?.setView({ center: [lng, lat], zoom: 4 });
  };

  const onTrackerMove = (info: { lng: number; lat: number; currentId: string | null }) => setLastPos(info);

  const tips = useMemo(() => {
    if (!lastPos) return '点击地图任意海域（或使用预设点）投放漂流瓶，观察它随表层洋流的旅程。';
    const c = lastPos.currentId ? CURRENT_MAP[lastPos.currentId] : null;
    return `漂流瓶现在大致位于 ${lastPos.lng.toFixed(1)}°E / ${lastPos.lat.toFixed(1)}°N${c ? `，正漂在「${c.nameZh}」上（${c.type === 'warm' ? '暖流' : '寒流'}）` : ''}。`;
  }, [lastPos]);

  return (
    <div className="grid lg:grid-cols-[1fr_330px] gap-4">
      <div className="rounded-[14px] overflow-hidden relative" style={{ border: '1px solid rgba(255,214,150,0.3)', minHeight: 480, height: '64vh' }}>
        <OceanMap
          ref={mapRef}
          season={season}
          speed={speed}
          interactive
          showLabels={false}
          onTrackerMove={onTrackerMove}
          currentIds={['kuroshio', 'northPacCurrent', 'californiaCurrent', 'pacNorthEq', 'gulfStream', 'northAtlanticCurrent', 'canaryCurrent', 'atlNorthEq', 'agulhas', 'indSouthEq', 'westAustralia', 'eastAustralia', 'peruCurrent', 'pacSouthEq', 'brazilCurrent', 'benguelaCurrent', 'atlSouthEq', 'oyashio', 'monsoonSummer', 'somaliSummer']}
        />
        <div className="absolute top-3 left-3 pointer-events-none">
          <span className="badge badge-accent" style={{ background: 'rgba(4,14,28,0.8)' }}>点击海面投放漂流瓶</span>
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-xl">
          <div className="flex items-center gap-3 px-3 py-2 rounded-[12px]" style={{ background: 'rgba(4,14,28,0.8)', border: '1px solid rgba(255,214,150,0.25)' }}>
            <span className="text-[11.5px] text-[#a9c3de] whitespace-nowrap">漂流速度</span>
            <input type="range" className="slider flex-1" min={0.2} max={2.6} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            <span className="num text-[11.5px] text-[#ffe08a] whitespace-nowrap">{speed.toFixed(1)}×</span>
            <button className="btn !py-1 !px-3 text-[11.5px]" onClick={() => mapRef.current?.clearTrackers()}>清空</button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="kicker-dim mb-2">预设投放点</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.zh} className="chip !py-2 text-[11.5px] justify-center" onClick={() => drop(p.lng, p.lat, p.zh.split(' · ')[0])}>
                {p.zh}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.6)', border: '1px solid rgba(126,190,255,0.16)' }}>
          <div className="kicker-dim mb-2">当前投放</div>
          {bottles.length === 0 ? <div className="text-[12px] text-[#5f7b99]">还没有漂流瓶。试试先投放一个，再投放第二个做同海域对比。</div> : (
            <ul className="space-y-1.5">
              {bottles.map((b) => (
                <li key={b.n} className="flex items-center gap-2.5 text-[12px] text-[#a9c3de]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color, boxShadow: `0 0 8px ${b.color}` }} />
                  #{b.n} {b.label}
                  <span className="ml-auto text-[10.5px] text-[#5f7b99]">漂流中…</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 text-[11.5px] leading-relaxed text-[#7996b5]">{tips}</div>
        </div>
        <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(111,227,224,0.2)' }}>
          <div className="kicker-dim mb-2">教学要点</div>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-[#8ba7c6]">
            <li>· 表层漂流物主要随表层洋流运动（实际还叠加风应力，本实验为简化模型）</li>
            <li>· 亚热带环流是“闭合回路”：瓶子会在环流里打转多年，垃圾也因此聚集（太平洋垃圾带）</li>
            <li>· 北赤道暖流西行的瓶子最终会汇入黑潮，北上到日本附近——这就是“漂流瓶跨海”的原理</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
