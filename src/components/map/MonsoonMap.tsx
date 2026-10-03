'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { asset } from '@/lib/asset';
import { useEffect, useRef } from 'react';
import { CURRENT_MAP } from '@/data/currents';
import { clamp, lerp } from '@/lib/geo';
import type { Season } from '@/types';

/* ───────────────────────── 视图：锁定北印度洋 ─────────────────────────
 * 等距圆柱窗口：东非 → 阿拉伯海 → 印度 → 孟加拉湾占满画面，
 * 太平洋 / 南大西洋 / 南印度洋 / 南极都不在窗口内（自然成为弱化背景）。
 */
const LNG0 = 27;
const LNG1 = 106;
const LAT0 = -19;
const LAT1 = 43;

type Pt = [number, number];
/** 三次贝塞尔 [p0, c1, c2, p3] */
type Bez = [Pt, Pt, Pt, Pt];

/* ── 季风流线（夏季：西南→东北；冬季：东北→西南，同一条线反向）── */
const WIND_BEZ_SUMMER: Bez[] = [
  [[47, 4],   [56, 7.5],  [64, 12],  [74, 16.5]],
  [[43, 8],   [52, 10.5], [61, 14.5], [72, 18.5]],
  [[51, 2.5], [59, 6.5],  [69, 8.5],  [83, 10.5]],
  [[58, 6.5], [66, 9.5],  [76, 11.5], [88, 14.5]],
];
const WIND_BEZ_WINTER: Bez[] = WIND_BEZ_SUMMER.map(([p0, c1, c2, p3]) => [p3, c2, c1, p0] as Bez);

/* ── 上升流弧线（索马里半岛东岸，p0 沿岸下 → p1 海面上，向上涌） ── */
const UPWELL_ARCS: [Pt, Pt, Pt][] = [
  [[47.2, 3.3], [46.4, 5.9], [46.7, 8.6]],
  [[47.9, 4.2], [47.0, 7.1], [47.2, 9.8]],
  [[48.6, 5.1], [47.7, 8.0], [47.8, 10.9]],
  [[46.4, 2.7], [45.9, 5.3], [46.2, 7.7]],
];

/* ── 三枚简洁标签（避开流线主干） ── */
const TAG_WIND   = { lng: 66, lat: 20, summer: '西南季风', winter: '东北季风' };
const TAG_SOMALI = { lng: 51.3, lat: 2.8,  summer: '索马里洋流', winter: '索马里洋流' };
const TAG_UPWELL = { lng: 48.6, lat: 12.4, summer: '沿岸上升流', winter: '上升流停止' };

/* ── 粒子沿着折线运动：s∈[0,1] 表示沿路径的进度 ── */
interface Walker {
  s: number;
  v: number;   // 每秒进度
  seed: number;
}

function bezPoint(b: Bez, t: number): Pt {
  const [p0, c1, c2, p3] = b;
  const u = 1 - t;
  const a = u * u * u, bb = 3 * u * u * t, cc = 3 * u * t * t, d = t * t * t;
  return [
    a * p0[0] + bb * c1[0] + cc * c2[0] + d * p3[0],
    a * p0[1] + bb * c1[1] + cc * c2[1] + d * p3[1],
  ];
}

/** 贝塞尔 → 均匀折线（段数 N） */
function bezPolyline(b: Bez, n = 56): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(bezPoint(b, i / n));
  return out;
}

