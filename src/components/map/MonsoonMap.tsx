'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { asset } from '@/lib/asset';
import { useEffect, useRef } from 'react';
import { CURRENT_MAP } from '@/data/currents';
import { clamp, lerp } from '@/lib/geo';
import { pseudoNoise } from '@/lib/noise';
import type { Season } from '@/types';

/* ───────────────────────── 视图：锁定北印度洋 ─────────────────────────
 * 等距圆柱窗口：东非 → 阿拉伯海 → 印度 → 孟加拉湾占满画面，
 * 全球其余部分在窗口外自动成为弱化背景。
 */
const LNG0 = 27;
const LNG1 = 106;
const LAT0 = -19;
const LAT1 = 43;

type Pt = [number, number];

/* ── 三个需要突出表达的标签（精简，放在开阔海面） ── */
const TAG_WIND   = { lng: 66, lat: 20, summer: '西南季风', winter: '东北季风' };
const TAG_SOMALI = { lng: 51.3, lat: 2.8,  summer: '索马里洋流', winter: '索马里洋流' };
const TAG_UPWELL = { lng: 48.6, lat: 12.4, summer: '沿岸上升流', winter: '上升流停止' };

/* ── 索马里洋流的季节路径（用于构建沿岸矢量场，中心亮→边缘暗） ── */
const SOMALI_SUMMER: Pt[] = [
  [50.5, -3], [48.8, 0.5], [47.5, 4], [46.2, 7.5], [44.8, 10.5], [43.5, 12.5],
];
const SOMALI_WINTER: Pt[] = [
  [43.5, 12.5], [45, 9], [46.8, 5.5], [48.2, 2], [49.5, -1.5], [50.5, -3],
];

/* ───────────────────────── 矢量场定义 ─────────────────────────
 * 全部用地理坐标 (lng, lat) 定义。粒子在经度/纬度空间 advect，
 * 方向插值随季节 t（0=夏,1=冬）平滑过渡。
 */

/** 平滑权重：距离核心区的衰减（越靠近北印度洋中心越密） */
function coreWeight(lng: number, lat: number): number {
  // 北印度洋核心：阿拉伯海、印度西侧、孟加拉湾三块高斯叠加
  const arab = Math.exp(-(((lng - 64) / 14) ** 2)) * Math.exp(-(((lat - 13) / 10) ** 2));
  const bengal = Math.exp(-(((lng - 88) / 12) ** 2)) * Math.exp(-(((lat - 13) / 10) ** 2));
  const west = Math.exp(-(((lng - 75) / 17) ** 2)) * Math.exp(-(((lat - 9) / 12) ** 2));
  return Math.min(1, (arab * 1.4 + bengal * 1.3 + west * 1.0));
}

/** 季风矢量场：夏季西南→东北，冬季东北→西南，t 平滑插值；返回单位向量 + 权重 */
function windFieldAt(lng: number, lat: number, t: number): { dx: number; dy: number; w: number } | null {
  // 只覆盖北印度洋区域，其余位置无风（粒子自然稀疏）
  if (lng < 34 || lng > 102 || lat < -10 || lat > 32) return null;
  // 夏季 45°（东北），冬季 225°（西南）；经度方向插值避免跳变
  const aDeg = lerp(45, 225, t);
  const rad = (aDeg * Math.PI) / 180;
  // 轻微弯曲：方向随着位置缓慢变化，形成流线的自然曲率
  const bend = Math.sin((lng - 40) * 0.045 + (lat - 10) * 0.07) * 0.5 + Math.sin(lng * 0.09) * 0.35;
  const r2 = rad + bend * 0.32;
  const dx = Math.cos(r2);
  const dy = Math.sin(r2);
  const w = coreWeight(lng, lat);
  if (w < 0.03) return null;
  return { dx, dy, w };
}

/** 距折线最短距离（度） */
function distToPolyline(lng: number, lat: number, pts: Pt[]): { d: number; idx: number } {
  let best = Infinity;
  let idx = 0;
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
    if (d < best) { best = d; idx = i; }
  }
  return { d: best, idx };
}

/** 索马里洋流带：沿岸窄带矢量场，中心亮、边缘渐暗。
 * 带的位置/形状由季节路径插值决定（路径本身随季节反向），
 * 但粒子运动方向使用明确的“沿岸流向”：夏季向东北、冬季向西南（按 t 插值），
 * 避免路径切线方向与真实流向不一致。 */
