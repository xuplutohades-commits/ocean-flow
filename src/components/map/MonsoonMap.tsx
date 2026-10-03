'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { asset } from '@/lib/asset';
import { useEffect, useRef } from 'react';
import { CURRENT_MAP } from '@/data/currents';
import { clamp, lerp } from '@/lib/geo';
import { pseudoNoise } from '@/lib/noise';
import type { Season } from '@/types';

/* ───────────────────────── 视图：锁定北印度洋 ───────────────────────── */
const LNG0 = 27;
const LNG1 = 106;
const LAT0 = -19;
const LAT1 = 43;

type Pt = [number, number];

/* ── 三个精简标签（放在开阔海面） ── */
const TAG_WIND   = { lng: 66, lat: 20, summer: '西南季风', winter: '东北季风' };
const TAG_SOMALI = { lng: 51.3, lat: 2.8,  summer: '索马里洋流', winter: '索马里洋流' };
const TAG_UPWELL = { lng: 48.6, lat: 12.4, summer: '沿岸上升流', winter: '上升流停止' };

/* ── 索马里洋流的季节海岸路径（用于洋流带形状） ── */
const SOMALI_SUMMER: Pt[] = [
  [50.5, -3], [48.8, 0.5], [47.5, 4], [46.2, 7.5], [44.8, 10.5], [43.5, 12.5],
];
const SOMALI_WINTER: Pt[] = [
  [43.5, 12.5], [45, 9], [46.8, 5.5], [48.2, 2], [49.5, -1.5], [50.5, -3],
];

/* ───────────────────────── 风与海水矢量场（地理坐标） ───────────────────────── */

/** 北印度洋核心权重：阿拉伯海、孟加拉湾、印度两侧（密度随距离衰减） */
function coreWeight(lng: number, lat: number): number {
  const arab = Math.exp(-(((lng - 64) / 14) ** 2)) * Math.exp(-(((lat - 13) / 10) ** 2));
  const bengal = Math.exp(-(((lng - 88) / 12) ** 2)) * Math.exp(-(((lat - 13) / 10) ** 2));
  const west = Math.exp(-(((lng - 75) / 17) ** 2)) * Math.exp(-(((lat - 9) / 12) ** 2));
  return Math.min(1, arab * 1.4 + bengal * 1.3 + west * 1.0);
}

/** 季风方向场：夏季西南→东北（63°），冬季东北→西南（243°），t 平滑插值 */
function windDirAt(lng: number, lat: number, t: number): number | null {
  if (lng < 34 || lng > 102 || lat < -10 || lat > 32) return null;
  const aDeg = lerp(63, 243, t);
  const rad = (aDeg * Math.PI) / 180;
  // 轻微弯曲，让箭头不是整齐机械的平行线
  const bend = Math.sin((lng - 40) * 0.045 + (lat - 10) * 0.07) * 0.5 + Math.sin(lng * 0.09) * 0.35;
  let out = rad + bend * 0.32;
  out = ((out + Math.PI) % (Math.PI * 2)) - Math.PI;
  return out;
}

/** 距折线最短距离（度） */
function distToPolyline(lng: number, lat: number, pts: Pt[]): { d: number } {
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
  return { d: best };
}

/** 索马里洋流带：沿岸窄带矢量场，中心亮、边缘暗；方向夏东北/冬西南（沿岸流向） */
function somaliFieldAt(lng: number, lat: number, t: number): { dx: number; dy: number; w: number } | null {
  const m = SOMALI_SUMMER.map((p, i) => [lerp(p[0], SOMALI_WINTER[i][0], t), lerp(p[1], SOMALI_WINTER[i][1], t)] as Pt);
  const { d } = distToPolyline(lng, lat, m);
  const band = 1.35;
  if (d > band) return null;
  const aDeg = lerp(63, 243, t);
  let dx = Math.cos((aDeg * Math.PI) / 180);
  let dy = Math.sin((aDeg * Math.PI) / 180);
  const bend = pseudoNoise(lng * 0.5, lat * 0.5) * 0.28;
  const cs = Math.cos(bend), sn = Math.sin(bend);
  const rx = dx * cs - dy * sn;
  const ry = dx * sn + dy * cs;
  dx = rx; dy = ry;
  const dlen = Math.hypot(dx, dy) || 1e-9;
  const w = Math.exp(-(d * d) / (0.5 * 0.5)) * 1.15;
  if (w < 0.05) return null;
  return { dx: dx / dlen, dy: dy / dlen, w: Math.min(1.4, w) };
}

