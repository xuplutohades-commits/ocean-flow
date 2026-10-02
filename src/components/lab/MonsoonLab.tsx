'use client';
import { useMemo, useRef, useState } from 'react';
import { OceanMap, type OceanMapHandle } from '@/components/map/OceanMap';
import { monsoonWind } from '@/lib/wind';
import { Seg } from '@/components/ui/kit';
import { useApp } from '@/store/app';
import type { Season, WindArrow } from '@/types';

export default function MonsoonLab() {
  const { season, setSeason } = useApp();
  const mapRef = useRef<OceanMapHandle>(null);
  const [str, setStr] = useState(60);

  const arrows = useMemo<WindArrow[]>(() => {
    const out: WindArrow[] = [];
    for (let lng = 42; lng <= 100; lng += 10) {
      for (let lat = 2; lat <= 26; lat += 6) {
        const w = monsoonWind(lng, lat, season);
        if (!w) continue;
        out.push({ lng, lat, dir: (Math.atan2(w.dy, w.dx) * 180) / Math.PI, strength: w.strength * str * 1.2 });
      }
    }
    return out;
  }, [season, str]);

  const winter = season === 'winter';

  return (
    <div className="grid lg:grid-cols-[1fr_330px] gap-4">
      <div className="rounded-[14px] overflow-hidden relative" style={{ border: '1px solid rgba(126,190,255,0.25)', minHeight: 480, height: '64vh' }}>
        <OceanMap
          ref={mapRef}
          region={{ center: [70, 12], zoom: 3.2 }}
          season={season}
          windArrows={arrows}
          showLabels
          dense={1.1}
          interactive={false}
          currentIds={['monsoonSummer', 'somaliSummer', 'indSouthEq', 'westAustralia']}
        />
        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
          <span className="badge" style={{ background: 'rgba(4,14,28,0.8)' }}>
            {winter ? '冬季：东北季风 → 逆时针环流' : '夏季：西南季风 → 顺时针环流'}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 pointer-events-auto flex items-center gap-2">
          <Seg<Season> options={[{ id: 'summer', label: '🏖 夏季' }, { id: 'winter', label: '❄ 冬季' }]}
            value={season} onChange={setSeason} />
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.6)', border: '1px solid rgba(126,190,255,0.16)' }}>
          <div className="kicker-dim mb-2">季风风速（箭头强度）</div>
          <input type="range" className="slider" min={10} max={100} value={str} onChange={(e) => setStr(Number(e.target.value))} />
          <div className="num text-[13px] text-[#6fe3e0] mt-1.5">{str}%</div>
          <p className="mt-2 text-[12px] leading-relaxed text-[#8ba7c6]">
            风速越大，箭头越长，环流越“结实”。注意：<b>{winter ? '索马里沿岸冬季转为暖流（向岸风、无上升流）' : '索马里沿岸夏季出现寒流（离岸风 → 上升流）'}</b>。
          </p>
        </div>
        <div className="rounded-[12px] p-4" style={{ background: 'rgba(111,227,224,0.06)', border: '1px solid rgba(111,227,224,0.25)' }}>
          <div className="kicker-dim mb-2">变式思考（高考高频）</div>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-[#a9c3de]">
            <li>① 夏季从波斯湾开往中国的油轮，航向与环流同向还是逆向？——夏季北印度洋顺时针，西行是逆流。</li>
            <li>② 郑和船队“冬出发、夏返回”利用了哪两个季风？——东北季风去、西南季风回。</li>
            <li>③ 索马里海域夏季为什么渔业旺？——上升流带来营养盐（与秘鲁渔场同理）。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
