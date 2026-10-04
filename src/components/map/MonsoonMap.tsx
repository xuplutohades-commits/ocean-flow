'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { asset } from '@/lib/asset';
import { useEffect, useRef } from 'react';
import { clamp, lerp } from '@/lib/geo';
import { pseudoNoise } from '@/lib/noise';
import type { Season } from '@/types';

/* ═══════════════════════════════════════════════════════════════
   动态因果演示图：季风改变北印度洋
   四层独立视觉：
   L1 地图（安静背景）
   L2 风   （少量淡白青箭头，缓慢流动，告诉风向）
   L3 海水 （蓝色小粒子，沿 vector field；索马里沿岸自然形成水带）
   L4 沿岸上升流（局部向上冷色流场）
   首次进入播放 风→水→洋流→上升流 的分阶段教学动画
   ═══════════════════════════════════════════════════════════════ */

/* ── 视图：锁定北印度洋 ── */
const LNG0 = 27;
const LNG1 = 106;
const LAT0 = -19;
const LAT1 = 43;
type Pt = [number, number];

const TAG_WIND   = { lng: 66, lat: 20, summer: '西南季风', winter: '东北季风' };
const TAG_SOMALI = { lng: 49.4, lat: 5.4, text: '索马里洋流' };
const TAG_UPWELL = { lng: 50.6, lat: 7.8, summer: '沿岸上升流', winter: '上升流停止' };

/* ── 索马里海岸线（洋流带的位置依据） ──
   这条多段线按 land.json 实际渲染的海岸对齐（0.5° 纬度采样），
   并整体向海侧（东）偏移约 0.4°，确保洋流带/上升流粒子始终在海上。 */
const SOMALI_COAST: Pt[] = [
  [40.6, -3], [41.9, -1.2], [43.7, 0.8], [45.9, 2.5], [47.9, 4.2],
  [49.3, 6], [50.4, 7.9], [51.2, 9.6], [51.6, 11],
];
const SOMALI_SUMMER: Pt[] = SOMALI_COAST;
const SOMALI_WINTER: Pt[] = [...SOMALI_COAST].reverse();

/* ── 风箭头锚点：稀疏、分布在北印度洋海面 ── */
const WIND_ANCHORS: Pt[] = [
  [49, 7], [56, 11], [62, 9], [68, 14], [74, 12], [80, 15], [88, 9], [94, 13],
];

/* ───────────────────────── 矢量场 ───────────────────────── */

/** 北印度洋核心权重（密度随距离衰减） */
function coreWeight(lng: number, lat: number): number {
  const arab = Math.exp(-(((lng - 64) / 14) ** 2)) * Math.exp(-(((lat - 13) / 10) ** 2));
  const bengal = Math.exp(-(((lng - 88) / 12) ** 2)) * Math.exp(-(((lat - 13) / 10) ** 2));
  const west = Math.exp(-(((lng - 75) / 17) ** 2)) * Math.exp(-(((lat - 9) / 12) ** 2));
  return Math.min(1, arab * 1.4 + bengal * 1.3 + west * 1.0);
}

/** 季风方向（弧度）：夏 63°=西南→东北，冬 243°=东北→西南，随 t 平滑 */
function windDirAt(lng: number, lat: number, t: number): number | null {
  if (lng < 34 || lng > 102 || lat < -10 || lat > 32) return null;
  const aDeg = lerp(63, 243, t);
  const rad = (aDeg * Math.PI) / 180;
  const bend = Math.sin((lng - 40) * 0.045 + (lat - 10) * 0.07) * 0.5 + Math.sin(lng * 0.09) * 0.35;
  let out = rad + bend * 0.3;
  out = ((out + Math.PI) % (Math.PI * 2)) - Math.PI;
  return out;
}

function distToPolyline(lng: number, lat: number, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby || 1e-9;
    const t = clamp(((lng - ax) * abx + (lat - ay) * aby) / len2, 0, 1);
    const px = ax + abx * t;
    const py = ay + aby * t;
    const d = Math.hypot(lng - px, lat - py);
    if (d < best) best = d;
  }
  return best;
}