/** 沿岸上升流：索马里半岛外连续冷水上涌区，夏季强、冬季弱 */
function upwellWeightAt(lng: number, lat: number, t: number): number {
  const along = clamp((lat - 3.2) / 8.5, 0, 1);
  const lateral = Math.exp(-(((lng - (46.2 + along * -0.6)) / 1.25) ** 2));
  const vertical = Math.sin(along * Math.PI);
  const seasonK = Math.pow(1 - t, 1.4);
  return lateral * vertical * seasonK;
}

/* ── 粒子：海水用（spawn → advect → fade → respawn） ── */
interface P {
  lng: number;
  lat: number;
  age: number;
  life: number;
  seed: number;
  kind: 'water' | 'somali' | 'upwell';
  speed: number;
}

/* ── 风箭头（静态锚点 + 慢速漂移） ── */
interface Arrow {
  lng: number;
  lat: number;
  phase: number;
}

interface EngineProps {
  season: Season;
  canvas: HTMLCanvasElement;
  windScale?: number;
}

class MonsoonEngine {
  w = 800;
  h = 500;
  dpr = 1;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  base: HTMLCanvasElement;
  season: Season;
  t = 0; // 0=夏 1=冬，平滑过渡
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

  /* ── 海洋遮罩（1/4 分辨率，透明=海，白=陆） ── */
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

  /* ── 底图 ── */
  drawBase() {
    const b = this.base.getContext('2d')!;
    const { w, h } = this;
    b.clearRect(0, 0, w, h);
    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#081A2B');
    g.addColorStop(0.4, '#0A2E4E');
    g.addColorStop(0.75, '#0B4464');
    g.addColorStop(1, '#0D5372');
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);
    const [cx, cy] = this.proj(66, 10);
    const rg = b.createRadialGradient(cx, cy, 0, cx, cy, 0.62 * Math.min(w, h));
    rg.addColorStop(0, 'rgba(130,210,244,0.10)');
    rg.addColorStop(0.6, 'rgba(96,178,224,0.05)');
    rg.addColorStop(1, 'rgba(20,60,100,0)');
    b.fillStyle = rg;
    b.fillRect(0, 0, w, h);
    b.strokeStyle = 'rgba(148,200,228,0.08)';
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
    b.strokeStyle = 'rgba(132,196,228,0.14)';
    b.beginPath();
    b.moveTo(0, yEq);
    b.lineTo(w, yEq);
    b.stroke();
    if (this.landReady) {
      b.fillStyle = '#2A414A';
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
      b.strokeStyle = 'rgba(72,98,108,0.6)';
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

  /* ── 初始化：风箭头 + 海水粒子 ── */
  initArrows() {
    this.arrows = [];
    // 覆盖北印度洋：约 5 行 x 7 列的稀疏网格，跳过陆地
    for (let i = 0; i < 34; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const lng = 45 + Math.random() * 52;
        const lat = 2 + Math.random() * 24;
        if (lng < 34 || lng > 102 || lat < -10 || lat > 32) continue;
        if (!this.isSea(lng, lat)) continue;
        if (Math.random() < 0.25) continue; // 再稀疏一点，避免箭头墙
        this.arrows.push({ lng, lat, phase: Math.random() * 100 });
        break;
      }
    }
  }

  initParticles() {
    this.ps = [];
    // 海水粒子：克制数量，只分布在海洋
    const waterN = Math.round((this.w * this.h) / 1400);
    // 索马里洋流带：稍密（在带内受限，整体数量与海水接近）
    const somaliN = Math.max(70, Math.round((this.w * this.h) / 1700));
    // 上升流：局部少量
    const upwellN = Math.max(40, Math.round((this.w * this.h) / 3400));
    for (let i = 0; i < waterN; i++) this.ps.push(this.spawn('water'));
    for (let i = 0; i < somaliN; i++) this.ps.push(this.spawn('somali'));
    for (let i = 0; i < upwellN; i++) this.ps.push(this.spawn('upwell'));
  }

