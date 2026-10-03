'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import { project, clamp } from '@/lib/geo';
import { windAt, oceanDrift, coriolisScale, globalWind } from '@/lib/wind';
import { pseudoNoise } from '@/lib/noise';
import type { Season } from '@/types';

interface FParticle {
  lng: number;
  lat: number;
  vx: number;
  vy: number;
  seed: number;
  stallT: number;
  bandT: number;   // 在辐合带(赤道±5° / 60°±6°)停留时间
  fade: number;    // 重新上涌时的淡入进度 0..1
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
  resetNonce: number;      // 每次 +1 → 重新撒粒子（重置）
}

export default function FormationCanvas({ state }: { state: FormationState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const spawnRef = useRef<(n: number) => void>(() => {});

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

    // 陆地掩膜（用于粒子沿海岸滑动 / 反弹）
    let mask: Uint8Array | null = null;
    let maskW = 0;
    let maskH = 0;
    let maskReady = false;
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
          maskReady = true;
          if (particles.length === 0) spawnRef.current(stateRef.current.count);
        });
    }

    // 撒粒子：初始速度顺着当地风的方向，粒子一出现就在流动
    function spawn(n: number) {
      if (!maskReady) return;
      const st = stateRef.current;
      const next: FParticle[] = [];
      let tries = 0;
      while (next.length < n && tries < n * 40) {
        tries++;
        const lng = Math.random() * 360 - 180;
        const lat = Math.random() * 150 - 70;
        if (inLand(lng, lat)) continue;
        const wv = windAt(lng, lat, st.season);
        const k = 0.35 + Math.random() * 0.55;
        next.push({
          lng, lat,
          vx: wv.dx * k + (Math.random() - 0.5) * 0.18,
          vy: wv.dy * k + (Math.random() - 0.5) * 0.12,
          seed: Math.random() * 100,
          stallT: 0,
          bandT: 0,
          fade: 1,
          trail: [],
        });
      }
      particles = next;
    }
    spawnRef.current = spawn;

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

    // 绘制风带 + 风向箭头 + 水流的响应方向
    function drawBelts(time: number) {
      const st = stateRef.current;
      const bands = [
        { zh: '赤道无风带', min: 3, max: 0, col: 'rgba(255,196,120,0.035)' },
        { zh: '信风带', min: 5, max: 30, col: 'rgba(110,205,255,0.055)' },
        { zh: '西风带', min: 30, max: 60, col: 'rgba(150,225,255,0.045)' },
        { zh: '极地东风带', min: 60, max: 90, col: 'rgba(94,200,255,0.04)' },
      ];
      // 1) 色带
      for (const b of bands) {
        for (const hem of [1, -1]) {
          const y0 = (90 - Math.max(b.min, b.max) * hem) * view.scaleY;
          const y1 = (90 - Math.min(b.min, b.max) * hem) * view.scaleY;
          ctx.fillStyle = b.col;
          ctx.fillRect(0, y0, w, y1 - y0);
        }
      }
      ctx.lineCap = 'round';
      const windOn = st.surfaceWind;
      // 2) 动画风箭头：方向与强度 = 作用在粒子上的风，整体沿风向滑动
      for (const hem of [1, -1]) {
        for (const b of bands) {
          if (b.min === 3) continue; // 无风带不画箭头
          const mid = ((b.min + b.max) / 2) * hem;
          const wv = globalWind(mid);
          const spd = Math.max(0.1, wv.strength);
          const len = 16 + 14 * spd;
          const screenAng = Math.atan2(-wv.dy, wv.dx); // 地理(dx,dy) → 画布角(y 向下)
          const dxs = Math.cos(screenAng);
          const dys = Math.sin(screenAng);
          const spacing = 52;
          const phase = (((time * (13 + 16 * spd) + b.min * 3 + (hem > 0 ? 0 : 30)) % spacing) + spacing) % spacing;
          for (let lng = -172; lng <= 172; lng += 46) {
            const cx = (lng + 180) * view.scaleX + dxs * phase;
            const cy = (90 - mid) * view.scaleY + dys * phase;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(screenAng);
            ctx.globalAlpha = (windOn ? 0.8 : 0.42) * (0.78 + 0.22 * Math.sin(time * 2.4 + b.min * 1.7 + hem * 2 + lng * 0.3));
            ctx.strokeStyle = 'rgba(178,228,255,1)';
            ctx.lineWidth = 1.35;
            ctx.beginPath();
            ctx.moveTo(-len / 2, 0);
            ctx.lineTo(len / 2, 0);
            ctx.stroke();
            ctx.fillStyle = 'rgba(208,240,255,1)';
            ctx.beginPath();
            ctx.moveTo(len / 2, 0);
            ctx.lineTo(len / 2 - 6.5, -3.6);
            ctx.lineTo(len / 2 - 6.5, 3.6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.globalAlpha = 1;
          }
        }
      }
      // 3) 表层水的响应方向（只有盛行风开启时才有“水流”可循）
      if (windOn) {
        const yE = (90 - 0) * view.scaleY;
        // 赤道辐合 → 表层水沿赤道向西（赤道流）
        const eqCol = 'rgba(111,227,224,0.85)';
        ctx.fillStyle = eqCol;
        ctx.strokeStyle = eqCol;
        ctx.lineWidth = 1.6;
        const spacing = 58;
        // 赤道流箭头朝西（←），整体向左滑动
        const phase = (spacing * 2 - (time * 16) % (spacing * 2)) % (spacing * 2);
        for (let x = phase; x > -spacing * 2; x -= spacing * 2) {
          ctx.beginPath();
          ctx.moveTo(x - 7, yE);
          ctx.lineTo(x + 7, yE);
          ctx.moveTo(x + 7, yE);
          ctx.lineTo(x + 1, yE - 3.4);
          ctx.moveTo(x + 7, yE);
          ctx.lineTo(x + 1, yE + 3.4);
          ctx.stroke();
        }
        ctx.font = '600 10.5px sans-serif';
        ctx.fillText('表层水 · 赤道流 → 西（辐合处不下沉不走回头路）', 8, yE + 15);
        // 极锋辐合 → 表层水沿 60° 向东（副极地环流 / 西风漂流）
        for (const hem of [1, -1]) {
          const yF = (90 - 61 * hem) * view.scaleY;
          const pfCol = 'rgba(255,173,110,0.85)';
          ctx.fillStyle = pfCol;
          ctx.strokeStyle = pfCol;
          ctx.lineWidth = 1.6;
          // 极锋流箭头朝东（→），南北半球都向右滑动
          const phaseF = (time * 13 + w) % (spacing * 2);
          for (let x = phaseF - spacing * 2; x < w + spacing; x += spacing * 2) {
            ctx.beginPath();
            ctx.moveTo(x - 7, yF);
            ctx.lineTo(x + 7, yF);
            ctx.moveTo(x + 7, yF);
            ctx.lineTo(x + 1, yF - 3.4);
            ctx.moveTo(x + 7, yF);
            ctx.lineTo(x + 1, yF + 3.4);
            ctx.stroke();
          }
          ctx.font = '600 10.5px sans-serif';
          ctx.fillText(`表层水 · ${hem > 0 ? '北' : '南'}纬 60° 极锋 → 东（副极地环流）`, 8, yF + (hem > 0 ? 14 : -5));
        }
      }
      // 4) 风带名称 + 风向说明
      ctx.font = '600 10px sans-serif';
      ctx.fillStyle = 'rgba(175,215,245,0.8)';
      ctx.fillText('信风带 · 吹向赤道并偏西', 8, (90 - 17.5) * view.scaleY);
      ctx.fillText('信风带 · 吹向赤道并偏西', 8, (90 + 17.5) * view.scaleY + 11);
      ctx.fillText('西风带 · 吹向极地并偏东', 8, (90 - 45) * view.scaleY + 11);
      ctx.fillText('西风带 · 吹向极地并偏东', 8, (90 + 45) * view.scaleY + 11);
      ctx.fillStyle = 'rgba(255,214,170,0.55)';
      ctx.fillText('赤道无风带', 8, (90 - 2.5) * view.scaleY + 10);
      // 5) 图例
      ctx.font = '500 10px sans-serif';
      ctx.fillStyle = 'rgba(150,190,225,0.6)';
      ctx.fillText('箭头 = 盛行风风向 · 圆点 = 表层海水（被风吹着流动）', 8, h - 12);
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

      // 物理：风力 + 连续性辐合转向 + 地转偏向 + 摩擦
      const windK = (st.surfaceWind ? st.windK / 100 : 0) * 1.6;
      const corK = (st.coriolis ? st.corK / 100 : 0) * 2.4;
      const fric = Math.pow(st.friction / 100, dt * 4);

      if (st.play) {
        for (const p of particles) {
          const wv = windAt(p.lng, p.lat, st.season);
          const drift = oceanDrift(p.lat); // 赤道向西 / 极锋向东
          // 两条力都随盛行风开关缩放：关掉风，水和箭头一起停
          p.vx += (wv.dx * wv.strength + drift.dx * 0.55) * windK * dt * 55;
          p.vy += wv.dy * wv.strength * windK * dt * 55;
          if (st.coriolis) {
            // 北半球向右偏、南半球向左偏，强度随纬度增强
            const dir = p.lat >= 0 ? 1 : -1;
            const cs = coriolisScale(p.lat);
            p.vx += p.vy * dir * cs * corK * dt;
            p.vy += -p.vx * dir * cs * corK * dt;
          }
          // 副热带辐合带:18–42° 间弱回流把表层水轻轻“收拢”到 ~±27°
          // (真实海洋副热带辐合区), 与风带共同维持中纬度海水的循环
          {
            const aLat = Math.abs(p.lat);
            if (aLat > 12 && aLat < 45) {
              const off = 26 - aLat; // 正=在赤道侧, 负=在极地侧
              const pull = off * 0.0045 * Math.exp(-((aLat - 26) * (aLat - 26)) / 120);
              p.vy += Math.sign(p.lat) * clamp(pull, -0.09, 0.09) * dt * 30;
            }
          }
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 2.2) { p.vx *= 2.2 / sp; p.vy *= 2.2 / sp; }
          p.vx *= fric;
          p.vy *= fric;
          const nx = p.lng + p.vx * dt * 1.35;
          const ny = p.lat + p.vy * dt * 1.35;
          if (!st.landBarrier || (!inLand(nx, ny))) {
            p.lng = nx;
            p.lat = clamp(ny, -84, 84);
          } else {
            // 沿海岸滑动：先试 x，再试 y，卡角时加一点切向扰动
            let bounced = false;
            if (st.landBarrier && !inLand(nx, p.lat)) { p.lng = nx; }
            else { p.vx *= -0.45; bounced = true; }
            if (st.landBarrier && !inLand(p.lng, ny)) { p.lat = clamp(ny, -84, 84); }
            else { p.vy *= -0.45; bounced = true; }
            if (bounced) {
              p.vx += (Math.random() - 0.5) * 0.2;
              p.vy += (Math.random() - 0.5) * 0.12;
            }
          }
          if (p.lng > 180) p.lng -= 360;
          if (p.lng < -180) p.lng += 360;
          // 停滞保护：任何粒子卡住超过 4 秒就轻轻“唤醒”，保证海水源源不断
          const spd = Math.hypot(p.vx, p.vy);
          if (spd < 0.02) p.stallT += dt;
          else p.stallT = 0;
          if (p.stallT > 4) {
            p.vx += (Math.random() - 0.5) * 0.55;
            p.vy += (Math.random() - 0.5) * 0.3;
            p.stallT = 0;
          }
          // 辐合带滞留计时：赤道±5° 与 60°±6° 是信风/西风与极地东风的辐合带
          const aLat = Math.abs(p.lat);
          const inBand = aLat < 5 || (aLat > 56 && aLat < 68);
          p.bandT = inBand ? p.bandT + dt : Math.max(0, p.bandT - dt * 0.8);
          p.fade = Math.min(1, p.fade + dt * 1.1);
        }
        // 水循环：辐合带(赤道±5° / 60°±6°)的表层水不会无限堆积——
        // 按滞留时间优先“下沉”，并在副热带辐散区(中纬度)重新“上涌”，
        // 赤道流和西风漂流保持连绵，中纬度也始终有海水在流动
        const bandPop = particles.filter((pg) => Math.abs(pg.lat) < 5 || (Math.abs(pg.lat) > 56 && Math.abs(pg.lat) < 68)).length;
        const bandTarget = Math.round(particles.length * 0.35);
        const excess = bandPop - bandTarget;
        if (excess > 5) {
          const cands = particles
            .map((pg, i) => ({ pg, i }))
            .filter(({ pg }) => pg.fade >= 1 && (Math.abs(pg.lat) < 5 || (Math.abs(pg.lat) > 56 && Math.abs(pg.lat) < 68)))
            .sort((a, b) => b.pg.bandT - a.pg.bandT);
          // 基础“上涌”速率 + 随辐合带超额加大 —— 水循环永远不停
          const rate = 5 + Math.max(0, excess) / 14;
          const toRecycle = Math.max(0, Math.min(cands.length, Math.round(rate * dt * 60)));
          for (let k = 0; k < toRecycle; k++) {
            const { pg } = cands[k];
            let tl = 0, ok = false;
            while (tl++ < 60 && !ok) {
              // 上涌点偏向副热带(18–44°)，那里正是辐散带，水从这里重返表层
              const nl = (Math.random() < 0.5 ? 1 : -1) * (18 + Math.random() * 26);
              const ng = Math.random() * 360 - 180;
              if (!inLand(ng, nl)) {
                const w2 = windAt(ng, nl, stateRef.current.season);
                const k2 = 0.1 + Math.random() * 0.3;
                pg.lng = ng; pg.lat = nl;
                pg.vx = w2.dx * k2; pg.vy = w2.dy * k2;
                pg.bandT = 0; pg.fade = 0; pg.trail = [];
                ok = true;
              }
            }
          }
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
        const alpha = (0.16 + 0.62 * t) * Math.max(0.12, Math.min(1, p.fade));
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
      spawnRef.current(stateRef.current.count);
    });
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // 粒子数变化 / 点击重置 → 重新撒粒子
  useEffect(() => {
    spawnRef.current(stateRef.current.count);
  }, [state.resetNonce, state.count]);

  return (
    <div ref={wrapRef} className="map-shell" style={{ width: '100%', height: '100%', minHeight: 420 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