function walkerAt(pts: Pt[], s: number): Pt {
  const n = pts.length - 1;
  const t = clamp(s, 0, 0.9999) * n;
  const i = Math.floor(t);
  const f = t - i;
  return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
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
  season: Season;
  t = 0;               // 季节插值：0=夏，1=冬（平滑过渡）
  land: { x: number; y: number }[][] = [];
  landReady = false;
  walkers: Walker[] = [];
  currentWalkers: Walker[] = [];
  upwellWalkers: Walker[] = [];
  raf = 0;
  last = 0;
  disposed = false;
  windScale = 1;
  base: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, opts: EngineProps) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.season = opts.season;
    this.windScale = opts.windScale ?? 1;
    this.t = this.season === 'winter' ? 1 : 0;
    // 季风粒子：每条流线 5 枚
    this.walkers = [];
    for (let i = 0; i < WIND_BEZ_SUMMER.length; i++) {
      for (let k = 0; k < 5; k++) {
        this.walkers.push({ s: (k + Math.random() * 0.6) / 5, v: 0.020 + Math.random() * 0.018, seed: Math.random() * 100 });
      }
    }
    // 洋流粒子：主带 8 枚 + 环流带 5 枚
    for (let k = 0; k < 8; k++) this.currentWalkers.push({ s: k / 8, v: 0.030 + Math.random() * 0.025, seed: Math.random() * 100 });
    for (let k = 0; k < 5; k++) this.currentWalkers.push({ s: k / 5, v: 0.045 + Math.random() * 0.02, seed: Math.random() * 100 });
    // 上升流微粒：每条弧 2 枚
    for (let i = 0; i < UPWELL_ARCS.length; i++) {
      for (let k = 0; k < 2; k++) {
        this.upwellWalkers.push({ s: (k + Math.random() * 0.5) / 2, v: 0.10 + Math.random() * 0.05, seed: Math.random() * 100 });
      }
    }
    loadLand().then((polys) => {
      if (this.disposed) return;
      this.land = polys;
      this.landReady = true;
      this.drawBase();
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
    if (this.landReady) this.drawBase();
  }

  /* ── 投影：lng/lat → 画布 ── */
  proj(lng: number, lat: number): Pt {
    return [((lng - LNG0) / (LNG1 - LNG0)) * this.w, ((LAT1 - lat) / (LAT1 - LAT0)) * this.h];
  }

  /* ── 底图：海洋渐变 + 陆地（低对比）+ 淡经纬网 + 聚光椭圆（画到离屏 base） ── */
  drawBase() {
    const b = this.base.getContext('2d')!;
    const { w, h } = this;
    b.clearRect(0, 0, w, h);
    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#07192A');
    g.addColorStop(0.42, '#0A2E4E');
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
      // 整块绘制，canvas 自动裁剪：不要按点裁剪多边形，否则大型多边形
      // 在窗口内变成破碎路径，closePath 会误填海洋为陆地
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

  /* ── 主渲染帧 ── */
  tick(now: number) {
    if (this.disposed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.08);
    this.last = now;
    const target = this.season === 'winter' ? 1 : 0;
    this.t += (target - this.t) * (1 - Math.exp(-dt * 2.6)); // 平滑切换 ≈ 2s

    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    // 重画底图
    this.redrawBase();

    const t = this.t;

    /* ── ① 上升流：沿岸局部，冷色光晕 + 上涌弧线 + 微粒（冬季淡出） ── */
    this.drawUpwelling(t, dt);

    /* ── ② 索马里洋流带（主视觉）+ 北印度洋环流带（次级） ── */
    this.drawCurrent(t, dt);

    /* ── ③ 季风流线（最上层，细而淡，无箭头） ── */
    this.drawWind(t, dt);

    /* ── ④ 标签 ── */
    this.drawLabels(t);

    this.raf = requestAnimationFrame((n) => this.tick(n));
  }

  drawWind(t: number, dt: number) {
    const { ctx } = this;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    const blend = this.windScale; // 风速滑杆
    // 流线：夏季路径 ↔ 冬季路径 逐控制点插值
    for (let i = 0; i < WIND_BEZ_SUMMER.length; i++) {
      const bS = WIND_BEZ_SUMMER[i];
      const bW = WIND_BEZ_WINTER[i];
      const b: Bez = [
        [lerp(bS[0][0], bW[0][0], t), lerp(bS[0][1], bW[0][1], t)],
        [lerp(bS[1][0], bW[1][0], t), lerp(bS[1][1], bW[1][1], t)],
        [lerp(bS[2][0], bW[2][0], t), lerp(bS[2][1], bW[2][1], t)],
        [lerp(bS[3][0], bW[3][0], t), lerp(bS[3][1], bW[3][1], t)],
      ];
      const pts = bezPolyline(b, 64);
      // 连续平滑的流线本体：细、白浅青、低透明度
      ctx.strokeStyle = `rgba(206, 232, 252, ${0.24 + 0.14 * blend})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      const [x0, y0] = this.proj(pts[0][0], pts[0][1]);
      ctx.moveTo(x0, y0);
      for (let k = 1; k < pts.length; k++) {
        const [x, y] = this.proj(pts[k][0], pts[k][1]);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 少量微小粒子沿流线缓慢漂移（只用来暗示方向）
    const group = Math.floor(this.walkers.length / WIND_BEZ_SUMMER.length);
    for (let i = 0; i < this.walkers.length; i++) {
      const wk = this.walkers[i];
      const line = Math.floor(i / group) % WIND_BEZ_SUMMER.length;
      const bS = WIND_BEZ_SUMMER[line];
      const bW = WIND_BEZ_WINTER[line];
      const b: Bez = [
        [lerp(bS[0][0], bW[0][0], t), lerp(bS[0][1], bW[0][1], t)],
        [lerp(bS[1][0], bW[1][0], t), lerp(bS[1][1], bW[1][1], t)],
        [lerp(bS[2][0], bW[2][0], t), lerp(bS[2][1], bW[2][1], t)],
        [lerp(bS[3][0], bW[3][0], t), lerp(bS[3][1], bW[3][1], t)],
      ];
      const pts = bezPolyline(b, 64);
      wk.s = (wk.s + wk.v * dt * blend * 1.4) % 1;
      const [lng, lat] = walkerAt(pts, wk.s);
      const [x, y] = this.proj(lng, lat);
      const fade = 0.5 + 0.5 * Math.sin(wk.s * Math.PI * 2 + wk.seed); // 沿路淡入淡出
      ctx.fillStyle = 'rgba(226, 244, 255, 1)';
      ctx.globalAlpha = (0.30 + 0.40 * fade) * (0.55 + 0.45 * blend);
      ctx.beginPath();
      ctx.arc(x, y, 1.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawCurrent(t: number, dt: number) {
    const { ctx } = this;
    const somaliSummer = CURRENT_MAP.somaliSummer.path;
    const somaliWinter = CURRENT_MAP.somaliSummer.winterPath!;
    const monoSummer = CURRENT_MAP.monsoonSummer.path;
    const monoWinter = CURRENT_MAP.monsoonSummer.winterPath!;
    const lerpPath = (a: Pt[], b: Pt[]) => a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)] as Pt);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* 北印度洋季风环流带（次级）：细、淡蓝，勾勒整体环流 */
    const ring = lerpPath(monoSummer, monoWinter);
    const ringPts = ring.map((p) => this.proj(p[0], p[1]));
    ctx.strokeStyle = 'rgba(110, 190, 235, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = 'rgba(90, 180, 235, 0.25)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ringPts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* 索马里洋流带（核心）：2~3 条并行蓝带 + 中线更亮 + 光晕 + 粒子 */
    const main = lerpPath(somaliSummer, somaliWinter);
    const dirMain = [main[main.length - 1][0] - main[0][0], main[main.length - 1][1] - main[0][1]];
    const dm = Math.hypot(dirMain[0], dirMain[1]) || 1;
    const nx = -dirMain[1] / dm;
    const ny = dirMain[0] / dm;
    const offset = (k: number) => main.map(([lng, lat]) => {
      // 法向偏移 0.28°（约 30 km），形成“带宽”
      return [lng + nx * 0.28 * k, lat + ny * 0.28 * k] as Pt;
    });
    const off0 = offset(0);
    const off1 = offset(1.15);
    const off2 = offset(-1.05);
    const dot = (pts: Pt[]) => {
      ctx.beginPath();
      const [x0, y0] = this.proj(pts[0][0], pts[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < pts.length; i++) {
        const [x, y] = this.proj(pts[i][0], pts[i][1]);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    // 外缘两条：青蓝、细、较低透明度
    ctx.strokeStyle = 'rgba(90, 185, 245, 0.34)';
    ctx.lineWidth = 1.5;
    dot(off1);
    dot(off2);
    // 中间主线：亮青蓝、更粗、带轻微光晕
    ctx.strokeStyle = 'rgba(120, 214, 255, 0.92)';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = 'rgba(90, 200, 255, 0.8)';
    ctx.shadowBlur = 10;
    dot(off0);
    ctx.shadowBlur = 0;

    // 粒子：亮青色，沿洋流带缓慢移动
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const wk = this.currentWalkers[i];
      wk.s = (wk.s + wk.v * dt) % 1;
      const [lng, lat] = walkerAt(main, wk.s);
      const [x, y] = this.proj(lng, lat);
      const fade = 0.5 + 0.5 * Math.sin(wk.s * Math.PI * 2 + wk.seed);
      ctx.fillStyle = 'rgba(190, 240, 255, 1)';
      ctx.globalAlpha = 0.45 + 0.45 * fade;
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // 环流带粒子（更淡）
    for (let i = 8; i < this.currentWalkers.length; i++) {
      const wk = this.currentWalkers[i];
      wk.s = (wk.s + wk.v * dt) % 1;
      const [lng, lat] = walkerAt(ring, wk.s);
      const [x, y] = this.proj(lng, lat);
      const fade = 0.5 + 0.5 * Math.sin(wk.s * Math.PI * 2 + wk.seed);
      ctx.fillStyle = 'rgba(170, 226, 255, 1)';
      ctx.globalAlpha = 0.16 + 0.2 * fade;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawUpwelling(t: number, dt: number) {
    // 夏季最强，冬季几乎消失；t 越大越接近冬季
    const k = Math.pow(1 - t, 1.6);
    if (k < 0.015) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 局部冷色光晕（索马里半岛东岸）
    const [gx, gy] = this.proj(47.0, 6.5);
    const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, this.w * 0.035);
    gr.addColorStop(0, `rgba(60, 175, 245, ${0.26 * k})`);
    gr.addColorStop(0.55, `rgba(45, 150, 225, ${0.13 * k})`);
    gr.addColorStop(1, 'rgba(20,90,170,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(gx - this.w * 0.04, gy - this.w * 0.04, this.w * 0.08, this.w * 0.08);

    // 3~5 条向上弧形流线：深蓝 → 青蓝渐变，模拟冷水从深层涌向海面
    const grad = ctx.createLinearGradient(0, this.proj(0, 3)[1], 0, this.proj(0, 11)[1]);
    grad.addColorStop(0, `rgba(30, 110, 200, ${0.7 * k})`);
    grad.addColorStop(0.55, `rgba(70, 185, 245, ${0.85 * k})`);
    grad.addColorStop(1, `rgba(160, 235, 255, ${0.9 * k})`);
    ctx.strokeStyle = grad;
    ctx.shadowColor = `rgba(80, 200, 255, ${0.5 * k})`;
    ctx.shadowBlur = 8;
    ctx.lineCap = 'round';
    for (const [p0, c, p1] of UPWELL_ARCS) {
      ctx.beginPath();
      const [x0, y0] = this.proj(p0[0], p0[1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i <= 24; i++) {
        const f = i / 24;
        const u = 1 - f;
        const px = u * u * p0[0] + 2 * u * f * c[0] + f * f * p1[0];
        const py = u * u * p0[1] + 2 * u * f * c[1] + f * f * p1[1];
        const [x, y] = this.proj(px, py);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // 少量向上运动的微粒（沿弧线从沿岸向海面上涌）
    for (let i = 0; i < this.upwellWalkers.length; i++) {
      const wk = this.upwellWalkers[i];
      const arcIdx = Math.floor(i / 2) % UPWELL_ARCS.length;
      wk.s = (wk.s + wk.v * dt) % 1;
      const [p0, c, p1] = UPWELL_ARCS[arcIdx];
      const f = wk.s;
      const u = 1 - f;
      const px = u * u * p0[0] + 2 * u * f * c[0] + f * f * p1[0];
      const py = u * u * p0[1] + 2 * u * f * c[1] + f * f * p1[1];
      const [x, y] = this.proj(px, py);
      const fade = 0.5 + 0.5 * Math.sin(wk.s * Math.PI * 2 + wk.seed);
      ctx.fillStyle = 'rgba(200, 242, 255, 1)';
      ctx.globalAlpha = (0.5 + 0.45 * fade) * k;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + 0.6 * fade, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawLabels(t: number) {
    const { ctx, w } = this;
    const winter = t > 0.5;
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

  redrawBase() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.base, 0, 0, w, h);
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
    // 直接读当前真实尺寸（避免 ResizeObserver 首帧缺失）
    const r = wrap.getBoundingClientRect();
    if (r.width > 10 && r.height > 10) engine.resize(r.width, r.height);
    return () => {
      engine.dispose();
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 季节 / 风速动态同步
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
