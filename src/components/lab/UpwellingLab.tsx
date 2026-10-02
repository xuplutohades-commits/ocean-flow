'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import { clamp, lerp } from '@/lib/geo';

export interface UpwellParams {
  /** 沿岸风方向：offshore=离岸（上升流），onshore=向岸（下沉），calm=无风 */
  wind: 'offshore' | 'onshore' | 'calm';
  windK: number; // 0..100
  speed: number; // 动画倍速
}

/**
 * 上升流实验室：海洋剖面
 * 离岸风 → 表层海水离岸 → 海面西倾 → 深层冷水上升 → 营养盐 → 浮游 → 渔业
 */
export default function UpwellingLab({ params }: { params: UpwellParams }) {
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

    // 营养盐点子（深层永久存在，表层由上升流带来）
    const nutrients = Array.from({ length: 70 }, (_, i) => ({
      x: Math.random(), y: 0.55 + Math.random() * 0.44, vy: 0.02 + Math.random() * 0.03,
      seed: Math.random() * 100,
    }));
    const fish = Array.from({ length: 46 }, (_, i) => ({ x: Math.random(), y: Math.random(), seed: i }));

    const frame = (now: number) => {
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      const t = now / 1000;
      const p = pRef.current;
      const k = p.windK / 100;
      const isUp = p.wind === 'offshore';
      const isDown = p.wind === 'onshore';
      const active = (isUp || isDown) ? k : 0;
      const coastX = w * 0.24;
      const seaY = h * 0.62;

      ctx.clearRect(0, 0, w, h);

      // 背景
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, 'rgba(9,34,58,0.7)');
      bg.addColorStop(1, 'rgba(3,14,28,0.9)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // 海水分层（温跃层随上升/下沉弯曲）
      const thermoBend = active * (isUp ? -26 : 26); // 上升时近岸温跃层抬升
      const seaG = ctx.createLinearGradient(0, seaY, 0, h);
      seaG.addColorStop(0, `rgba(60, 140, 190, ${0.5 + active * 0.2})`);
      seaG.addColorStop(0.30, `rgba(14, 66, 110, ${0.7})`);
      seaG.addColorStop(1, `rgba(4, 24, 48, 0.95)`);
      ctx.fillStyle = seaG;
      ctx.fillRect(0, seaY, w, h - seaY);
      ctx.strokeStyle = 'rgba(150,220,255,0.7)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, seaY); ctx.lineTo(w, seaY); ctx.stroke();

      // 温跃层
      ctx.strokeStyle = 'rgba(111,227,224,0.55)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, seaY + h * 0.17);
      ctx.quadraticCurveTo(coastX / 2, seaY + h * 0.17 + thermoBend * 0.4, coastX, seaY + h * 0.17 + thermoBend);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '500 10px sans-serif';
      ctx.fillStyle = 'rgba(111,227,224,0.75)';
      ctx.fillText('温跃层（随离岸风抬升）', 6, seaY + h * 0.17 - 5);

      // 陆地
      ctx.fillStyle = 'rgba(96, 88, 74, 0.9)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(coastX, 0);
      ctx.lineTo(coastX, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,190,180,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(coastX, 0); ctx.lineTo(coastX, h); ctx.stroke();
      ctx.fillStyle = 'rgba(210,220,210,0.65)';
      ctx.fillText('陆地（秘鲁沿岸）', 8, 18);

      // 风箭头
      if (p.wind !== 'calm') {
        const dir = isUp ? -1 : 1; // 离岸：沿屏幕向上（沿岸风向南）
        for (let i = 0; i < 3; i++) {
          const x = coastX + 14 + i * 16;
          const y0 = h * 0.14 + ((t * 30 * p.speed + i * 40) % (h * 0.2)) * dir + (dir < 0 ? h * 0.2 : 0);
          if (y0 < -20 || y0 > h + 20) continue;
          const len = 24 * (0.4 + k * 0.9);
          ctx.strokeStyle = `rgba(210,240,255,${0.35 + k * 0.55})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - dir * len); ctx.stroke();
          ctx.fillStyle = `rgba(220,245,255,${0.5 + k * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(x, y0 - dir * len - 3);
          ctx.lineTo(x - 4.5, y0 - dir * (len - 9));
          ctx.lineTo(x + 4.5, y0 - dir * (len - 9));
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(200,235,255,0.85)';
        ctx.font = '600 11px sans-serif';
        ctx.fillText(isUp ? '离岸风（沿岸风向南）' : '向岸风', coastX + 26, h * 0.1 - 4);
      } else {
        ctx.fillStyle = 'rgba(150,190,220,0.6)';
        ctx.font = '500 11px sans-serif';
        ctx.fillText('无风：海水静止', coastX + 26, h * 0.12);
      }

      // 表层海水运动
      for (let i = 0; i < 5; i++) {
        const y = h * (0.33 + 0.04 * i) + Math.sin(t * 2 + i) * 2;
        const speedX = (isUp ? Math.abs(40) : isDown ? -Math.abs(34) : 0) * k * p.speed;
        const x0 = (coastX + 24 + t * speedX + i * 34) % Math.max(1, w - coastX - 20);
        if (speedX === 0) continue;
        ctx.strokeStyle = `rgba(150,210,235,${0.25 + k * 0.5})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + Math.sign(speedX) * 26, y);
        ctx.stroke();
        ctx.fillStyle = `rgba(170,220,240,${0.4 + k * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(x0 + Math.sign(speedX) * 27, y);
        ctx.lineTo(x0 + Math.sign(speedX) * 19, y - 4);
        ctx.lineTo(x0 + Math.sign(speedX) * 19, y + 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(180,220,240,0.7)';
      ctx.fillText(isUp && active > 0 ? '表层海水离岸' : '表层海水向岸推移', coastX + 30, h * 0.31);

      // 营养盐运动
      let nutrientTop = 0.95;
      for (const n of nutrients) {
        let y = n.y;
        if (isUp && active > 0 && n.x < 0.55) {
          y -= n.vy * active * 2.2 * p.speed * dt * 8;
          if (n.x < 0.3) y -= n.vy * active * 1.4 * p.speed * dt * 8;
          n.y = Math.max(0.16, y);
        } else if (isDown && n.y < 0.99) {
          n.y += n.vy * active * 1.6 * p.speed * dt * 6;
        }
        nutrientTop = Math.min(nutrientTop, n.y);
        const px = (n.x * coastX) + (n.x > 0.4 ? (n.x - 0.4) * (w - coastX) / 0.6 : 0);
        ctx.fillStyle = `rgba(130, 210, 255, ${0.3 + (1 - n.y) * 0.6})`;
        ctx.beginPath();
        ctx.arc(px, seaY + n.y * (h - seaY) + Math.sin(t * 2 + n.seed) * 1.2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(140,220,255,0.65)';
      ctx.font = '500 10px sans-serif';
      ctx.fillText('深层冷水：富营养盐', 4, h - 12);

      // 浮游生物层（营养盐到表层后爆发）
      const boom = isUp ? clamp((0.4 - nutrientTop) / 0.24, 0, 1) * k : 0;
      const bloomY = seaY + 14;
      ctx.fillStyle = `rgba(120, 235, 170, ${0.08 + boom * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(coastX + 40, bloomY, 34, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 26; i++) {
        const bx = coastX + 14 + ((i * 3.1 + t * (8 + boom * 60)) % 56);
        ctx.fillStyle = `rgba(140, 255, 190, ${0.25 + boom * 0.6})`;
        ctx.beginPath();
        ctx.arc(bx, bloomY + Math.sin(i) * 4 + Math.sin(t * 3 + i) * 2, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(150, 255, 195, ${0.3 + boom * 0.7})`;
      ctx.fillText(`浮游生物爆发 ${Math.round(boom * 100)}%`, coastX + 16, bloomY - 8);

      // 鱼群
      const fishCount = Math.round(boom * 46);
      for (let i = 0; i < fishCount; i++) {
        const f = fish[i];
        const fx = coastX + 16 + ((f.x * 90 + t * (6 + boom * 30) + f.seed) % 70);
        const fy = bloomY + Math.sin(t * 2.4 + f.seed * 3) * 6 + (f.seed % 5);
        ctx.fillStyle = 'rgba(255, 214, 150, 0.85)';
        ctx.beginPath();
        ctx.ellipse(fx, fy, 2.6, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(120, 90, 60, 0.9)';
        ctx.beginPath();
        ctx.arc(fx - 1.4, fy - 0.4, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,214,150,0.85)';
      ctx.font = '600 11px sans-serif';
      ctx.fillText(`渔获潜力 ${fishCount}/46`, coastX + 16, bloomY + 20);

      // 向岸风时表层增温（下沉）提示
      if (isDown && active > 0.2) {
        ctx.fillStyle = 'rgba(255,157,92,0.6)';
        ctx.font = '500 11px sans-serif';
        ctx.fillText('下沉流：表层暖水堆积，营养盐上不来', coastX + 16, bloomY + 40);
      }

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
