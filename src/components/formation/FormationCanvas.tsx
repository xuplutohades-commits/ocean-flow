'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import { asset } from '@/lib/asset';
import { project, clamp } from '@/lib/geo';
import { windAt, oceanDrift, coriolisScale, globalWind } from '@/lib/wind';
import { pseudoNoise } from '@/lib/noise';
import type { Season } from '@/types';

interface LandFeature {
  geometry?: { type?: string; coordinates?: unknown } | null;
}
type LandGeo = { features?: LandFeature[] };

/** 把 GeoJSON 的 Polygon / MultiPolygon 展开为可绘制的环线（度坐标） */
function landRings(geom: { type?: string; coordinates?: unknown } | null | undefined): number[][][] {
  const out: number[][][] = [];
  if (!geom) return out;
  if (geom.type === 'Polygon') out.push(...(geom.coordinates as number[][][]));
  else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates as number[][][][]) out.push(...p);
  return out;
}

interface FParticle {
  lng: number;
  lat: number;
  vx: number;
  vy: number;
  seed: number;
  stallT: number;
  bandT: number;   // 在辐合带(赤道±5° / 60°±6°)停留时间
  coastT: number;   // 连续贴岸时间（贴岸过久会被涡旋效应甩离海岸）
  sinking: boolean; // 正沿辐合带“下沉”（淡出中，随后在副热带重新上涌）
  sinkT: number;    // 下沉进度 0..0.8s
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