function somaliFieldAt(lng: number, lat: number, t: number): { dx: number; dy: number; w: number } | null {
  const m = SOMALI_SUMMER.map((p, i) => [lerp(p[0], SOMALI_WINTER[i][0], t), lerp(p[1], SOMALI_WINTER[i][1], t)] as Pt);
  const { d } = distToPolyline(lng, lat, m);
  const band = 1.35; // 带宽度（度）
  if (d > band) return null;
  // 方向：夏季东北 (dx≈0.6, dy≈0.8)，冬季西南 (-0.6, -0.8)，随 t 平滑转向
  const aDeg = lerp(63, 243, t); // 63°≈东北偏北，243°≈西南偏南（沿岸流向）
  const rad = (aDeg * Math.PI) / 180;
  let dx = Math.cos(rad);
  let dy = Math.sin(rad);
  // 轻微的沿岸弯曲/扰动，避免粒子排成整齐直线
  const bend = pseudoNoise(lng * 0.5, lat * 0.5) * 0.28;
  const cs = Math.cos(bend), sn = Math.sin(bend);
  const rx = dx * cs - dy * sn;
  const ry = dx * sn + dy * cs;
  dx = rx; dy = ry;
  const dlen = Math.hypot(dx, dy) || 1e-9;
  // 中心亮边缘暗：高斯
  const w = Math.exp(-(d * d) / (0.5 * 0.5)) * 1.15;
  if (w < 0.05) return null;
  return { dx: dx / dlen, dy: dy / dlen, w: Math.min(1.4, w) };
}

/** 沿岸上升流区域：索马里半岛外一个连续冷水上涌区，夏季强、冬季弱 */
function upwellWeightAt(lng: number, lat: number, t: number): number {
  // 区域：沿岸窄带（沿索马里海岸），强调“一整片冷水沿海岸上涌”
  const along = clamp((lat - 3.2) / 8.5, 0, 1);          // 纬度方向：从南到北
  const lateral = Math.exp(-(((lng - (46.2 + along * -0.6)) / 1.25) ** 2)); // 沿岸随纬度略弯
  const vertical = Math.sin(along * Math.PI);              // 上下渐变：中间强两端弱
  const seasonK = Math.pow(1 - t, 1.4);                     // 夏季强、冬季弱
  return lateral * vertical * seasonK;
}

/* ── 粒子：spawn → advect → fade → respawn ── */
interface P {
  lng: number;
  lat: number;
  age: number;
  life: number;
  seed: number;
  kind: 'wind' | 'somali' | 'upwell';
  speed: number; // 视场倍率
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
  t = 0; // 季节插值：0=夏，1=冬
  land: { x: number; y: number }[][] = [];
  landReady = false;
  mask: Uint8ClampedArray | null = null;
  maskCols = 0;
  maskRows = 0;
  maskReady = false;
  ps: P[] = [];
  raf = 0;
  last = 0;
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

