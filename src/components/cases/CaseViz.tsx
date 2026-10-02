'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from 'react';
import { lerp, clamp } from '@/lib/geo';

/** 沿纬度水温剖面图（SST Chart） */
export function SstChart({ profile, title = '表层水温沿纬度变化' }: {
  profile: { lat: number; temp: number }[]; title?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const draw = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(120, r.width);
      h = Math.max(140, r.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const padL = 34, padR = 10, padT = 16, padB = 26;
      const iw = w - padL - padR, ih = h - padT - padB;
      const lats = profile.map((p) => p.lat);
      const temps = profile.map((p) => p.temp);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const lr = maxLat - minLat || 1;
      const minT = 0, maxT = 30;
      const X = (lat: number) => padL + ((lat - minLat) / lr) * iw;
      const Y = (temp: number) => padT + (1 - (temp - minT) / (maxT - minT)) * ih;
      // 网格
      ctx.strokeStyle = 'rgba(126,190,255,0.08)';
      ctx.lineWidth = 1;
      for (let t = 0; t <= 30; t += 5) {
        ctx.beginPath(); ctx.moveTo(padL, Y(t)); ctx.lineTo(w - padR, Y(t)); ctx.stroke();
        ctx.fillStyle = 'rgba(127,163,196,0.7)';
        ctx.font = '500 9px sans-serif';
        ctx.fillText(`${t}℃`, 4, Y(t) + 3);
      }
      for (let i = 0; i < lats.length; i++) {
        ctx.beginPath(); ctx.moveTo(X(lats[i]), padT); ctx.lineTo(X(lats[i]), h - padB); ctx.stroke();
        ctx.fillStyle = 'rgba(127,163,196,0.7)';
        ctx.fillText(`${lats[i]}°`, X(lats[i]) - 6, h - 10);
      }
      // 曲线与渐变填充
      const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
      grad.addColorStop(0, 'rgba(255,157,92,0.35)');
      grad.addColorStop(1, 'rgba(94,200,255,0.35)');
      ctx.beginPath();
      profile.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.lat), Y(p.temp)) : ctx.lineTo(X(p.lat), Y(p.temp))));
      ctx.strokeStyle = '#6fe3e0';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.lineTo(X(lats[lats.length - 1]), h - padB);
      ctx.lineTo(X(lats[0]), h - padB);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      // 点
      profile.forEach((p) => {
        ctx.fillStyle = '#ffd9ae';
        ctx.beginPath();
        ctx.arc(X(p.lat), Y(p.temp), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });
      if (title) {
        ctx.fillStyle = 'rgba(200,228,255,0.8)';
        ctx.font = '600 11px sans-serif';
        ctx.fillText(title, padL, padT - 4);
      }
    };
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    draw();
    return () => ro.disconnect();
  }, [profile, title]);
  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: 220 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

/** 海雾小动画：暖空气掠过冷水面 */
export function FogViz() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    let raf = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(80, r.width);
      h = Math.max(80, r.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const frame = (now: number) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      // 冷水面
      const seaY = h * 0.7;
      const g = ctx.createLinearGradient(0, seaY, 0, h);
      g.addColorStop(0, 'rgba(90,160,200,0.55)');
      g.addColorStop(1, 'rgba(10,46,80,0.8)');
      ctx.fillStyle = g;
      ctx.fillRect(0, seaY, w, h - seaY);
      ctx.strokeStyle = 'rgba(160,225,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, seaY); ctx.lineTo(w, seaY); ctx.stroke();
      ctx.fillStyle = 'rgba(190,235,255,0.55)';
      ctx.font = '600 10.5px sans-serif';
      ctx.fillText('寒流冷水（0～10 ℃）', 8, seaY + 20);
      // 雾气团
      for (let i = 0; i < 9; i++) {
        const cycle = (t * (0.25 + (i % 3) * 0.08) + i * 0.37) % 1;
        const x = (i / 9) * w + Math.sin(t * 0.7 + i) * 14;
        const y = seaY - cycle * h * 0.5 - 8;
        const r = 12 + cycle * 26 + (i % 4) * 4;
        ctx.fillStyle = `rgba(215, 240, 255, ${0.28 * (1 - cycle)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(200,228,255,0.75)';
      ctx.fillText('暖湿空气在冷水面上凝结 → 海雾', 8, 16);
      raf = requestAnimationFrame(frame);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-[10px]" style={{ height: 170, border: '1px solid rgba(126,190,255,0.14)', background: 'rgba(4,14,28,0.5)' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

/** 同纬度温度对比条 */
export function TempCompare({ warmLabel, warmV, coldLabel, coldV }: {
  warmLabel: string; warmV: number; coldLabel: string; coldV: number;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 120); return () => clearTimeout(t); }, []);
  const bar = (label: string, v: number, col: string, isWarm: boolean) => {
    const frac = Math.abs(v) / 25;
    return (
      <div className="flex-1">
        <div className="text-[12px] font-semibold mb-1.5" style={{ color: col }}>{label}</div>
        <div className="h-[90px] flex items-end gap-1.5">
          {[0.4, 0.7, 1].map((k, i) => (
            <span key={i} className="flex-1 rounded-t-md transition-all duration-[1200ms]"
              style={{
                height: on ? `${Math.max(6, frac * 90 * k)}px` : '6px',
                background: `linear-gradient(180deg, ${col}, ${col}44)`,
                boxShadow: `0 0 12px ${col}55`,
                transitionDelay: `${i * 120 + (isWarm ? 0 : 200)}ms`,
              }} />
          ))}
        </div>
        <div className="num text-[13px] font-bold mt-1.5" style={{ color: col }}>{v > 0 ? '+' : ''}{v} ℃</div>
        <div className="text-[10px] text-[#5f7b99]">1 月均温</div>
      </div>
    );
  };
  return (
    <div className="flex gap-6 items-end rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.5)', border: '1px solid rgba(126,190,255,0.16)' }}>
      {bar(warmLabel, warmV, '#ff9d5c', true)}
      <div className="h-[70px] w-px" style={{ background: 'linear-gradient(180deg, transparent, rgba(126,190,255,0.3), transparent)' }} />
      {bar(coldLabel, coldV, '#5ec8ff', false)}
    </div>
  );
}

/** 任意一组数值柱（如渔获/降水对比） */
export function MeterBars({ items }: { items: { label: string; value: number; max?: number; col: string }[] }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 150); return () => clearTimeout(t); }, []);
  return (
    <div className="space-y-2.5">
      {items.map((m, i) => {
        const frac = clamp((m.value) / (m.max ?? 100), 0, 1);
        return (
          <div key={i}>
            <div className="flex justify-between text-[12px] text-[#a9c3de] mb-1">
              <span>{m.label}</span><span className="num">{Math.round(m.value)}{m.max ? '' : ''}</span>
            </div>
            <div className="h-[7px] rounded-full bg-[rgba(60,90,120,0.25)] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{
                width: on ? `${frac * 100}%` : '0%',
                background: `linear-gradient(90deg, ${m.col}55, ${m.col})`,
                boxShadow: `0 0 10px ${m.col}66`,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 经纬度→SVG 点（用于局部小图，平铺在案例描述中） */
export function lngLatToView(lng: number, lat: number, box: { lng0: number; lat0: number; lng1: number; lat1: number }, W: number, H: number) {
  const x = ((lng - box.lng0) / (box.lng1 - box.lng0)) * W;
  const y = ((box.lat0 - lat) / (box.lat0 - box.lat1)) * H;
  return { x, y };
}
export { lerp };
