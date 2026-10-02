'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import { project, clamp } from '@/lib/geo';
import { windAt } from '@/lib/wind';
import { pseudoNoise } from '@/lib/noise';
import type { Season } from '@/types';

interface FParticle {
  lng: number;
  lat: number;
  vx: number;
  vy: number;
  seed: number;
  trail: { x: number; y: number }[];
}

export interface FormationState {
  windBelts: boolean;      // 显示风带
  surfaceWind: boolean;    // 施加风力
  coriolis: boolean;       // 地转偏向
  landBarrier: boolean;    // 海陆阻挡
  windK: number;           // 盛行风强度 0..100
  corK: number;            // 地转偏向强度 0..100
  friction: number;        // 摩擦 40..99
  count: number;           // 粒子数
  season: Season;
  play: boolean;
}

export default function FormationCanvas({ state }: { state: FormationState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;

    // 视口：固定全球视图（不做平移缩放）
    const view = {
      scaleX: 1, scaleY: 1, ox: 0, oy: 0,
      update() {
        this.scaleX = w / 360;
        this.scaleY = h / 180;
        this.ox = 0;
        this.oy = 0;
      },
    };

    // 陆地掩膜（用于粒子反弹）
    let mask: Uint8Array | null = null;
    let maskW = 0;
    let maskH = 0;
    function inLand(lng: number, lat: number): boolean {
      const m = mask;
      if (!m) return false;
      const x = Math.floor(((lng + 180) / 360) * maskW);
      const y = Math.floor(((90 - lat) / 180) * maskH);
      if (x < 0 || x >= maskW || y < 0 || y >= maskH) return false;
      return m[y * maskW + x] === 1;
    }

    // 初始化粒子
    let particles: FParticle[] = [];
    let baseBuf: HTMLCanvasElement | null = null;

    function buildMask() {
      maskW = 320;
      maskH = 160;
      mask = new Uint8Array(maskW * maskH);
      const mc = document.createElement('canvas');
      mc.width = maskW;
      mc.height = maskH;
      const mctx = mc.getContext('2d')!;
      mctx.fillStyle = '#000';
      mctx.fillRect(0, 0, maskW, maskH);
      mctx.fillStyle = '#fff';
      fetch('/data/land.json')
        .then((r) => r.json())
        .then((geo) => {
          const p2d = (lng: number, lat: number) => {
            const [x, y] = project(lng, lat);
            return [x * maskW, y * maskH] as const;
          };
          for (const f of geo.features ?? []) {
            const geom = f.geometry;
            const rings: number[][][] = [];
            if (geom.type === 'Polygon') rings.push(...geom.coordinates);
            else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates) rings.push(...p);
            for (const ring of rings) {
              mctx.beginPath();
              ring.forEach(([x, y], i) => {
                const [px, py] = p2d(x, y);
                i === 0 ? mctx.moveTo(px, py) : mctx.lineTo(px, py);
              });
              mctx.closePath();
              mctx.fill();
            }
          }
          const data = mctx.getImageData(0, 0, maskW, maskH).data;
          for (let i = 0; i < maskW * maskH; i++) (mask as Uint8Array)[i] = data[i * 4] > 128 ? 1 : 0;
        });
    }

    function spawn(n: number) {
      const next: FParticle[] = [];
      let tries = 0;
      while (next.length < n && tries < n * 30) {
        tries++;
        const lng = Math.random() * 360 - 180;
        const lat = Math.random() * 150 - 70;
        if (inLand(lng, lat)) continue;
        next.push({ lng, lat, vx: 0, vy: 0, seed: Math.random() * 100, trail: [] });
      }
      particles = next;
    }

    function resize() {
      const r = wrap.getBoundingClientRect();
      w = Math.max(50, r.width);
      h = Math.max(50, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.update();
      // 底图
      baseBuf = document.createElement('canvas');
      baseBuf.width = Math.round(w * dpr);
      baseBuf.height = Math.round(h * dpr);
      const bc = baseBuf.getContext('2d')!;
      bc.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = bc.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#041f31');
      g.addColorStop(0.5, '#032033');
      g.addColorStop(1, '#021322');
      bc.fillStyle = g;
      bc.fillRect(0, 0, w, h);
      bc.strokeStyle = 'rgba(126,190,255,0.06)';
      bc.lineWidth = 1;
      bc.beginPath();
      for (let lg = -180; lg <= 180; lg += 30) {
        const x = (lg + 180) * view.scaleX;
        bc.moveTo(x, 0); bc.lineTo(x, h);
      }
      for (let lt = -60; lt <= 90; lt += 30) {
        const y = (90 - lt) * view.scaleY;
        bc.moveTo(0, y); bc.lineTo(w, y);
      }
      bc.stroke();
      bc.strokeStyle = 'rgba(111,227,224,0.14)';
      bc.beginPath();
      const yE = (90 - 0) * view.scaleY;
      bc.moveTo(0, yE); bc.lineTo(w, yE);
      bc.stroke();
      redrawLand(bc);
    }

    let landPolys: { x: number; y: number }[][] = [];
    function redrawLand(bc: CanvasRenderingContext2D) {
      bc.fillStyle = '#081a2c';
      for (const ring of landPolys) {
        bc.beginPath();
        ring.forEach((p, i) => (i === 0 ? bc.moveTo(p.x, p.y) : bc.lineTo(p.x, p.y)));
        bc.closePath();
        bc.fill();
      }
      bc.strokeStyle = 'rgba(120,190,240,0.12)';
      bc.lineWidth = 1;
      for (const ring of landPolys) {
        bc.beginPath();
        ring.forEach((p, i) => (i === 0 ? bc.moveTo(p.x, p.y) : bc.lineTo(p.x, p.y)));
        bc.stroke();
      }
    }

    fetch('/data/land.json')
      .then((r) => r.json())
      .then((geo) => {
        landPolys = [];
        for (const f of geo.features ?? []) {
          const geom = f.geometry;
          const rings: number[][][] = [];
          if (geom.type === 'Polygon') rings.push(...geom.coordinates);
          else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates) rings.push(...p);
          for (const ring of rings) {
            if (ring.length < 3) continue;
            landPolys.push(ring.map(([x, y]) => {
              const [px, py] = project(x, y);
              return { x: px * w, y: py * h };
            }));
          }
        }
        redrawLand(baseBuf?.getContext('2d')!);
        buildMask();
      });

    // 绘制风带
    function drawBelts(time: number) {
      const belts = [
        { min: 0, max: 30, col: 'rgba(94,200,255,0.05)' },
        { min: 30, max: 60, col: 'rgba(150,225,255,0.04)' },
        { min: 60, max: 90, col: 'rgba(94,200,255,0.03)' },
      ];
      for (const b of belts) {
        for (const hem of [1, -1]) {
          const y0 = (90 - Math.max(b.min, b.max) * hem) * view.scaleY;
          const y1 = (90 - Math.min(b.min, b.max) * hem) * view.scaleY;
          ctx.fillStyle = b.col;
          ctx.fillRect(0, y0, w, y1 - y0);
        }
      }
      // 箭头
      for (const hem of [1, -1]) {
        for (const b of belts) {
          const mLat = ((b.min + b.max) / 2) * hem;
          let angle: number;
          if (mLat < 0) angle = hem > 0 ? 225 : 135;
          else angle = hem > 0 ? 45 : 315;
          const s = b.min > 55 ? 0.55 : b.min < 5 ? 1.1 : 0.85;
          for (let lng = -150; lng <= 150; lng += 60) {
            const x = (lng + 180) * view.scaleX;
            const y = (90 - mLat) * view.scaleY;
            const len = 26 * s;
            const rad = (angle * Math.PI) / 180;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rad);
            ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 2 + lng);
            ctx.strokeStyle = 'rgba(170,225,255,0.75)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(-len / 2, 0);
            ctx.lineTo(len / 2, 0);
            ctx.stroke();
            ctx.fillStyle = 'rgba(190,235,255,0.85)';
            ctx.beginPath();
            ctx.moveTo(len / 2, 0);
            ctx.lineTo(len / 2 - 6, -4);
            ctx.lineTo(len / 2 - 6, 4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.globalAlpha = 1;
          }
        }
      }
      // 纬度标注
      ctx.font = '500 10px sans-serif';
      ctx.fillStyle = 'rgba(140,180,220,0.55)';
      ctx.fillText('北纬 30°', 6, (90 - 30) * view.scaleY - 4);
      ctx.fillText('南纬 30°', 6, (90 + 30) * view.scaleY + 12);
      ctx.fillStyle = 'rgba(111,227,224,0.75)';
      ctx.font = '600 10.5px sans-serif';
      ctx.fillText('赤 道', 6, (90 - 0) * view.scaleY - 4);
    }

    let raf = 0;
    let last = performance.now();
    let time = 0;

    function frame(now: number) {
      const st = stateRef.current;
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      time += dt;

      ctx.clearRect(0, 0, w, h);
      if (baseBuf) ctx.drawImage(baseBuf, 0, 0, w, h);
      if (st.windBelts) drawBelts(time);

      // 物理
      const windK = (st.surfaceWind ? st.windK / 100 : 0) * 1.6;
      const corK = (st.coriolis ? st.corK / 100 : 0) * 2.4;
      const fric = Math.pow(st.friction / 100, dt * 4);

      if (st.play) {
        for (const p of particles) {
          const wv = windAt(p.lng, p.lat, st.season);
          p.vx += wv.dx * wv.strength * windK * dt * 55;
          p.vy += wv.dy * wv.strength * windK * dt * 55;
          if (st.coriolis) {
            // 北半球向右（顺时针），南半球向左
            const dir = p.lat >= 0 ? 1 : -1;
            const tx = -p.vy * dir;
            const ty = p.vx * dir;
            p.vx += tx * corK * dt;
            p.vy += ty * corK * dt;
          }
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 2.2) { p.vx *= 2.2 / sp; p.vy *= 2.2 / sp; }
          p.vx *= fric;
          p.vy *= fric;
          const nx = p.lng + p.vx * dt * 6;
          const ny = p.lat + p.vy * dt * 6;
          if (!st.landBarrier || (!inLand(nx, ny))) {
            p.lng = nx;
            p.lat = clamp(ny, -84, 84);
          } else {
            // 沿海岸滑动：分别尝试 x / y
            if (st.landBarrier && !inLand(nx, p.lat)) { p.lng = nx; }
            else { p.vx *= -0.45; }
            if (st.landBarrier && !inLand(p.lng, ny)) { p.lat = clamp(ny, -84, 84); }
            else { p.vy *= -0.45; }
          }
          if (p.lng > 180) p.lng -= 360;
          if (p.lng < -180) p.lng += 360;
        }
      }

      // 绘制粒子
      const maxV = 2.2;
      ctx.lineCap = 'round';
      for (const p of particles) {
        const sp = Math.hypot(p.vx, p.vy);
        const x = (p.lng + 180) * view.scaleX;
        const y = (90 - p.lat) * view.scaleY;
        const wob = pseudoNoise(time * 0.8 + p.seed, 3) * 0.9;
        p.trail.push({ x: x + wob, y: y + wob * 0.4 });
        if (p.trail.length > 4) p.trail.shift();
        const t = Math.min(sp / maxV, 1);
        // 蓝→琥珀渐变表示速度
        const r = 94 + (255 - 94) * t;
        const g = 200 - (200 - 157) * t;
        const b = 255 - (255 - 122) * t;
        const alpha = 0.16 + 0.62 * t;
        if (p.trail.length > 1) {
          ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${alpha * 0.45})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          p.trail.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.75 + t * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // 南北半球提示
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = 'rgba(180,215,245,0.75)';
      const yT = (90 - 62) * view.scaleY;
      ctx.fillText('北半球 · 偏转方向向右（顺时针）', 10, yT);
      ctx.fillText('南半球 · 偏转方向向左（逆时针）', 10, (90 + 55) * view.scaleY);

      raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(() => {
      resize();
      spawn(stateRef.current.count);
    });
    ro.observe(wrap);
    resize();
    spawn(state.count);
    raf = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // 粒子数变化
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cv = wrap.querySelector('canvas');
    void cv;
  }, []);

  return (
    <div ref={wrapRef} className="map-shell" style={{ width: '100%', height: '100%', minHeight: 420 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