/** 索马里沿岸带：距离海岸线的短程权重，中心亮边缘暗 */
function somaliBandAt(lng: number, lat: number, t: number): number {
  const m = SOMALI_SUMMER.map((p, i) => [lerp(p[0], SOMALI_WINTER[i][0], t), lerp(p[1], SOMALI_WINTER[i][1], t)] as Pt);
  const d = distToPolyline(lng, lat, m);
  if (d > 1.5) return 0;
  return Math.exp(-(d * d) / (0.55 * 0.55));
}

/** 上升流中心线经度：随纬度沿海岸向东北（中心线在海岸以东约 0.3°，海上） */
function upwellCenterLng(lat: number): number {
  const along = clamp((lat - 3.2) / 7.3, 0, 1);
  return 47.1 + along * 4.1;
}

/** 沿岸上升流权重：夏季强、冬季弱 */
function upwellWeightAt(lng: number, lat: number, t: number): number {
  const along = clamp((lat - 3.2) / 7.3, 0, 1);
  const lateral = Math.exp(-(((lng - upwellCenterLng(lat)) / 1.35) ** 2));
  const vertical = Math.sin(along * Math.PI);
  return lateral * vertical * Math.pow(1 - t, 1.4);
}

/* ───────────────────────── 粒子与箭头状态 ───────────────────────── */

interface P {
  lng: number;
  lat: number;
  age: number;
  life: number;
  seed: number;
  kind: 'water' | 'band' | 'upwell';
  speed: number;
}

interface Arrow {
  lng: number;
  lat: number;
  phase: number;   // 前进阶段 0..1（沿风向缓慢移动后重生）
  speed: number;   // 移动速度（度/秒）
}

interface EngineProps {
  season: Season;
  canvas: HTMLCanvasElement;
  windScale?: number;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

class MonsoonEngine {
  w = 800;
  h = 500;
  dpr = 1;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  base: HTMLCanvasElement;
  season: Season;
  t = 0;              // 季节插值 0=夏 1=冬
  phase = 0;          // 首次进入的教学时间轴 0→1（约 4 秒）
  hasStepped = false; // 已经播放过教学动画后，phase 保持 1
  land: { x: number; y: number }[][] = [];
  landReady = false;
  mask: Uint8ClampedArray | null = null;
  maskCols = 0;
  maskRows = 0;
  maskReady = false;
  ps: P[] = [];
  arrows: Arrow[] = [];
  raf = 0;
  last = 0;
  time = 0;
  disposed = false;
  windScale = 1;