  spawn(kind: P['kind']): P {
    if (kind === 'water') {
      for (let tries = 0; tries < 40; tries++) {
        const lng = LNG0 + Math.random() * (LNG1 - LNG0);
        const lat = LAT0 + Math.random() * (LAT1 - LAT0);
        const w = coreWeight(lng, lat);
        if (w < 0.06) continue;
        if (Math.random() > w * 0.9) continue;
        if (!this.isSea(lng, lat)) continue;
        return { lng, lat, age: Math.random() * 5, life: 8 + Math.random() * 8, seed: Math.random() * 100, kind, speed: 0.5 + Math.random() * 0.75 };
      }
      return { lng: 65, lat: 10, age: 0, life: 9, seed: Math.random() * 100, kind, speed: 0.6 };
    }
    if (kind === 'somali') {
      for (let tries = 0; tries < 40; tries++) {
        const lng = 42 + Math.random() * 11;
        const lat = -5 + Math.random() * 19;
        const f = somaliFieldAt(lng, lat, this.t);
        if (!f) continue;
        if (!this.isSea(lng, lat)) continue;
        return { lng, lat, age: Math.random() * 4, life: 6 + Math.random() * 6, seed: Math.random() * 100, kind, speed: 0.7 + Math.random() * 1.0 };
      }
      return { lng: 47.5, lat: 4, age: 0, life: 7, seed: Math.random() * 100, kind, speed: 0.8 };
    }
    for (let tries = 0; tries < 30; tries++) {
      const lat = 3 + Math.random() * 9;
      const lng = 44.5 + Math.random() * 5;
      if (upwellWeightAt(lng, lat, this.t) < 0.15) continue;
      if (!this.isSea(lng, lat)) continue;
      return { lng, lat, age: Math.random() * 4, life: 6 + Math.random() * 6, seed: Math.random() * 100, kind, speed: 0.5 + Math.random() * 0.8 };
    }
    return { lng: 46.5, lat: 6, age: 0, life: 7, seed: Math.random() * 100, kind, speed: 0.6 };
  }

  /* ── 主循环 ── */
  tick(now: number) {
    if (this.disposed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.08);
    this.last = now;
    this.time += dt;
    const target = this.season === 'winter' ? 1 : 0;
    // 1~1.5 秒平滑过渡
    this.t += (target - this.t) * (1 - Math.exp(-dt * 3.0));

    const { ctx, w, h } = this;
    this.redrawBase();

    // 层次 1：上升流区域（最底层，冷水上涌）
    this.drawUpwellZone(ctx, w, h, dt);
    // 层次 2：海水粒子
    this.advect(ctx, w, h, dt);
    // 层次 3：风箭头（最上层，淡色示意）
    this.drawWindArrows(ctx, w, h, dt);

    this.drawLabels();
    this.raf = requestAnimationFrame((n) => this.tick(n));
  }

  /** 上升流区域：沿岸一片连续冷色水域（深蓝→青蓝），夏季强、冬季弱 */
  drawUpwellZone(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const k = Math.pow(1 - this.t, 1.5);
    if (k < 0.02) return;
    const gy1 = this.proj(46.2, 3.6)[1];
    const gy0 = this.proj(46.6, 10.8)[1];
    const cx = this.proj(46.35, 7.2)[0];
    const cy = this.proj(46.35, 7.2)[1];
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.abs(gy1 - gy0) * 0.62);
    rg.addColorStop(0, `rgba(70, 160, 225, ${0.18 * k})`);
    rg.addColorStop(0.5, `rgba(45, 130, 205, ${0.11 * k})`);
    rg.addColorStop(1, 'rgba(20,90,160,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(cx - Math.abs(gy1 - gy0), cy - Math.abs(gy1 - gy0), Math.abs(gy1 - gy0) * 2, Math.abs(gy1 - gy0) * 2);
  }