  /* ── 海洋遮罩（1/4 分辨率，用于粒子只从海面出生） ── */
  buildMask() {
    const mc = document.createElement('canvas');
    const mw = Math.max(2, Math.round(this.w / 4));
    const mh = Math.max(2, Math.round(this.h / 4));
    mc.width = mw;
    mc.height = mh;
    const mb = mc.getContext('2d')!;
    mb.clearRect(0, 0, mw, mh); // 透明海洋（alpha 0）
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
    // 投影到画布 → 再换算到 mask 网格
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

  /* ── 粒子系统 ── */
  initParticles() {
    this.ps = [];
    const windN = Math.round((this.w * this.h) / 320);      // 风粒子：大量（核心密度最高）
    const somaliN = Math.max(80, Math.round((this.w * this.h) / 1500)); // 洋流：密集中带
    const upwellN = Math.max(55, Math.round((this.w * this.h) / 3000)); // 上升流：局部
    for (let i = 0; i < windN; i++) this.ps.push(this.spawn('wind'));
    for (let i = 0; i < somaliN; i++) this.ps.push(this.spawn('somali'));
    for (let i = 0; i < upwellN; i++) this.ps.push(this.spawn('upwell'));
  }

  spawn(kind: P['kind']): P {
    if (kind === 'wind') {
      // 按核心权重拒绝采样：密度随距离北印度洋中心衰减
      for (let tries = 0; tries < 40; tries++) {
        const lng = LNG0 + Math.random() * (LNG1 - LNG0);
        const lat = LAT0 + Math.random() * (LAT1 - LAT0);
        const f = windFieldAt(lng, lat, this.t);
        if (!f) continue;
        if (Math.random() > f.w * 0.95) continue;   // 权重低的区域粒子少
        if (!this.isSea(lng, lat)) continue;
        return { lng, lat, age: Math.random() * 5, life: 6 + Math.random() * 6, seed: Math.random() * 100, kind, speed: 1.3 + Math.random() * 1.7 };
      }
      return { lng: 65, lat: 10, age: 0, life: 8, seed: Math.random() * 100, kind, speed: 0.7 };
    }
    if (kind === 'somali') {
      // 在索马里沿岸带内采样
      for (let tries = 0; tries < 40; tries++) {
        const lng = 42 + Math.random() * 11;
        const lat = -5 + Math.random() * 19;
        const f = somaliFieldAt(lng, lat, this.t);
        if (!f) continue;
        if (!this.isSea(lng, lat)) continue;
        return { lng, lat, age: Math.random() * 4, life: 5 + Math.random() * 6, seed: Math.random() * 100, kind, speed: 0.85 + Math.random() * 1.3 };
      }
      return { lng: 47.5, lat: 4, age: 0, life: 7, seed: Math.random() * 100, kind, speed: 0.6 };
    }
    // upwell：沿岸上升流区
    for (let tries = 0; tries < 30; tries++) {
      const lat = 3 + Math.random() * 9;
      const lng = 44.5 + Math.random() * 5;
      if (upwellWeightAt(lng, lat, this.t) < 0.15) continue;
      if (!this.isSea(lng, lat)) continue;
      return { lng, lat, age: Math.random() * 4, life: 5 + Math.random() * 6, seed: Math.random() * 100, kind, speed: 0.95 + Math.random() * 1.5 };
    }
    return { lng: 46.5, lat: 6, age: 0, life: 7, seed: Math.random() * 100, kind, speed: 0.6 };
  }

  /* ── 主循环 ── */
  tick(now: number) {
    if (this.disposed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.08);
    this.last = now;
    const target = this.season === 'winter' ? 1 : 0;
    this.t += (target - this.t) * (1 - Math.exp(-dt * 2.4)); // 平滑切换 ≈2s

    const { ctx, w, h } = this;
    this.redrawBase();

    /* 上升流：一整片冷水沿岸上涌（先画区域底色，再叠加局部上涌粒子） */
    this.drawUpwellZone(ctx, w, h, dt);

    /* 洋流粒子 + 风粒子（同一 advection 循环，不同 vector field） */
    this.advect(ctx, w, h, dt);

    this.drawLabels();
    this.raf = requestAnimationFrame((n) => this.tick(n));
  }

  /** 上升流区域：沿岸一个连续冷色水域（深蓝→青蓝渐变），夏季强、冬季弱 */
  drawUpwellZone(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const k = Math.pow(1 - this.t, 1.5);
    if (k < 0.02) return;
    // 区域底部光晕：整片冷水上涌感（不用任何线条）
    const gx0 = this.proj(46.4, 10.5)[0];
    const gy0 = this.proj(46.4, 10.5)[1];
    const gy1 = this.proj(46.2, 3.6)[1];
    const cx = this.proj(46.35, 7.2)[0];
    const cy = this.proj(46.35, 7.2)[1];
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.abs(gy1 - gy0) * 0.62);
    rg.addColorStop(0, `rgba(70, 160, 225, ${0.16 * k})`);
    rg.addColorStop(0.5, `rgba(45, 130, 205, ${0.10 * k})`);
    rg.addColorStop(1, 'rgba(20,90,160,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(cx - Math.abs(gy1 - gy0), cy - Math.abs(gy1 - gy0), Math.abs(gy1 - gy0) * 2, Math.abs(gy1 - gy0) * 2);
  }

  /** 粒子 advection 主循环 */
  advect(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const t = this.t;
    const scale = 0.02; // deg → 屏幕位移系数（粒子每帧位移很小，由速度×dt 控制）
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      // 采样当前 vector field
      let vx = 0, vy = 0, weight = 1;
      if (p.kind === 'wind') {
        const f = windFieldAt(p.lng, p.lat, t);
        if (!f) { this.ps[i] = this.spawn(p.kind); continue; }
        vx = f.dx; vy = f.dy; weight = f.w;
      } else if (p.kind === 'somali') {
        const f = somaliFieldAt(p.lng, p.lat, t);
        if (!f) { this.ps[i] = this.spawn(p.kind); continue; }
        vx = f.dx; vy = f.dy; weight = f.w;
      } else {
        // upwell：沿岸上升流，向北缓慢上涌（lat 增加），配合轻微横向漂移
        const uw = upwellWeightAt(p.lng, p.lat, t);
        if (uw < 0.04) { this.ps[i] = this.spawn(p.kind); continue; }
        weight = uw;
        const jitter = pseudoNoise(p.seed, p.lng * 0.3) * 0.5;
        vx = 0.05 + jitter * 0.08;
        vy = 0.98 + pseudoNoise(p.seed * 1.7, p.lat) * 0.25;
        const vl = Math.hypot(vx, vy) || 1;
        vx /= vl; vy /= vl;
      }

      // 粒子运动：世界速度 = 单位方向 × speed（度/秒）× dt × 风速缩放
      const spd = p.speed * (p.kind === 'wind' ? (0.7 + 0.5 * this.windScale) : 1);
      p.lng += vx * spd * dt;
      p.lat += vy * spd * dt * (p.kind === 'upwell' ? 1.25 : 1);

      // 生命周期
      p.age += dt;
      if (p.age > p.life) { this.ps[i] = this.spawn(p.kind); continue; }
      // 离开场范围 / 上岸 → 重生成
      if (p.lng < LNG0 || p.lng > LNG1 || p.lat < LAT0 || p.lat > LAT1) { this.ps[i] = this.spawn(p.kind); continue; }

      // 淡化曲线（出生淡入、临终淡出）
      const fadeIn = clamp(p.age / 1.4, 0, 1);
      const fadeOut = clamp((p.life - p.age) / 2.2, 0, 1);
      const fade = fadeIn * fadeOut;

      // 世界位置 → 屏幕：尾迹只画一小段（粒子运动的反方向）
      const [x, y] = this.proj(p.lng, p.lat);
      if (x < -40 || x > w + 40 || y < -40 || y > h + 40) { this.ps[i] = this.spawn(p.kind); continue; }

      // 上一帧位置近似 = 当前位置 - 速度方向 × 步长像素
      const ux = vx, uy = vy;
      const trav = 1.0 + (p.seed % 19) / 8;      // trail 长度不一
      const len = trav * (p.kind === 'somali' ? 8.5 : p.kind === 'upwell' ? 6 : 6.2) * (1 + 0.22 * ((p.seed % 6)));
      const tx = x - ux * len * 0.5;
      const ty = y - uy * len * 0.5;

      // 视觉样式按 kind 区分：
      if (p.kind === 'wind') {
        ctx.strokeStyle = 'rgba(196, 232, 252, 1)';
        ctx.lineWidth = 1.05;
        ctx.globalAlpha = fade * (0.32 + 0.30 * weight) * (0.65 + 0.35 * this.windScale);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        // 极淡的头点，让流场有“粒子”感而非纯线条
        ctx.globalAlpha = fade * (0.10 + 0.10 * weight);
        ctx.fillStyle = 'rgba(215, 240, 255, 1)';
        ctx.beginPath();
        ctx.arc(x, y, 0.85, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'somali') {
        // 洋流：蓝色，中心亮边缘暗
        const bright = clamp(weight - 0.2, 0, 1) / 1.2;
        ctx.strokeStyle = `rgba(${70 + Math.round(60 * bright)}, ${180 + Math.round(45 * bright)}, 255, 1)`;
        ctx.lineWidth = 1.2 + 0.8 * bright;
        ctx.globalAlpha = fade * (0.24 + 0.40 * bright);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        // 头部一点
        ctx.globalAlpha = fade * (0.12 + 0.2 * bright);
        ctx.fillStyle = `rgba(180, 232, 255, 1)`;
        ctx.beginPath();
        ctx.arc(x, y, 1.0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // upwell：深蓝→青蓝渐变（沿上涌方向，头部亮）
        const g0 = Math.round(30 + 45 * fade);
        ctx.strokeStyle = `rgba(${g0}, ${130 + 60 * fade}, 235, 1)`;
        ctx.lineWidth = 1.0 + 0.4 * fade;
        ctx.globalAlpha = fade * (0.10 + 0.16 * weight);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        // 头部亮一点（上涌到达感）
        ctx.globalAlpha = fade * (0.10 + 0.14 * weight);
        ctx.fillStyle = 'rgba(170, 228, 255, 1)';
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
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