  constructor(canvas: HTMLCanvasElement, opts: EngineProps) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.season = opts.season;
    this.windScale = opts.windScale ?? 1;
    this.t = this.season === 'winter' ? 1 : 0;
    loadLand().then((polys) => {
      if (this.disposed) return;
      this.land = polys;
      this.landReady = true;
      this.buildMask();
      this.drawBase();
      this.initArrows();
      this.initParticles();
    });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.base.width = Math.round(w * this.dpr);
    this.base.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const b = this.base.getContext('2d')!;
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.landReady) { this.buildMask(); this.drawBase(); }
  }

  proj(lng: number, lat: number): Pt {
    return [((lng - LNG0) / (LNG1 - LNG0)) * this.w, ((LAT1 - lat) / (LAT1 - LAT0)) * this.h];
  }

  /* ── 海洋遮罩 ── */
  buildMask() {
    const mc = document.createElement('canvas');
    const mw = Math.max(2, Math.round(this.w / 4));
    const mh = Math.max(2, Math.round(this.h / 4));
    mc.width = mw;
    mc.height = mh;
    const mb = mc.getContext('2d')!;
    mb.clearRect(0, 0, mw, mh);
    mb.fillStyle = '#fff';
    for (const poly of this.land) {
      mb.beginPath();
      let started = false;
      for (const pt of poly) {
        const lng = pt.x * 360 - 180;
        const lat = 90 - pt.y * 180;
        const [x, y] = [(lng - LNG0) / (LNG1 - LNG0) * mw, (LAT1 - lat) / (LAT1 - LAT0) * mh];
        if (!started) { mb.moveTo(x, y); started = true; } else mb.lineTo(x, y);
      }
      mb.closePath();
      mb.fill();
    }
    const img = mb.getImageData(0, 0, mw, mh);
    this.mask = img.data;
    this.maskCols = mw;
    this.maskRows = mh;
    this.maskReady = true;
  }

  isSea(lng: number, lat: number): boolean {
    if (!this.maskReady || !this.mask) return true;
    const [x, y] = this.proj(lng, lat);
    const cx = Math.max(0, Math.min(this.maskCols - 1, Math.round(x / 4)));
    const cy = Math.max(0, Math.min(this.maskRows - 1, Math.round(y / 4)));
    return this.mask[(cy * this.maskCols + cx) * 4 + 3] < 128;
  }

  /* ── 底图：安静、低对比 ── */
  drawBase() {
    const b = this.base.getContext('2d')!;
    const { w, h } = this;
    b.clearRect(0, 0, w, h);
    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#071828');
    g.addColorStop(0.42, '#082B47');
    g.addColorStop(0.75, '#093F5C');
    g.addColorStop(1, '#0B4E6A');
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);
    const [cx, cy] = this.proj(66, 10);
    const rg = b.createRadialGradient(cx, cy, 0, cx, cy, 0.6 * Math.min(w, h));
    rg.addColorStop(0, 'rgba(110,190,230,0.07)');
    rg.addColorStop(0.6, 'rgba(80,160,210,0.04)');
    rg.addColorStop(1, 'rgba(20,60,100,0)');
    b.fillStyle = rg;
    b.fillRect(0, 0, w, h);
    b.strokeStyle = 'rgba(140,190,220,0.06)';
    b.lineWidth = 1;
    b.beginPath();
    for (let lg = 30; lg <= 100; lg += 10) {
      const [x] = this.proj(lg, 0);
      b.moveTo(x, 0);
      b.lineTo(x, h);
    }
    for (let lt = -20; lt <= 40; lt += 10) {
      const [, y] = this.proj(0, lt);
      b.moveTo(0, y);
      b.lineTo(w, y);
    }
    b.stroke();
    const [, yEq] = this.proj(0, 0);
    b.strokeStyle = 'rgba(120,185,220,0.12)';
    b.beginPath();
    b.moveTo(0, yEq);
    b.lineTo(w, yEq);
    b.stroke();
    if (this.landReady) {
      b.fillStyle = '#25373F';
      for (const poly of this.land) {
        b.beginPath();
        let started = false;
        for (const pt of poly) {
          const lng = pt.x * 360 - 180;
          const lat = 90 - pt.y * 180;
          const [x, y] = this.proj(lng, lat);
          if (!started) { b.moveTo(x, y); started = true; } else b.lineTo(x, y);
        }
        b.closePath();
        b.fill();
      }
      b.strokeStyle = 'rgba(70,95,105,0.6)';
      b.lineWidth = 1;
      for (const poly of this.land) {
        b.beginPath();
        let started = false;
        for (const pt of poly) {
          const lng = pt.x * 360 - 180;
          const lat = 90 - pt.y * 180;
          const [x, y] = this.proj(lng, lat);
          if (!started) { b.moveTo(x, y); started = true; } else b.lineTo(x, y);
        }
        b.stroke();
      }
    }
  }

  redrawBase() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.base, 0, 0, w, h);
  }

  /* ── 初始化：箭头 + 粒子 ── */
  initArrows() {
    this.arrows = WIND_ANCHORS
      .filter(([lng, lat]) => this.isSea(lng, lat))
      .map(([lng, lat], i) => ({
        lng,
        lat,
        phase: (i % 4) * 0.25,
        speed: 0.9 + Math.random() * 0.7,
      }));
  }

  initParticles() {
    this.ps = [];
    // 普通海水粒子：低密度背景（核心区稍密）
    const waterN = Math.round((this.w * this.h) / 1500);
    // 索马里洋流带粒子：带内独立粒子，自然形成水带
    const bandN = Math.max(90, Math.round((this.w * this.h) / 2400));
    // 上升流：局部少量
    const upwellN = Math.max(36, Math.round((this.w * this.h) / 3600));
    for (let i = 0; i < waterN; i++) this.ps.push(this.spawn('water'));
    for (let i = 0; i < bandN; i++) this.ps.push(this.spawn('band'));
    for (let i = 0; i < upwellN; i++) this.ps.push(this.spawn('upwell'));
  }

  spawn(kind: P['kind']): P {
    if (kind === 'water') {
      for (let tries = 0; tries < 40; tries++) {
        const lng = 38 + Math.random() * 62;
        const lat = -6 + Math.random() * 32;
        const w = coreWeight(lng, lat);
        if (w < 0.06) continue;
        if (Math.random() > w * 0.85) continue;
        if (!this.isSea(lng, lat)) continue;
        return { lng, lat, age: Math.random() * 5, life: 9 + Math.random() * 9, seed: Math.random() * 100, kind, speed: 0.5 + Math.random() * 0.7 };
      }
      return { lng: 66, lat: 10, age: 0, life: 10, seed: Math.random() * 100, kind, speed: 0.6 };
    }
    if (kind === 'band') {
      // 索马里沿岸带：沿季节路径附近随机出生，速度稍快、更容易形成水带
      const m = SOMALI_SUMMER.map((p, i) => [lerp(p[0], SOMALI_WINTER[i][0], this.t), lerp(p[1], SOMALI_WINTER[i][1], this.t)] as Pt);
      for (let tries = 0; tries < 40; tries++) {
        const idx = Math.floor(Math.random() * (m.length - 1));
        const f = Math.random();
        const lng = m[idx][0] + (m[idx + 1][0] - m[idx][0]) * f + (Math.random() - 0.5) * 0.9;
        const lat = m[idx][1] + (m[idx + 1][1] - m[idx][1]) * f + (Math.random() - 0.5) * 0.9;
        if (!this.isSea(lng, lat)) continue;
        return { lng, lat, age: Math.random() * 4, life: 6 + Math.random() * 6, seed: Math.random() * 100, kind, speed: 0.75 + Math.random() * 0.9 };
      }
      return { lng: 48.9, lat: 5.5, age: 0, life: 7, seed: Math.random() * 100, kind, speed: 0.8 };
    }
    for (let tries = 0; tries < 30; tries++) {
      const lat = 3.2 + Math.random() * 7.3;
      const lng = upwellCenterLng(lat) + (Math.random() - 0.5) * 2.4;
      if (upwellWeightAt(lng, lat, 0) < 0.12) continue;
      if (!this.isSea(lng, lat)) continue;
      return { lng, lat, age: Math.random() * 4, life: 7 + Math.random() * 7, seed: Math.random() * 100, kind, speed: 0.5 + Math.random() * 0.8 };
    }
    return { lng: 50.6, lat: 8.5, age: 0, life: 8, seed: Math.random() * 100, kind, speed: 0.6 };
  }

  /* ── 主循环：四层按序绘制 ── */
  tick(now: number) {
    if (this.disposed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.08);
    this.last = now;
    this.time += dt;

    // 季节插值：连续切换（1.5~2.5s）
    const target = this.season === 'winter' ? 1 : 0;
    this.t += (target - this.t) * (1 - Math.exp(-dt * 2.2));

    // 首次进入（夏季）的教学时间轴：风→水→洋流→上升流，约 4 秒
    if (this.season === 'summer' && !this.hasStepped) {
      this.phase = Math.min(1, this.phase + dt / 4.0);
      if (this.phase >= 1) this.hasStepped = true;
    } else if (this.season === 'summer') {
      this.phase = 1;
    }

    const { ctx, w, h } = this;
    this.redrawBase();

    // L1 底图（已画）→ L4 上升流（最底层但只影响沿岸局部）
    this.drawUpwellZone(ctx, w, h, dt);

    // L3 海水粒子
    this.advect(ctx, w, h, dt);

    // L2 风箭头（最上层）
    this.drawWindArrows(ctx, w, h, dt);

    // 标签
    this.drawLabels();

    this.raf = requestAnimationFrame((n) => this.tick(n));
  }

  /* ── L4 沿岸上升流：局部向上冷色流场 ── */
  drawUpwellZone(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    // 教学时间轴：上升流在最后阶段（phase > 0.72）才逐渐出现
    const teachK = this.season === 'summer' ? smoothstep(0.72, 1.0, this.phase) : 1;
    const k = Math.pow(1 - this.t, 1.5) * teachK;
    if (k < 0.02) return;
    // 海面冷色带（沿岸局部，随中心线移动）
    const gy1 = this.proj(upwellCenterLng(3.4), 3.4)[1];
    const gy0 = this.proj(upwellCenterLng(10.2), 10.2)[1];
    const cx = this.proj(upwellCenterLng(7), 7)[0];
    const cy = this.proj(upwellCenterLng(7), 7)[1];
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.abs(gy1 - gy0) * 0.62);
    rg.addColorStop(0, `rgba(70, 165, 230, ${0.16 * k})`);
    rg.addColorStop(0.5, `rgba(45, 135, 210, ${0.10 * k})`);
    rg.addColorStop(1, 'rgba(20,90,160,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(cx - Math.abs(gy1 - gy0), cy - Math.abs(gy1 - gy0), Math.abs(gy1 - gy0) * 2, Math.abs(gy1 - gy0) * 2);
  }

  /* ── L3 海水粒子：稀疏背景 + 索马里沿岸自然形成水带 ── */
  advect(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const t = this.t;
    // 教学时间轴权重：1-2s 海水开始响应，2-3s 沿岸水带形成
    const waterK = this.season === 'summer' ? smoothstep(0.25, 0.5, this.phase) : 1;
    const somaliK = this.season === 'summer' ? smoothstep(0.5, 0.75, this.phase) : 1;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      let vx = 0, vy = 0, weight = 1;
      // 索马里形变带：粒子更密、更快、方向更一致 → 自然形成洋流
      const band = somaliBandAt(p.lng, p.lat, t);

      if (p.kind === 'upwell') {
        const uw = upwellWeightAt(p.lng, p.lat, t);
        const teachUp = this.season === 'summer' ? smoothstep(0.72, 1.0, this.phase) : 1;
        if (uw * teachUp < 0.03) { this.ps[i] = this.spawn('upwell'); continue; }
        weight = uw * teachUp;
        const jitter = pseudoNoise(p.seed, p.lng * 0.3) * 0.5;
        vx = 0.05 + jitter * 0.08;
        vy = 0.98 + pseudoNoise(p.seed * 1.7, p.lat) * 0.25;
        const vl = Math.hypot(vx, vy) || 1;
        vx /= vl; vy /= vl;
      } else if (p.kind === 'band') {
        // 索马里洋流带：方向一致（夏东北/冬西南）、更快更亮
        const aDeg = lerp(58, 238, t) + pseudoNoise(p.lng * 0.5, p.lat * 0.5) * 0.25;
        vx = Math.cos(aDeg * Math.PI / 180);
        vy = Math.sin(aDeg * Math.PI / 180);
        weight = 1.3;
      } else {
        // 海水粒子方向：一般海域跟随季风，索马里带内方向更纯净（形成洋流）
        if (band > 0.12) {
          // 沿岸水流方向：夏东北 / 冬西南，与世界季风一致但稍微更贴岸
          const aDeg = lerp(58, 238, t) + pseudoNoise(p.lng * 0.5, p.lat * 0.5) * 0.25;
          vx = Math.cos(aDeg * Math.PI / 180);
          vy = Math.sin(aDeg * Math.PI / 180);
          weight = 1 + band;
        } else {
          const a = windDirAt(p.lng, p.lat, t);
          if (a === null) { this.ps[i] = this.spawn('water'); continue; }
          vx = Math.cos(a);
          vy = Math.sin(a);
          const cw = coreWeight(p.lng, p.lat);
          if (cw < 0.04) { this.ps[i] = this.spawn('water'); continue; }
          weight = cw;
        }
      }

      // 运动：索马里洋流更快；教学时间轴内粒子逐渐开始流动
      const teachWater = p.kind === 'water' ? waterK : 1;
      const teachBand = p.kind === 'band' ? (this.season === 'summer' ? smoothstep(0.5, 0.75, this.phase) : 1) : 1;
      let spd = p.speed * (p.kind === 'band' ? 1.7 * (0.35 + 0.65 * teachBand) : band > 0.12 ? 1.6 + 0.5 * band : 1) * (0.3 + 0.7 * teachWater) * (0.75 + 0.4 * this.windScale);
      p.lng += vx * spd * dt;
      p.lat += vy * spd * dt * (p.kind === 'upwell' ? 1.3 : 1);

      p.age += dt;
      if (p.age > p.life) { this.ps[i] = this.spawn(p.kind); continue; }
      if (p.lng < LNG0 || p.lng > LNG1 || p.lat < LAT0 || p.lat > LAT1) { this.ps[i] = this.spawn(p.kind); continue; }
      if (!this.isSea(p.lng, p.lat)) { this.ps[i] = this.spawn(p.kind); continue; }

      const fadeIn = clamp(p.age / 1.6, 0, 1);
      const fadeOut = clamp((p.life - p.age) / 2.6, 0, 1);
      const fade = fadeIn * fadeOut;

      const [x, y] = this.proj(p.lng, p.lat);
      if (x < -40 || x > w + 40 || y < -40 || y > h + 40) { this.ps[i] = this.spawn(p.kind); continue; }

      const ux = vx, uy = vy;
      const trav = 1.0 + (p.seed % 19) / 8;
      const len = trav * (band > 0.12 ? 7.0 : p.kind === 'upwell' ? 5.5 : 4.6);
      const tx = x - ux * len * 0.5;
      const ty = y - uy * len * 0.5;

      if (p.kind === 'band') {
        // 索马里洋流带：青蓝、较亮、方向一致 → 自然水带
        const b1 = 235 + Math.round(20 * ((p.seed % 5) / 5));
        const en = teachBand;
        ctx.strokeStyle = `rgba(${60 + Math.round(50 * ((p.seed % 7) / 7))}, ${190 + Math.round(45 * ((p.seed % 5) / 5))}, ${b1}, 1)`;
        ctx.lineWidth = 1.4 + 0.5 * ((p.seed % 4) / 4);
        ctx.globalAlpha = fade * (0.28 + 0.2 * ((p.seed % 5) / 5)) * (0.4 + 0.6 * en);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = fade * 0.18 * en;
        ctx.fillStyle = 'rgba(185, 235, 255, 1)';
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'water') {
        if (band > 0.12) {
          // 索马里沿岸：青蓝、更明显（水带）
          const b1 = 220 + Math.round(35 * clamp(band, 0, 1));
          ctx.strokeStyle = `rgba(${70 + Math.round(60 * band)}, ${190 + Math.round(45 * band)}, ${b1}, 1)`;
          ctx.lineWidth = 1.2 + 0.7 * band;
          ctx.globalAlpha = fade * (0.20 + 0.25 * band) * (0.35 + 0.65 * somaliK);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.globalAlpha = fade * (0.12 + 0.14 * band) * somaliK;
          ctx.fillStyle = 'rgba(175, 230, 255, 1)';
          ctx.beginPath();
          ctx.arc(x, y, 1.0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 普通海水：蓝色、细、淡
          const b2 = 190 + Math.round(35 * weight);
          ctx.strokeStyle = `rgba(115, 170, ${b2}, 1)`;
          ctx.lineWidth = 0.9;
          ctx.globalAlpha = fade * (0.12 + 0.10 * weight) * (0.3 + 0.7 * waterK);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      } else {
        // 上升流：深蓝→青蓝，向上
        const g0 = Math.round(34 + 42 * fade);
        ctx.strokeStyle = `rgba(${g0}, ${128 + 62 * fade}, 235, 1)`;
        ctx.lineWidth = 1.0 + 0.4 * fade;
        ctx.globalAlpha = fade * (0.14 + 0.16 * weight);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = fade * (0.12 + 0.14 * weight);
        ctx.fillStyle = 'rgba(165, 226, 255, 1)';
        ctx.beginPath();
        ctx.arc(x, y, 1.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ── L2 风：少量淡白青箭头，缓慢前进后淡出重生 ── */
  drawWindArrows(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const t = this.t;
    // 教学时间轴：风最先出现（0-1s）
    const windK = this.season === 'summer' ? smoothstep(0.0, 0.28, this.phase) : 1;
    if (windK <= 0.01) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const ar of this.arrows) {
      const a = windDirAt(ar.lng, ar.lat, t);
      if (a === null) continue;
      // 沿风向缓慢前进 → 淡出 → 重生（风在流动）
      ar.phase += ar.speed * dt / 5;
      if (ar.phase > 1) {
        ar.phase = 0;
        ar.lng = WIND_ANCHORS[this.arrows.indexOf(ar) % WIND_ANCHORS.length][0] + (Math.random() - 0.5) * 2.5;
        ar.lat = WIND_ANCHORS[this.arrows.indexOf(ar) % WIND_ANCHORS.length][1] + (Math.random() - 0.5) * 2.5;
      }
      const travel = 2.6; // 前进距离（度）
      const [x0, y0] = this.proj(ar.lng, ar.lat);
      const hx = Math.cos(a), hy = Math.sin(a);
      const xb = x0 + hx * travel / 90 * this.w;
      const yb = y0 + hy * travel / 90 * this.w;
      // 前进 + 淡入淡出
      const prog = ar.phase;
      const x = x0 + (xb - x0) * prog;
      const y = y0 + (yb - y0) * prog;
      if (x < -60 || x > w + 60 || y < -60 || y > h + 60) continue;
      const len = 20 * (0.8 + 0.4 * this.windScale);
      const alpha = windK * Math.sin(prog * Math.PI) * 0.55 * (0.8 + 0.2 * this.windScale);
      if (alpha < 0.02) continue;
      const x1 = x + hx * len;
      const y1 = y + hy * len;
      ctx.strokeStyle = 'rgba(216, 240, 255, 1)';
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // 小箭头头部
      const ah = 5.0;
      const px = -hy, py = hx;
      const bx = x1 - hx * ah * 0.7;
      const by = y1 - hy * ah * 0.7;
      ctx.globalAlpha = alpha * 1.1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(bx + px * 2.2, by + py * 2.2);
      ctx.lineTo(bx - px * 2.2, by - py * 2.2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(225, 245, 255, 1)';
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawLabels() {
    const { ctx } = this;
    const winter = this.t > 0.5;
    const labels = [
      { ...TAG_WIND, text: winter ? TAG_WIND.winter : TAG_WIND.summer },
      { ...TAG_SOMALI, text: TAG_SOMALI.text },
      { ...TAG_UPWELL, text: winter ? '上升流停止' : '沿岸上升流' },
    ];
    for (const lb of labels) {
      const [x, y] = this.proj(lb.lng, lb.lat);
      ctx.font = '600 12px "PingFang SC", sans-serif';
      const tw = ctx.measureText(lb.text).width;
      const twB = tw + 18;
      const hB = 24;
      ctx.fillStyle = 'rgba(4, 16, 30, 0.62)';
      ctx.beginPath();
      ctx.roundRect(x - twB / 2, y - hB / 2, twB, hB, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(126, 190, 255, 0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = lb.text === '沿岸上升流' ? 'rgba(150, 226, 255, 0.95)' : 'rgba(219, 240, 255, 0.95)';
      ctx.fillText(lb.text, x - tw / 2, y + 4);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
  }
}

let landPromise: Promise<{ x: number; y: number }[][]> | null = null;
function loadLand(): Promise<{ x: number; y: number }[][]> {
  if (!landPromise) {
    landPromise = fetch(asset('/data/land.json'))
      .then((r) => r.json())
      .then((geo) => {
        const polys: { x: number; y: number }[][] = [];
        const collect = (rings: number[][][]) => {
          for (const ring of rings) {
            if (ring.length < 3) continue;
            polys.push(ring.map(([x, y]) => ({ x: (x + 180) / 360, y: (90 - y) / 180 })));
          }
        };
        for (const f of geo.features ?? []) {
          const geom = f.geometry;
          if (!geom) continue;
          if (geom.type === 'Polygon') collect(geom.coordinates);
          else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates) collect(p);
        }
        return polys;
      });
  }
  return landPromise;
}

export interface MonsoonMapProps {
  season: Season;
  windScale?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function MonsoonMap({ season, windScale = 1, className, style }: MonsoonMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MonsoonEngine | null>(null);
  const seasonRef = useRef(season);
  const scaleRef = useRef(windScale);
  seasonRef.current = season;
  scaleRef.current = windScale;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new MonsoonEngine(canvas, { season, canvas, windScale });
    engineRef.current = engine;
    engine.raf = requestAnimationFrame((n) => { engine.last = n; engine.tick(n); });
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      if (r.width > 10 && r.height > 10 && (Math.abs(r.width - engine.w) > 1 || Math.abs(r.height - engine.h) > 1)) {
        engine.resize(r.width, r.height);
      }
    });
    ro.observe(wrap);
    const r = wrap.getBoundingClientRect();
    if (r.width > 10 && r.height > 10) engine.resize(r.width, r.height);
    return () => {
      engine.dispose();
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (engineRef.current) engineRef.current.season = seasonRef.current;
  }, [season]);
  useEffect(() => {
    if (engineRef.current) engineRef.current.windScale = scaleRef.current;
  }, [windScale]);

  return (
    <div ref={wrapRef} className={`map-shell ${className ?? ''}`} style={style}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