  /** 海水粒子：蓝色流动粒子，沿风场方向 advect（风推动海水） */
  advect(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const t = this.t;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      let vx = 0, vy = 0, weight = 1;
      if (p.kind === 'water') {
        const a = windDirAt(p.lng, p.lat, t);
        if (a === null) { this.ps[i] = this.spawn(p.kind); continue; }
        vx = Math.cos(a);
        vy = Math.sin(a);
        weight = coreWeight(p.lng, p.lat);
        if (weight < 0.05) { this.ps[i] = this.spawn(p.kind); continue; }
      } else if (p.kind === 'somali') {
        const f = somaliFieldAt(p.lng, p.lat, t);
        if (!f) { this.ps[i] = this.spawn(p.kind); continue; }
        vx = f.dx; vy = f.dy; weight = f.w;
      } else {
        const uw = upwellWeightAt(p.lng, p.lat, t);
        if (uw < 0.04) { this.ps[i] = this.spawn(p.kind); continue; }
        weight = uw;
        const jitter = pseudoNoise(p.seed, p.lng * 0.3) * 0.5;
        vx = 0.05 + jitter * 0.08;
        vy = 0.98 + pseudoNoise(p.seed * 1.7, p.lat) * 0.25;
        const vl = Math.hypot(vx, vy) || 1;
        vx /= vl; vy /= vl;
      }

      // 运动：沿场方向，速度自然变化
      let spd = p.speed;
      if (p.kind === 'water') spd *= (0.75 + 0.5 * this.windScale);
      else if (p.kind === 'somali') spd *= (1.0 + 0.3 * this.windScale);
      p.lng += vx * spd * dt;
      p.lat += vy * spd * dt * (p.kind === 'upwell' ? 1.3 : 1);

      p.age += dt;
      if (p.age > p.life) { this.ps[i] = this.spawn(p.kind); continue; }
      if (p.lng < LNG0 || p.lng > LNG1 || p.lat < LAT0 || p.lat > LAT1) { this.ps[i] = this.spawn(p.kind); continue; }

      const fadeIn = clamp(p.age / 1.6, 0, 1);
      const fadeOut = clamp((p.life - p.age) / 2.6, 0, 1);
      const fade = fadeIn * fadeOut;

      const [x, y] = this.proj(p.lng, p.lat);
      if (x < -40 || x > w + 40 || y < -40 || y > h + 40) { this.ps[i] = this.spawn(p.kind); continue; }

      // 短尾：只画一小段，长度不一
      const ux = vx, uy = vy;
      const trav = 1.0 + (p.seed % 19) / 8;
      const len = trav * (p.kind === 'somali' ? 7.5 : p.kind === 'upwell' ? 5.5 : 5.0);
      const tx = x - ux * len * 0.5;
      const ty = y - uy * len * 0.5;

      if (p.kind === 'water') {
        // 海水：浅蓝、细、淡
        const b1 = 180 + Math.round(35 * weight);
        ctx.strokeStyle = `rgba(120, 175, ${b1}, 1)`;
        ctx.lineWidth = 0.9;
        ctx.globalAlpha = fade * (0.14 + 0.13 * weight);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (p.kind === 'somali') {
        // 索马里洋流：稍密、稍亮、青蓝
        const bright = clamp(weight - 0.2, 0, 1) / 1.2;
        ctx.strokeStyle = `rgba(${60 + Math.round(70 * bright)}, ${185 + Math.round(50 * bright)}, 255, 1)`;
        ctx.lineWidth = 1.2 + 0.8 * bright;
        ctx.globalAlpha = fade * (0.24 + 0.34 * bright);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = fade * (0.12 + 0.18 * bright);
        ctx.fillStyle = 'rgba(175, 230, 255, 1)';
        ctx.beginPath();
        ctx.arc(x, y, 1.0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 上升流：深蓝→青蓝，向上
        const g0 = Math.round(32 + 42 * fade);
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

  /** 风：少量、细、淡、半透明的方向箭头（教学图示式，无粒子） */
  drawWindArrows(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const t = this.t;
    ctx.save();
    ctx.lineCap = 'round';
    for (const ar of this.arrows) {
      const a = windDirAt(ar.lng, ar.lat, t);
      if (a === null) continue;
      const [x0, y0] = this.proj(ar.lng, ar.lat);
      if (x0 < -60 || x0 > w + 60 || y0 < -60 || y0 > h + 60) continue;
      // 缓慢、轻微漂移（沿风向非常慢，让箭头"活着"但不抢眼）
      const drift = Math.sin(this.time * 0.30 + ar.phase) * 6;
      const len = 21 * (0.8 + 0.4 * this.windScale);
      const hx = Math.cos(a), hy = Math.sin(a);
      const x1 = x0 + hx * len + hx * drift;
      const y1 = y0 + hy * len + hy * drift;
      // 淡入淡出：缓慢呼吸，避免机械静止
      const breathe = 0.8 + 0.2 * Math.sin(this.time * 0.35 + ar.phase * 1.7);
      const alpha = 0.82 * breathe * (0.82 + 0.18 * this.windScale);
      // 箭头主体：细、浅白青、半透明（清晰可读但不发光不粗）
      ctx.strokeStyle = 'rgba(226, 245, 255, 1)';
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x0 + hx * drift * 0.3, y0 + hy * drift * 0.3);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // 小箭头头部
      const ah = 5.2;
      const px = -hy, py = hx;
      const bx = x1 - hx * ah * 0.72;
      const by = y1 - hy * ah * 0.72;
      ctx.globalAlpha = alpha * 1.1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(bx + px * 2.4, by + py * 2.4);
      ctx.lineTo(bx - px * 2.4, by - py * 2.4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(230, 246, 255, 1)';
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
      { ...TAG_SOMALI, text: TAG_SOMALI.summer },
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