    function buildMask(geo: LandGeo) {
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
      const p2d = (lng: number, lat: number) => {
        const [x, y] = project(lng, lat);
        return [x * maskW, y * maskH] as const;
      };
      for (const f of geo.features ?? []) {
        for (const ring of landRings(f.geometry)) {
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
    }

    // 陆地数据加载（失败自动重试，防止离线/瞬断导致粒子永远不出现）
    function fetchLand(onOk: (geo: LandGeo) => void) {
      let tries = 0;
      const attempt = () => {
        fetch(asset('/data/land.json'))
          .then((r) => r.json())
          .then(onOk)
          .catch(() => { if (tries++ < 4) setTimeout(attempt, 2500); });
      };
      attempt();
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
          coastT: 0,
          sinking: false,
          sinkT: 0,
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
      bc.strokeStyle = 'rgba(111,227,224,0.09)';
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

    fetchLand((geo: LandGeo) => {
      landPolys = [];
      for (const f of geo.features ?? []) {
        for (const ring of landRings(f.geometry)) {
          if (ring.length < 3) continue;
          landPolys.push(ring.map(([x, y]) => {
            const [px, py] = project(x, y);
            return { x: px * w, y: py * h };
          }));
        }
      }
      redrawLand(baseBuf?.getContext('2d')!);
      buildMask(geo);
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
      // 1) 色带（上下缘羽化，不出现生硬横线）
      for (const b of bands) {
        for (const hem of [1, -1]) {
          const y0 = (90 - Math.max(b.min, b.max) * hem) * view.scaleY;
          const y1 = (90 - Math.min(b.min, b.max) * hem) * view.scaleY;
          const dh = y1 - y0;
          const g = ctx.createLinearGradient(0, y0, 0, y1);
          const edge = Math.min(8, dh * 0.15);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(edge / dh, b.col);
          g.addColorStop(1 - edge / dh, b.col);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, Math.floor(y0), w, Math.ceil(dh));
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
          // 每个箭头围绕自己的位置沿风向平滑往复摆动，相位随经度错开——
          // 不再“整排同步滑行后跳回起点”，彻底消除成条闪烁
          for (let lng = -172; lng <= 172; lng += 46) {
            const phase = Math.sin(time * 2.2 + lng * 0.35 + b.min * 1.7 + hem * 2) * 11;
            const cx = (lng + 180) * view.scaleX + dxs * phase;
            const cy = (90 - mid) * view.scaleY + dys * phase;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(screenAng);
            ctx.globalAlpha = windOn ? 0.72 : 0.4;
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
      // 3) 风带名称 + 风向说明
      ctx.font = '600 10px sans-serif';
      ctx.fillStyle = 'rgba(175,215,245,0.8)';
      ctx.fillText('信风带 · 吹向赤道并偏西', 8, (90 - 17.5) * view.scaleY);
      ctx.fillText('信风带 · 吹向赤道并偏西', 8, (90 + 17.5) * view.scaleY + 11);
      ctx.fillText('西风带 · 吹向极地并偏东', 8, (90 - 45) * view.scaleY + 11);
      ctx.fillText('西风带 · 吹向极地并偏东', 8, (90 + 45) * view.scaleY + 11);
      ctx.fillStyle = 'rgba(255,214,170,0.55)';
      ctx.fillText('赤道无风带', 8, (90 - 2.5) * view.scaleY + 10);
      // 4) 图例
      ctx.font = '500 10px sans-serif';
      ctx.fillStyle = 'rgba(150,190,225,0.6)';
      ctx.fillText('箭头 = 盛行风风向 · 圆点 = 表层海水（被风吹着流动）', 8, h - 12);
    }

    let raf = 0;
    let last = performance.now();
    let time = 0;

    function frame(now: number) {
      lastTick = performance.now();
      try {
        const st = stateRef.current;
        const dt = clamp((now - last) / 1000, 0, 0.05);
        last = now;
        time += dt;

      ctx.clearRect(0, 0, w, h);
      if (baseBuf) ctx.drawImage(baseBuf, 0, 0, w, h);
      if (st.windBelts) drawBelts(time);

      // 物理：风力 + 连续性辐合转向 + 地转偏向 + 摩擦
      const windK = (st.surfaceWind ? st.windK / 100 : 0) * 2.0;
      const corK = (st.coriolis ? st.corK / 100 : 0) * 2.4;
      const fric = Math.pow(st.friction / 100, dt * 4);

      if (st.play) {
        for (const p of particles) {
          const wv = windAt(p.lng, p.lat, st.season);
          const drift = oceanDrift(p.lat); // 赤道向西 / 极锋向东
          // 两条力都随盛行风开关缩放：关掉风，水和箭头一起停
          p.vx += (wv.dx * wv.strength + drift.dx * 0.85) * windK * dt * 55;
          p.vy += wv.dy * wv.strength * windK * dt * 55;
          if (st.coriolis) {
            // 北半球向右偏、南半球向左偏，强度随纬度增强
            const dir = p.lat >= 0 ? 1 : -1;
            const cs = coriolisScale(p.lat);
            p.vx += p.vy * dir * cs * corK * dt;
            p.vy += -p.vx * dir * cs * corK * dt;
          }
          // 副热带辐合带:18–42° 间弱回流把表层水轻轻“收拢”，中心随经度蛇形摆动
          // (真实副热带辐合区本就不成直线)，避免在屏幕上聚出一道刺眼的纬向直线
          {
            const aLat = Math.abs(p.lat);
            if (aLat > 12 && aLat < 45) {
              const c26 = 26 + 4.6 * Math.sin(p.lng * 0.45 + p.seed * 2.4);
              const off = c26 - aLat; // 正=在赤道侧, 负=在极地侧
              const pull = off * 0.0015 * Math.exp(-((aLat - 26) * (aLat - 26)) / 200);
              p.vy += Math.sign(p.lat) * clamp(pull, -0.06, 0.06) * dt * 30;
            }
          }
          // 赤道流 / 极锋流的轴线也随经度轻摆（每颗粒子相位略不同 → 形成一条 ±2° 的
          // 流动带而非笔直线）；真实赤道流与绕极流本来就有波状摆动
          {
            const aLat = Math.abs(p.lat);
            if (st.surfaceWind && (aLat < 9 || (aLat > 54 && aLat < 70))) {
              const weave = aLat < 9
                ? 2.3 * Math.sin(p.lng * 0.42 + p.seed * 2.8)
                : Math.sign(p.lat) * (61 + 2.8 * Math.sin(p.lng * 0.5 + p.seed * 2.8 + (p.lat > 0 ? 1.2 : -2.3)));
              p.vy += clamp((weave - p.lat) * 0.022, -0.045, 0.045) * dt * 30;
            }
          }
          // 开阔大洋“中尺度涡”微扰：粒子缓慢游走，避免全体直线涌向海岸
          // （随盛行风开关缩放：关掉风，水与涡一起停）
          p.vx += Math.sin(time * 0.5 + p.seed * 2.1) * 0.015 * (st.surfaceWind ? 1 : 0) * dt * 30;
          p.vy += Math.cos(time * 0.43 + p.seed * 1.7) * 0.015 * (st.surfaceWind ? 1 : 0) * dt * 30;
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 2.4) { p.vx *= 2.4 / sp; p.vy *= 2.4 / sp; }
          p.vx *= fric;
          p.vy *= fric;
          const nx = p.lng + p.vx * dt * 1.35;
          const ny = p.lat + p.vy * dt * 1.35;
          if (!st.landBarrier || (!inLand(nx, ny))) {
            p.lng = nx;
            p.lat = clamp(ny, -84, 84);
            p.coastT = Math.max(0, p.coastT - dt * 2);
          } else {
            // 撞岸分流：把来流整体投影到海岸切线方向——涌岸的分量被岸“接走”，
            // 水贴着海岸以完整速度排开；海角/海峡口沿海岸轮廓切线绕行。
            // 沿岸流滑行一段时间后被“涡旋”逐步甩离海岸，不会在岸线上越堆越厚。
            p.coastT += dt;
            const spd = Math.max(0.35, Math.hypot(p.vx, p.vy));
            let gx = 0, gy = 0;
            const cx = Math.floor(((p.lng + 180) / 360) * maskW);
            const cy0 = Math.floor(((90 - p.lat) / 180) * maskH);
            const m = mask;
            if (m) {
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const xx = cx + dx, yy = cy0 + dy;
                if (xx >= 0 && xx < maskW && yy >= 0 && yy < maskH && m[yy * maskW + xx] === 1) { gx -= dx; gy -= dy; }
              }
            }
            const gm = Math.hypot(gx, gy);
            if (gm > 0) {
              // 切线 = 与“远离陆地”垂直的方向，取与来流同侧（顺着水原来的方向绕行）
              let tx = -gy, ty = gx;
              if (tx * p.vx + ty * p.vy < 0) { tx = -tx; ty = -ty; }
              const tm = Math.hypot(tx, ty);
              p.vx = (tx / tm) * spd * 0.85;
              p.vy = (ty / tm) * spd * 0.85;
              if (st.surfaceWind && p.coastT > 2.5) {
                const peel = Math.min(0.10, (p.coastT - 2.5) * 0.012);
                p.vx += (gx / gm) * peel * dt * 30 * 2;
                p.vy += (gy / gm) * peel * dt * 30 * 2;
              }
            } else {
              p.vx *= -0.4; p.vy *= -0.4;
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
          p.fade = Math.min(1, p.fade + dt * 0.9);
          // 下沉动画：先随水流沿辐合带淡出 1.0s，再完成“下潜”，
          // 在下方副热带辐散带重新“上涌”淡入——水循环连续、没有瞬移跳变
          if (p.sinking) {
            p.sinkT += dt;
            const prog = p.sinkT / 1.0;
            if (prog >= 1) {
              let tried = 0, ok = false;
              while (tried++ < 60 && !ok) {
                // 上涌点遍布两半球副热带到中纬（16–48°），那里正是水重返表层的位置
                const nl = (Math.random() < 0.5 ? 1 : -1) * (14 + Math.random() * 34);
                const ng = Math.random() * 360 - 180;
                if (!inLand(ng, nl)) {
                  const w2 = windAt(ng, nl, stateRef.current.season);
                  const k2 = 0.5 + Math.random() * 0.4; // 一上涌就顺着当地风向走，不让“新水”在原地打转
                  p.lng = ng; p.lat = nl;
                  p.vx = w2.dx * k2; p.vy = w2.dy * k2;
                  p.bandT = 0; p.sinkT = 0; p.coastT = 0; p.sinking = false;
                  p.fade = 0; p.trail = [];
                  ok = true;
                }
              }
            } else {
              p.fade = Math.max(0, 1 - prog);
            }
          }
        }
        // 水循环：辐合带(赤道±5° / 60°±6°)的表层水不会无限堆积——
        // 按滞留时长排队“下沉”（见上方 sinking 分支），在副热带辐散区重新“上涌”。
        // 带内人口保持在一个较稀的平衡值，辐合线是一条流动的窄带，而不是一堵墙
        {
          // 沿岸回收：沿海岸滑行过久的水不无限堆积在岸线上——
          // 视作沿岸下降流/被涡旋卷回外海，淡出后在开阔大洋重新上涌
          const coastCands = particles
            .map((pg, i) => ({ pg, i }))
            .filter(({ pg }) => pg.fade >= 1 && !pg.sinking && pg.coastT > 5)
            .sort((a, b) => b.pg.coastT - a.pg.coastT);
          const coastSink = Math.max(0, Math.min(coastCands.length, Math.round(3.0 * dt * 60)));
          for (let k = 0; k < coastSink; k++) coastCands[k].pg.sinking = true;
        }
        const inConv = (la: number) => Math.abs(la) < 5 || (Math.abs(la) > 56 && Math.abs(la) < 68);
        const bandPop = particles.filter((pg) => inConv(pg.lat)).length;
        const bandTarget = Math.round(particles.length * 0.22);
        const excess = bandPop - bandTarget;
        if (excess > 5) {
          const cands = particles
            .map((pg, i) => ({ pg, i }))
            .filter(({ pg }) => pg.fade >= 1 && !pg.sinking && pg.bandT > 1.0 && inConv(pg.lat))
            .sort((a, b) => b.pg.bandT - a.pg.bandT);
          // 温和下沉速率：辐合带越挤沉得越快；每秒 3–10 个，沿整条带连续发生
          const rate = 3.5 + Math.max(0, excess) / 18;
          const toSink = Math.max(0, Math.min(cands.length, Math.round(rate * dt * 60)));
          for (let k = 0; k < toSink; k++) cands[k].pg.sinking = true;
        }
      }

      // 绘制粒子
      const maxV = 2.4;
      ctx.lineCap = 'round';
      for (const p of particles) {
        const sp = Math.hypot(p.vx, p.vy);
        const x = (p.lng + 180) * view.scaleX;
        const y = (90 - p.lat) * view.scaleY;
        const wob = pseudoNoise(time * 0.8 + p.seed, 3) * 0.9;
        const pt = { x: x + wob, y: y + wob * 0.4 };
        // 跨日期变更线时 x 从画布一端跳到另一端——此时断开拖尾，
        // 避免拖尾连线画出“贯穿全屏、闪一两帧就消失”的横线
        const lastPt = p.trail[p.trail.length - 1];
        if (lastPt && Math.abs(pt.x - lastPt.x) > w * 0.45) p.trail.length = 0;
        p.trail.push(pt);
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
        ctx.arc(x, y, 0.7 + t * 0.95, 0, Math.PI * 2);
        ctx.fill();
      }

      // 南北半球提示
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = 'rgba(180,215,245,0.75)';
      const yT = (90 - 62) * view.scaleY;
      ctx.fillText('北半球 · 偏转方向向右（顺时针）', 10, yT);
      ctx.fillText('南半球 · 偏转方向向左（逆时针）', 10, (90 + 55) * view.scaleY);

      } catch {
        // 单帧异常只跳过本帧，绝不能杀死动画循环——
        // 否则画面会永久停在只剩底图的那一帧，“粒子全没了”。
        try {
          const win = window as unknown as { __pfErrCount?: number };
          win.__pfErrCount = (win.__pfErrCount || 0) + 1;
        } catch { /* 记录失败也无所谓，继续跑 */ }
      }
      // raf 调度放在 try/catch 之外：任何异常都无法阻断下一帧
      raf = requestAnimationFrame(frame);
    }

    // 自愈看门狗：rAF 一旦卡死（显示休眠唤醒、后台标签页恢复、异常漏网等），
    // 立即重启循环；粒子被清空则重新撒种，保证“海水源源不断”
    let lastTick = 0;
    function startLoop() {
      cancelAnimationFrame(raf);
      lastTick = performance.now();
      raf = requestAnimationFrame(frame);
    }
    const revive = () => {
      if (!document.hidden && maskReady && performance.now() - lastTick > 1500) startLoop();
      if (maskReady && particles.length === 0) spawnRef.current(stateRef.current.count);
    };
    const watchdog = window.setInterval(() => { if (!document.hidden) revive(); }, 2000);
    const onShow = () => { if (!document.hidden) revive(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    window.addEventListener('pageshow', onShow);

    const ro = new ResizeObserver(() => {
      resize();
      spawnRef.current(stateRef.current.count);
    });
    ro.observe(wrap);
    resize();
    startLoop();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
      window.removeEventListener('pageshow', onShow);
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
