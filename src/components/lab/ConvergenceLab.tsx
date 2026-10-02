'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import { clamp } from '@/lib/geo';

export interface ConvergeParams {
  /** 水温差 ℃ */
  dT: number;
  windK: number; // 扰动强度
  speed: number;
}

/**
 * 寒暖流交汇实验：冷流自西北向东南、暖流自西南向东北，中心形成锋面。
 * dT↑ → 锋面更清晰、雾更浓；扰动↑ → 营养盐上泛更多、鱼群更密。
 */
export default function ConvergenceLab({ params }: { params: ConvergeParams }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pRef = useRef(params);
  pRef.current = params;

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(100, r.width);
      h = Math.max(140, r.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (now: number) => {
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      const t = now / 1000;
      const p = pRef.current;
      const dT = p.dT;
      const turb = p.windK / 100;
      const fx = w * 0.5;

      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createLinearGradient(0, 0, w, 0);
      bg.addColorStop(0, 'rgba(6,24,44,0.8)');
      bg.addColorStop(0.5, 'rgba(10,40,66,0.85)');
      bg.addColorStop(1, 'rgba(24,40,52,0.8)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // 冷暖水面
      const coldG = ctx.createLinearGradient(fx - w * 0.18, 0, fx, 0);
      coldG.addColorStop(0, `rgba(70,160,210,${0.25 + dT * 0.012})`);
      coldG.addColorStop(1, 'rgba(120,200,240,0.05)');
      const warmG = ctx.createLinearGradient(fx, 0, fx + w * 0.18, 0);
      warmG.addColorStop(0, 'rgba(255,170,92,0.06)');
      warmG.addColorStop(1, `rgba(255,140,70,${0.2 + dT * 0.012})`);
      ctx.fillStyle = coldG;
      ctx.fillRect(0, 0, fx, h);
      ctx.fillStyle = warmG;
      ctx.fillRect(fx, 0, w - fx, h);

      // 洋流箭头（斜向）
      const arrow = (x0: number, y0: number, dx: number, dy: number, cold: boolean, alpha: number) => {
        ctx.strokeStyle = cold ? `rgba(140,215,255,${alpha})` : `rgba(255,170,100,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx, y0 + dy); ctx.stroke();
        const a = Math.atan2(dy, dx);
        ctx.fillStyle = cold ? `rgba(170,225,255,${alpha + 0.2})` : `rgba(255,185,115,${alpha + 0.2})`;
        ctx.beginPath();
        ctx.moveTo(x0 + dx + Math.cos(a) * 8, y0 + dy + Math.sin(a) * 8);
        ctx.lineTo(x0 + dx + Math.cos(a + 2.5) * 6, y0 + dy + Math.sin(a + 2.5) * 6);
        ctx.lineTo(x0 + dx + Math.cos(a - 2.5) * 6, y0 + dy + Math.sin(a - 2.5) * 6);
        ctx.closePath();
        ctx.fill();
      };
      for (let i = 0; i < 6; i++) {
        const yy = h * (0.18 + 0.12 * i) + Math.sin(t * 1.6 + i * 2) * 6;
        const phase = (t * 26 * p.speed + i * 60) % (fx - 40);
        arrow(fx - 30 - phase, yy + 14, 22, -9, true, 0.55);
      }
      for (let i = 0; i < 6; i++) {
        const yy = h * (0.24 + 0.12 * i) + Math.cos(t * 1.4 + i * 2.4) * 6;
        const phase = (t * 22 * p.speed + i * 52) % (w - fx - 40);
        arrow(fx + 20 + phase, yy, -22, 9, false, 0.55);
      }
      ctx.font = '600 10.5px sans-serif';
      ctx.fillStyle = 'rgba(150,220,255,0.85)';
      ctx.fillText('寒流（千岛寒流）', 10, 18);
      ctx.fillStyle = 'rgba(255,190,120,0.85)';
      ctx.fillText('暖流（日本暖流）', w - 110, 18);

      // 锋面
      const frontAlpha = 0.35 + dT * 0.03 + turb * 0.25;
      ctx.strokeStyle = `rgba(220, 245, 255, ${frontAlpha})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(fx, 6);
      for (let y = 6; y < h; y += 14) {
        ctx.lineTo(fx + Math.sin(y * 0.05 + t * 1.8) * (4 + turb * 10), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = `rgba(230, 250, 255, ${0.5 + frontAlpha * 0.6})`;
      ctx.fillText('海洋锋面', fx + 10, 20);

      // 扰动涡旋（锋面两侧）
      const nVortex = Math.round(3 + turb * 5);
      for (let i = 0; i < nVortex; i++) {
        const vx = fx + Math.cos(t * 2 + i * 2.1) * (14 + turb * 30);
        const vy = h * (0.2 + 0.6 * ((i * 0.37 + t * 0.08) % 1)) + Math.sin(t * 3 + i) * 8;
        const r = 4 + turb * 7 + dT * 0.15;
        ctx.strokeStyle = `rgba(210, 240, 255, ${0.3 + turb * 0.35})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(vx, vy, r, t * 4 + i, t * 4 + i + Math.PI * 1.5);
        ctx.stroke();
      }

      // 营养盐上泛（扰动带来）：从锋面下方向上冒
      const upwellCount = Math.round(10 + turb * 26 + dT * 2);
      for (let i = 0; i < upwellCount; i++) {
        const k = (t * (0.1 + 0.05 * ((i * 7) % 5)) + (i * 0.13)) % 1;
        const xn = fx + Math.sin(i * 3.7 + k * 9) * (6 + turb * 18);
        const yn = h * (1 - k * 0.7);
        ctx.fillStyle = `rgba(120, 215, 255, ${0.25 + k * 0.55})`;
        ctx.beginPath();
        ctx.arc(xn, yn, 1.5 + k * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 海雾（dT 大时暖湿气流在冷水上凝结）
      const fogK = dT > 4 ? clamp((dT - 4) / 11, 0, 1) : 0;
      for (let i = 0; i < 12; i++) {
        const cycle = (t * (0.2 + (i % 3) * 0.05) + i * 0.31) % 1;
        const x = fx + (i - 6) * 7 + Math.sin(t + i) * 6;
        const y = h * 0.42 - cycle * h * 0.33 - 6;
        const r = 8 + cycle * 16;
        ctx.fillStyle = `rgba(225, 243, 255, ${0.22 * fogK * (1 - cycle)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (fogK > 0.05) {
        ctx.fillStyle = `rgba(225,245,255,${0.3 + fogK * 0.6})`;
        ctx.font = '600 11px sans-serif';
        ctx.fillText('海雾生成（暖湿空气遇冷水）', fx - 120, h * 0.38);
      }

      // 鱼群：扰动与温差带来营养与鱼
      const fishK = Math.min(1, turb * 0.9 + dT * 0.05);
      const nFish = Math.round(10 + fishK * 40);
      ctx.fillStyle = 'rgba(255,214,150,0.85)';
      for (let i = 0; i < nFish; i++) {
        const fx2 = fx + Math.sin(i * 2.7 + t * 2) * (20 + fishK * 30);
        const fy2 = h * (0.5 + (i * 13 % 30) / 100) + Math.cos(t * 2.3 + i * 4) * 5;
        ctx.beginPath();
        ctx.ellipse(fx2, fy2, 2.6, 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = '600 11.5px sans-serif';
      ctx.fillStyle = 'rgba(255,225,170,0.9)';
      ctx.fillText(`渔群聚集：${nFish}/50`, fx - 60, h * 0.62);

      raf = requestAnimationFrame(frame);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-[12px]" style={{ minHeight: 320, height: '52vh', border: '1px solid rgba(126,190,255,0.16)', background: 'rgba(4,14,28,0.55)' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
