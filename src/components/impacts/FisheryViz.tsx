'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import { lerp, clamp } from '@/lib/geo';

/** 渔场成因小动画：convergence = 寒暖流交汇；upwelling = 离岸风上升流 */
export default function FisheryViz({ type }: { type: 'convergence' | 'upwelling' }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(80, r.width);
      h = Math.max(120, r.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = clamp((now - last) / 1000, 0, 0.06);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      if (type === 'convergence') {
        // 左: 寒流向下, 右: 暖流向上, 中心锋面
        const fx = w * 0.5;
        const g1 = ctx.createLinearGradient(0, 0, w, 0);
        g1.addColorStop(0, 'rgba(94,200,255,0.10)');
        g1.addColorStop(0.5, 'rgba(111,227,224,0.14)');
        g1.addColorStop(1, 'rgba(255,157,92,0.10)');
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(160,225,255,0.5)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(fx, 8); ctx.lineTo(fx, h - 8); ctx.stroke();
        ctx.setLineDash([]);

        for (let i = 0; i < 26; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const y = ((pseudo(i) * h) + t * (side > 0 ? 34 : -34) * (i % 3 + 1) * 0.5) % h;
          const yy = y < 0 ? y + h : y;
          const x0 = fx + side * lerp(20, w * 0.42, pseudo(i + 40));
          const x1 = fx + side * lerp(6, 20, pseudo(i + 80));
          const col = side > 0 ? '94,200,255' : '255,157,92';
          ctx.strokeStyle = `rgba(${col},0.6)`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x0, yy);
          ctx.lineTo(x1, yy + (yy - h / 2) * 0.02);
          ctx.stroke();
        }
        // 锋面泡沫 + 鱼群聚集
        const swirl = 26 * Math.sin(t * 3);
        for (let i = 0; i < 5; i++) {
          const ay = h * (0.25 + 0.5 * pseudo(i + 9)) + Math.sin(t * 2 + i) * 8;
          ctx.fillStyle = 'rgba(220,245,255,0.5)';
          ctx.beginPath();
          ctx.arc(fx + Math.cos(t * 4 + i * 2) * (5 + i), ay, 1.8 + i * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#8fd8ff';
        ctx.font = '600 10px sans-serif';
        ctx.fillText('锋面：下层营养盐随扰动上泛', fx + 8, h * 0.18);
        ctx.fillStyle = 'rgba(255,214,150,0.85)';
        ctx.fillText('鱼群聚集', fx + 8, h * 0.34 + swirl * 0.2);
      } else {
        // 上升流：左侧海岸，风向上（离岸），表层向右，深层向上
        const coastX = w * 0.2;
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, 'rgba(5,18,34,0.9)');
        g.addColorStop(0.2, 'rgba(8,30,52,0.4)');
        g.addColorStop(1, 'rgba(10,42,74,0.25)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(60,90,110,0.8)';
        ctx.fillRect(coastX - 10, 0, 12, h);
        ctx.fillStyle = 'rgba(140,180,210,0.5)';
        ctx.font = '500 9.5px sans-serif';
        ctx.fillText('陆地', 4, h * 0.14);

        // 风（图中向上 = 沿岸南风）
        for (let i = 0; i < 3; i++) {
          const x = coastX + 12 + i * 14;
          const y0 = h * 0.12 + (t * 60 + i * 30) % (h * 0.2);
          ctx.strokeStyle = 'rgba(200,235,255,0.65)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - 26); ctx.stroke();
          ctx.fillStyle = 'rgba(200,235,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(x, y0 - 28); ctx.lineTo(x - 4, y0 - 20); ctx.lineTo(x + 4, y0 - 20); ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(190,230,255,0.8)';
        ctx.font = '600 10px sans-serif';
        ctx.fillText('离岸风（沿岸风）', coastX + 22, h * 0.1);

        // 表层海水向右
        for (let i = 0; i < 4; i++) {
          const y = h * (0.32 + 0.05 * i) + Math.sin(t * 3 + i) * 3;
          const x0 = coastX + 18 + (t * 40 + i * 20) % (w - coastX - 30);
          ctx.strokeStyle = 'rgba(140,200,220,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 26, y); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(160,220,240,0.75)';
        ctx.fillText('表层海水离岸', coastX + 30, h * 0.3);

        // 深层冷水上升（营养盐）
        for (let i = 0; i < 22; i++) {
          const k = ((t * (0.12 + pseudo(i) * 0.08) + pseudo(i + 3)) % 1);
          const x = coastX + 6 + pseudo(i + 7) * 34;
          const y = h * (1 - k * 0.72);
          ctx.fillStyle = `rgba(120, ${190 + i * 2}, 250, ${0.3 + k * 0.6})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.4 + k * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        // 营养盐上泛后 → 表层绿色浮游
        ctx.fillStyle = 'rgba(120,230,170,0.35)';
        ctx.beginPath();
        ctx.ellipse(coastX + 26, h * 0.5, 4, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(150,255,190,0.8)';
        ctx.font = '600 10px sans-serif';
        ctx.fillText('营养盐 → 浮游生物 → 鱼群', coastX + 20, h * 0.55);
      }
      raf = requestAnimationFrame(frame);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [type]);

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-[10px]" style={{ height: 180, border: '1px solid rgba(126,190,255,0.14)', background: 'rgba(4,14,28,0.5)' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

function pseudo(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
