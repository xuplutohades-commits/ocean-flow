'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from 'react';
import { CURRENTS, CURRENT_MAP, pathOf, typeColor, seasonalType } from '@/data/currents';
import { project, unproject, samplePath, distToPath, pointAt, bboxOf, clamp, type SampledPath, type Pt } from '@/lib/geo';
import { pseudoNoise } from '@/lib/noise';
import type { OceanCurrent, Season, WindArrow } from '@/types';

const T_WARM = '#ed7a3a'; // 柔和暖橙
const T_COLD = '#3fa7de'; // 青蓝
const T_WARM_TEXT = '#a84417';
const T_COLD_TEXT = '#135c93';
const tCol = (warm: boolean) => (warm ? T_WARM : T_COLD);

/** 默认只显示的主要洋流；放大后其余洋流再逐步出现 */
const MAJOR_IDS = new Set([
  'kuroshio', 'northPacCurrent', 'californiaCurrent', 'oyashio',
  'gulfStream', 'northAtlanticCurrent', 'brazilCurrent', 'peruCurrent',
  'westWindS', 'agulhas', 'monsoonSummer', 'eastAustralia',
]);

export interface PollutionSource {
  lng: number;
  lat: number;
  color?: string;
  label?: string;
  rate?: number; // dots per second
  spreadDegree?: number;
}

export interface OceanMapHandle {
  focus: (id?: string | null) => void;
  reset: () => void;
  zoomBy: (f: number) => void;
  setView: (region: { center: [number, number]; zoom?: number }) => void;
  dropTracker: (opts: { lng: number; lat: number; color?: string; label?: string }) => void;
  clearTrackers: () => void;
  setPollution: (sources: PollutionSource[]) => void;
  releaseBurst: (opts: { lng: number; lat: number; count: number; color?: string; spreadDegree?: number }) => void;
}

export interface OceanMapProps {
  currentIds?: string[];
  season?: Season;
  showWindBelts?: boolean;
  showLabels?: boolean;
  showGraticule?: boolean;
  dense?: number;
  speed?: number;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onHover?: (id: string | null) => void;
  onTrackerMove?: (info: { lng: number; lat: number; currentId: string | null }) => void;
  region?: { center: [number, number]; zoom?: number };
  windArrows?: WindArrow[];
  className?: string;
  style?: React.CSSProperties;
  dimUnselected?: boolean;
  labelsOnlySelected?: boolean;
  /** 流动粒子层（默认开启；兼容旧版本 prop 名，不再绘制方向箭头） */
  showArrows?: boolean;
  pollute?: PollutionSource[];
  floatCount?: number;
}

/* ───────────────────────── 引擎 ───────────────────────── */

interface FlowDot {
  x: number;
  y: number;
  age: number;
  life: number;
  len: number;
  width: number;
  warm: boolean;
  cId: string;
  seed: number;
}

interface FlowSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  tx: number; ty: number;
  span: number;
  strength: number;
  id: string;
  warm: boolean;
}

interface Tracker {
  lng: number;
  lat: number;
  color: string;
  label: string;
  sp: SampledPath | null;
  s: number;
  trail: Pt[];
  dead: boolean;
}

interface OverlayDot {
  lng: number;
  lat: number;
  sp: SampledPath;
  s: number;
  speed: number;
  color: string;
  life: number;
  maxLife: number;
  seed: number;
  trail: Pt[];
}

type View = { lng0: number; lat0: number; scale: number };

let landPromise: Promise<{ x: number; y: number }[][]> | null = null;
function loadLand(): Promise<{ x: number; y: number }[][]> {
  if (!landPromise) {
    landPromise = fetch('/data/land.json')
      .then((r) => r.json())
      .then((geo) => {
        const polys: { x: number; y: number }[][] = [];
        for (const f of geo.features ?? []) {
          const geom = f.geometry;
          if (!geom) continue;
          if (geom.type === 'Polygon') collectRings(geom.coordinates, polys);
          else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates) collectRings(p, polys);
        }
        return polys;
      });
  }
  return landPromise;
}
function collectRings(rings: number[][][], out: { x: number; y: number }[][]) {
  for (const ring of rings) {
    if (ring.length < 3) continue;
    out.push(ring.map(([x, y]) => {
      const [px, py] = project(x, y);
      return { x: px, y: py };
    }));
  }
}

class MapEngine {
  w = 800; h = 500; dpr = 1;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  base: HTMLCanvasElement;
  view: View = { lng0: -180, lat0: 90, scale: 3 };
  target: View | null = null;
  animT = 0;
  flowDots: FlowDot[] = [];
  fieldSegs: FlowSegment[] = [];
  fieldGrid = new Map<number, number[]>();
  fieldCell = 56;
  fieldKey = '';
  spawnPool: { sp: SampledPath; warm: boolean; span: number; strength: number; id: string; cum: number }[] = [];
  trackers: Tracker[] = [];
  dots: OverlayDot[] = [];
  pollutionSources: PollutionSource[] = [];
  pollAccum: Record<string, number> = {};
  hovered: string | null = null;
  land: { x: number; y: number }[][] = [];
  landReady = false;
  maskCanvas = document.createElement('canvas');
  maskCtx: CanvasRenderingContext2D | null = this.maskCanvas.getContext('2d', { willReadFrequently: true });
  maskData: Uint8ClampedArray | null = null;
  maskCols = 0;
  maskRows = 0;
  maskReady = false;
  maskCell = 4;
  raf = 0;
  last = 0;
  time = 0;
  dragging = false;
  lastPt = { x: 0, y: 0 };
  disposed = false;
  needsFit = true; // 首次拿到真实画布尺寸时自动适配全局视图
  onTrackerMove?: OceanMapProps['onTrackerMove'];
  trackerReport = 0;

  constructor(canvas: HTMLCanvasElement, public opts: OceanMapProps) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.onTrackerMove = opts.onTrackerMove;
    loadLand().then((polys) => {
      if (this.disposed) return;
      this.land = polys;
      this.landReady = true;
      this.redrawBase();
    });
    this.view = this.fitWorld();
    this.target = null;
    this.buildParticles();
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // 构造期默认画布是 800x500，首次真实尺寸到达时重算初始视野，
    // 避免世界地图只占画布一部分、两侧露出大片空白边缘
    if (this.needsFit) {
      this.needsFit = false;
      this.view = this.fitWorld();
      this.target = null;
    }
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.base.width = Math.round(w * this.dpr);
    this.base.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.redrawBase();
    this.rebuildField();
  }

  fitWorld(): View {
    const s = Math.min(this.w / 360, this.h / 180) * 0.96;
    const clng = 0, clat = 10;
    return {
      scale: s,
      lng0: clng - this.w / (2 * s),
      lat0: clat + this.h / (2 * s),
    };
  }

  proj(lng: number, lat: number): [number, number] {
    return [(lng - this.view.lng0) * this.view.scale, (this.view.lat0 - lat) * this.view.scale];
  }

  projX(p: number): number { return p; }

  redrawBase() {
    const b = this.base.getContext('2d')!;
    const { w, h } = this;
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    b.clearRect(0, 0, w, h);
    // 深海蓝海洋底色（垂直层次），低对比、通透
    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#061524');
    g.addColorStop(0.42, '#082335');
    g.addColorStop(0.72, '#0a2d45');
    g.addColorStop(1, '#0d3a55');
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);
    // 深海青蓝微光（克制的空间层次，非热力图）
    const spots: [number, number, number, string][] = [
      [0.62, 0.32, 0.36, '86, 190, 235'],
      [0.35, 0.62, 0.33, '70, 160, 210'],
      [0.2, 0.18, 0.28, '90, 200, 240'],
      [0.85, 0.78, 0.23, '60, 150, 200'],
    ];
    for (const [sx, sy, rad, rgb] of spots) {
      const rg = b.createRadialGradient(sx * w, sy * h, 0, sx * w, sy * h, rad * Math.min(w, h));
      rg.addColorStop(0, 'rgba(' + rgb + ',0.10)');
      rg.addColorStop(1, 'rgba(' + rgb + ',0)');
      b.fillStyle = rg;
      b.fillRect(0, 0, w, h);
    }
    // 网格：极淡辅助线，不再抢视觉焦点
    if (this.opts.showGraticule !== false) {
      b.strokeStyle = 'rgba(140, 190, 230, 0.055)';
      b.lineWidth = 1;
      b.beginPath();
      for (let lg = -180; lg <= 180; lg += 30) {
        const x = (lg - this.view.lng0) * this.view.scale;
        if (x < -1 || x > w + 1) continue;
        b.moveTo(x, 0); b.lineTo(x, h);
      }
      for (let lt = -60; lt <= 90; lt += 30) {
        const y = (this.view.lat0 - lt) * this.view.scale;
        if (y < -1 || y > h + 1) continue;
        b.moveTo(0, y); b.lineTo(w, y);
      }
      b.stroke();
      for (const [lt, col] of [[0, 'rgba(120, 185, 225, 0.12)'], [23.4, 'rgba(160, 180, 150, 0.05)'], [-23.4, 'rgba(160, 180, 150, 0.05)']] as const) {
        const y = (this.view.lat0 - lt) * this.view.scale;
        b.strokeStyle = col;
        b.beginPath(); b.moveTo(0, y); b.lineTo(w, y); b.stroke();
      }
    }
    // 陆地：暗色低对比；同时生成 ocean mask（1/4 分辨率）
    if (this.landReady) {
      b.fillStyle = '#223039';
      for (const poly of this.land) {
        b.beginPath();
        let started = false;
        for (const pt of poly) {
          const x = (pt.x * 360 - 180 - this.view.lng0) * this.view.scale;
          const y = (this.view.lat0 - (90 - pt.y * 180)) * this.view.scale;
          if (!started) { b.moveTo(x, y); started = true; }
          else b.lineTo(x, y);
        }
        b.closePath();
        b.fill();
      }
      // 海岸线
      b.strokeStyle = 'rgba(150, 200, 230, 0.16)';
      b.lineWidth = 1;
      for (const poly of this.land) {
        b.beginPath();
        let started = false;
        for (const pt of poly) {
          const x = (pt.x * 360 - 180 - this.view.lng0) * this.view.scale;
          const y = (this.view.lat0 - (90 - pt.y * 180)) * this.view.scale;
          if (x < -200 || x > w + 200) { started = false; continue; }
          if (!started) { b.moveTo(x, y); started = true; } else b.lineTo(x, y);
        }
        b.stroke();
      }
      // ── ocean mask：洋流只允许出现在海上 ──
      const mc = this.maskCanvas;
      const mw = Math.max(2, Math.round(w / this.maskCell));
      const mh = Math.max(2, Math.round(h / this.maskCell));
      if (mc.width !== mw) mc.width = mw;
      if (mc.height !== mh) mc.height = mh;
      const mb = this.maskCtx!;
      mb.setTransform(1, 0, 0, 1, 0, 0);
      mb.clearRect(0, 0, mw, mh);
      mb.fillStyle = '#000';
      const k = this.view.scale / this.maskCell;
      for (const poly of this.land) {
        mb.beginPath();
        let started = false;
        for (const pt of poly) {
          const x = (pt.x * 360 - 180 - this.view.lng0) * k;
          const y = (this.view.lat0 - (90 - pt.y * 180)) * k;
          if (!started) { mb.moveTo(x, y); started = true; }
          else mb.lineTo(x, y);
        }
        mb.closePath();
        mb.fill();
      }
      const img = mb.getImageData(0, 0, mw, mh);
      this.maskData = img.data;
      this.maskCols = mw;
      this.maskRows = mh;
      this.maskReady = true;
    }
  }

  /** x/y 是否位于海洋（land mask 查询） */
  isOcean(x: number, y: number): boolean {
    if (!this.maskReady || !this.maskData) return true;
    const c = Math.max(0, Math.min(this.maskCols - 1, (x / this.maskCell) | 0));
    const r = Math.max(0, Math.min(this.maskRows - 1, (y / this.maskCell) | 0));
    return this.maskData[(r * this.maskCols + c) * 4 + 3] < 128;
  }

  buildParticles() {
    this.rebuildField();
    const lod = this.lodK();
    const dense = this.opts.dense ?? 1;
    const target = Math.round(Math.min(3600, Math.max(420, (this.w * this.h) / 620)) * Math.pow(lod, 0.7) * dense);
    const dots = this.flowDots;
    if (dots.length > target) dots.length = target;
    else while (dots.length < target) dots.push(this.spawnDot());
  }

  /** 缩放感知 LOD：全局视图稀疏，放大后密度/尾迹/速度逐步提升 */
  lodK(): number {
    return clamp(this.view.scale / 3.6, 0.4, 2.4);
  }

  setPathSeason() { this.buildParticles(); }

  focus(id?: string | null) {
    const c = id ? CURRENT_MAP[id] : null;
    if (!c) { this.target = null; this.view = this.fitWorld(); return; }
    const season = this.opts.season ?? 'summer';
    const bb = bboxOf([pathOf(c, season)]);
    if (!bb) return;
    const bw = bb.maxLng - bb.minLng || 10;
    const bh = bb.maxLat - bb.minLat || 10;
    const scale = clamp(Math.min(this.w / (bw * 1.55), this.h / (bh * 1.55)), 1.4, 260);
    const clng = (bb.minLng + bw / 2);
    const clat = (bb.minLat + bh / 2);
    this.target = {
      scale,
      lng0: clng - this.w / (2 * scale),
      lat0: clat + this.h / (2 * scale),
    };
  }

  setView(region: { center: [number, number]; zoom?: number }) {
    const scale = clamp(region.zoom ?? 5, 1, 260) * (Math.min(this.w, this.h) / 760);
    const [clng, clat] = region.center;
    this.target = { scale, lng0: clng - this.w / (2 * scale), lat0: clat + this.h / (2 * scale) };
  }

  reset() { this.target = null; }

  zoomBy(f: number, px?: number, py?: number) {
    const cx = px ?? this.w / 2;
    const cy = py ?? this.h / 2;
    const lng = (cx / this.view.scale) + this.view.lng0;
    const lat = this.view.lat0 - cy / this.view.scale;
    this.view.scale = clamp(this.view.scale * f, 0.7, 320);
    this.view.lng0 = lng - cx / this.view.scale;
    this.view.lat0 = lat + cy / this.view.scale;
    this.redrawBase();
  }

  screenToLngLat(x: number, y: number): Pt {
    return [x / this.view.scale + this.view.lng0, this.view.lat0 - y / this.view.scale];
  }

  hitTest(x: number, y: number): string | null {
    const [lng, lat] = this.screenToLngLat(x, y);
    const th = 7 / this.view.scale;
    const ids = this.opts.currentIds?.length ? this.opts.currentIds : CURRENTS.map((c) => c.id);
    const season = this.opts.season ?? 'summer';
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of ids) {
      const c = CURRENT_MAP[id];
      if (!c) continue;
      const d = distToPath(samplePathCache(c, season), [lng, lat]);
      if (d.d < th && d.d < bestD) { bestD = d.d; best = id; }
    }
    return best;
  }

  // 拖动视角
  pointerDown(x: number, y: number) { this.dragging = true; this.lastPt = { x, y }; }
  pointerMove(x: number, y: number) {
    if (this.dragging) {
      const dx = x - this.lastPt.x;
      const dy = y - this.lastPt.y;
      this.view.lng0 -= dx / this.view.scale;
      this.view.lat0 += dy / this.view.scale;
      this.lastPt = { x, y };
      this.redrawBase();
    }
  }
  pointerUp() { this.dragging = false; }

  /* ── 监测点（漂流瓶等） ── */
  dropTracker({ lng, lat, color = '#ffe08a', label = '' }: { lng: number; lat: number; color?: string; label?: string }) {
    const season = this.opts.season ?? 'summer';
    const ids = this.opts.currentIds?.length ? this.opts.currentIds : CURRENTS.map((c) => c.id);
    const all = ids.map((id) => CURRENT_MAP[id]).filter(Boolean) as OceanCurrent[];
    let bestSp: SampledPath | null = null;
    let bestS = 0;
    let bestD = Infinity;
    for (const c of all) {
      const sp = samplePathCache(c, season);
      const r = distToPath(sp, [lng, lat]);
      if (r.d < bestD) { bestD = r.d; bestSp = sp; bestS = r.s; }
    }
    this.trackers = this.trackers.filter((t) => !t.dead);
    this.trackers.push({ lng, lat, color, label, sp: bestSp, s: bestS, trail: [], dead: false });
  }
  clearTrackers() { this.trackers = []; }

  /* ── 污染扩散点 ── */
  setPollution(sources: PollutionSource[]) {
    this.pollutionSources = sources;
    this.pollAccum = {};
  }
  releaseBurst({ lng, lat, count, color = '#ffb27a', spreadDegree = 26 }: { lng: number; lat: number; count: number; color?: string; spreadDegree?: number }) {
    const season = this.opts.season ?? 'summer';
    const ids = this.opts.currentIds?.length ? this.opts.currentIds : CURRENTS.map((c) => c.id);
    const cands = ids
      .map((id) => CURRENT_MAP[id])
      .filter((c): c is OceanCurrent => !!c)
      .map((c) => ({ c, sp: samplePathCache(c, season) }));
    for (let i = 0; i < count; i++) {
      const pool = cands.filter(({ sp }) => {
        const r = distToPath(sp, [lng, lat]);
        return r.d < spreadDegree;
      });
      const pick = pool.length
        ? pool[Math.floor(Math.random() * pool.length)]
        : cands[Math.floor(Math.random() * cands.length)];
      if (!pick) return;
      const r = distToPath(pick.sp, [lng, lat]);
      this.dots.push({
        lng, lat, sp: pick.sp, s: r.s + (Math.random() - 0.5) * 2,
        speed: (3 + Math.random() * 5),
        color, life: 0, maxLife: 90 + Math.random() * 200,
        seed: Math.random() * 50, trail: [],
      });
      if (this.dots.length > 1400) this.dots.splice(0, this.dots.length - 1400);
    }
  }

  /* ── 主循环 ── */
  tick(now: number) {
    if (this.disposed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.08);
    this.last = now;
    this.time += dt;
    const { ctx, w, h } = this;

    // 平滑聚焦动画
    if (this.target) {
      const v = this.view;
      const t = this.target;
      const ease = 1 - Math.pow(0.0025, dt);
      v.lng0 += (t.lng0 - v.lng0) * ease;
      v.lat0 += (t.lat0 - v.lat0) * ease;
      v.scale += (t.scale - v.scale) * ease;
      if (Math.abs(t.scale - v.scale) < 0.03 && Math.abs(t.lng0 - v.lng0) < 0.02) {
        this.view = t; this.target = null;
      }
      this.redrawBase();
    }

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.base, 0, 0, w, h);

    const season = this.opts.season ?? 'summer';
    const speedMul = this.opts.speed ?? 1;
    const dim = this.opts.dimUnselected && this.opts.selectedId;

    // 背景层的轻微水面流动感（低振幅动态纹理）
    this.drawWaterTexture(ctx, w, h);

    this.drawWindBelts(ctx, w, h, season);
    this.drawWindArrows(ctx, w, h);

    // Ventusky 式粒子流场：大量短促半透明流线粒子沿矢量场运动
    this.drawFlowField(ctx, w, h, speedMul, dt);

    // 污染扩散点
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.life += dt;
      if (d.life > d.maxLife || d.sp.total === 0) { this.dots.splice(i, 1); continue; }
      d.s += d.speed * dt;
      if (d.s > d.sp.total) {
        const c = this.currentOfSample(d.sp);
        const cont = c?.continuation;
        if (cont && CURRENT_MAP[cont]) {
          d.sp = samplePathCache(CURRENT_MAP[cont], season);
          d.s = 0;
        } else {
          this.dots.splice(i, 1);
          continue;
        }
      }
      const pt = pointAt(d.sp, d.s);
      d.lng = pt[0]; d.lat = pt[1];
      const [x, y] = this.proj(pt[0], pt[1]);
      d.trail.push([x, y]);
      if (d.trail.length > 5) d.trail.shift();
      const fade = 1 - d.life / d.maxLife;
      ctx.globalAlpha = 0.25 + 0.55 * fade;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      if (d.trail.length > 1) {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.35 * fade;
        ctx.beginPath();
        d.trail.forEach((t, idx) => (idx === 0 ? ctx.moveTo(t[0], t[1]) : ctx.lineTo(t[0], t[1])));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 污染源持续释放
    for (const src of this.pollutionSources) {
      const key = `${src.lng},${src.lat}`;
      const rate = src.rate ?? 2.2;
      const acc = (this.pollAccum[key] ?? 0) + rate * dt;
      const n = Math.floor(acc);
      if (n > 0) {
        this.pollAccum[key] = acc - n;
        this.releaseBurst({ lng: src.lng, lat: src.lat, count: Math.min(n, 8), color: src.color ?? '#ffb27a', spreadDegree: src.spreadDegree ?? 26 });
      }
    }

    // 监测点（漂流瓶）
    for (const t of this.trackers) {
      if (t.sp) {
        t.s += (t.sp.total / 80) * speedMul * dt;
        if (t.s > t.sp.total) {
          const c = this.currentOfSample(t.sp);
          const cont = c?.continuation;
          if (cont && CURRENT_MAP[cont]) {
            t.sp = samplePathCache(CURRENT_MAP[cont], season);
            t.s = 0;
          } else t.dead = true;
        }
        if (!t.dead) {
          const pt = pointAt(t.sp, t.s);
          t.lng = pt[0]; t.lat = pt[1];
        }
      }
      t.trail.push([t.lng, t.lat]);
      if (t.trail.length > 90) t.trail.shift();
      const [x, y] = this.proj(t.lng, t.lat);
      // 轨迹
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      t.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(...this.proj(p[0], p[1])) : ctx.lineTo(...this.proj(p[0], p[1]))));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // 标记
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 3);
      ctx.globalAlpha = 0.25 * pulse;
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#041221';
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
      if (t.label && this.view.scale > 1.6) {
        ctx.font = '600 11px sans-serif';
        const tw = ctx.measureText(t.label).width;
        ctx.fillStyle = 'rgba(3,12,24,0.75)';
        ctx.beginPath();
        ctx.roundRect(x - tw / 2 - 7, y - 26, tw + 14, 17, 5);
        ctx.fill();
        ctx.fillStyle = t.color;
        ctx.fillText(t.label, x - tw / 2, y - 14);
      }
    }

    // 标签
    if (this.opts.showLabels !== false) this.drawLabels(ctx, w, h);

    // 悬停高亮
    if (this.hovered && this.opts.interactive) {
      const c = CURRENT_MAP[this.hovered];
      if (c) {
        const sp = samplePathCache(c, season);
        ctx.strokeStyle = typeColor(seasonalType(c, season));
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        sp.pts.forEach((p, i) => {
          const [x, y] = this.proj(p[0], p[1]);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // 监测点位置上报（节流）
    this.trackerReport += dt;
    if (this.trackerReport > 0.35 && this.onTrackerMove && this.trackers.length) {
      this.trackerReport = 0;
      const t = this.trackers[this.trackers.length - 1];
      this.onTrackerMove({ lng: t.lng, lat: t.lat, currentId: t.sp ? this.currentOfSample(t.sp)?.id ?? null : null });
    }

    this.raf = requestAnimationFrame((n) => this.tick(n));
  }

  currentOfSample(sp: SampledPath): OceanCurrent | undefined {
    return this.sampleOwner.get(sp);
  }

  sampleOwner = new Map<SampledPath, OceanCurrent>();

  /** 流场缓存键：视窗变化超过阈值才重建（拖动/缩放/聚焦动画期间自动重建） */
  fieldCacheKey(): string {
    const s = this.view.scale;
    return (
      this.w + 'x' + this.h + '|' +
      Math.round(s * 50) + '|' +
      Math.round((this.view.lng0 * s) / 3) + '|' +
      Math.round((this.view.lat0 * s) / 3)
    );
  }

  /** 由洋流路径构建二维矢量场（屏幕空间）：路径细分为线段，落入空间网格 */
  rebuildField() {
    const { w, h } = this;
    const season = this.opts.season ?? 'summer';
    const ids = this.opts.currentIds?.length ? this.opts.currentIds : CURRENTS.map((c) => c.id);
    const segs: FlowSegment[] = [];
    const pool: { sp: SampledPath; warm: boolean; span: number; strength: number; id: string; cum: number }[] = [];
    let acc = 0;
    for (const id of ids) {
      const c = CURRENT_MAP[id];
      if (!c) continue;
      const sp = samplePathCache(c, season);
      const span = c.width ?? 1;
      const warm = c.type === 'warm';
      // 强弱洋流：速度、轨迹长度、出生密度都随 strength 缩放
      const strength = 0.55 + span * 0.55;
      for (let i = 0; i < sp.pts.length - 1; i++) {
        const [x1, y1] = this.proj(sp.pts[i][0], sp.pts[i][1]);
        const [x2, y2] = this.proj(sp.pts[i + 1][0], sp.pts[i + 1][1]);
        if ((x1 < -90 && x2 < -90) || (x1 > w + 90 && x2 > w + 90)) continue;
        if ((y1 < -90 && y2 < -90) || (y1 > h + 90 && y2 > h + 90)) continue;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        // 经度环绕：边缘线段在另一侧复制一份，粒子跨边时不穿出地图
        const pushSeg = (ox: number) =>
          segs.push({ x1: x1 + ox, y1, x2: x2 + ox, y2, tx: dx / len, ty: dy / len, span, strength, id, warm });
        pushSeg(0);
        const m = 130;
        if (x1 < m || x2 < m) pushSeg(w);
        if (x1 > w - m || x2 > w - m) pushSeg(-w);
      }
      acc += sp.total * (0.7 + span * 0.5);
      pool.push({ sp, warm, span, strength, id, cum: acc });
    }
    this.fieldCell = 56;
    this.fieldSegs = segs;
    this.spawnPool = pool;
    this.fieldGrid.clear();
    const cell = this.fieldCell;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const cx0 = Math.floor(Math.min(s.x1, s.x2) / cell);
      const cx1 = Math.floor(Math.max(s.x1, s.x2) / cell);
      const cy0 = Math.floor(Math.min(s.y1, s.y2) / cell);
      const cy1 = Math.floor(Math.max(s.y1, s.y2) / cell);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const key = (cy + 4096) * 16384 + (cx + 4096);
          const bucket = this.fieldGrid.get(key);
          if (bucket) bucket.push(i);
          else this.fieldGrid.set(key, [i]);
        }
      }
    }
    this.fieldKey = this.fieldCacheKey();
  }

  /** 采样某屏幕点的流场：归一化流向 + 冷暖占优色（高斯衰减，自然过渡到邻近洋流） */
  pointField(x: number, y: number): { vx: number; vy: number; warm: boolean; ok: boolean; strength: number; cId: string; weight: number } {
    const cell = this.fieldCell;
    const g = this.fieldGrid;
    const segs = this.fieldSegs;
    if (!segs.length) return { vx: 0, vy: 0, warm: false, ok: false, strength: 1, cId: '', weight: 0 };
    const R = 46;
    let vx = 0, vy = 0, wt = 0, warmW = 0, coldW = 0;
    let bestId = '', bestW = 0, bestSt = 1;
    const cx0 = Math.floor(x / cell) - 1;
    const cy0 = Math.floor(y / cell) - 1;
    for (let cx = cx0; cx <= cx0 + 2; cx++) {
      for (let cy = cy0; cy <= cy0 + 2; cy++) {
        const bucket = g.get((cy + 4096) * 16384 + (cx + 4096));
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const s = segs[bucket[k]];
          const abx = s.x2 - s.x1;
          const aby = s.y2 - s.y1;
          const len2 = abx * abx + aby * aby;
          let t = 0;
          if (len2 > 1e-9) t = Math.max(0, Math.min(1, ((x - s.x1) * abx + (y - s.y1) * aby) / len2));
          const px = s.x1 + abx * t;
          const py = s.y1 + aby * t;
          const d = Math.hypot(x - px, y - py);
          if (d > R) continue;
          const w = Math.exp(-(d * d) / 450) * (0.65 + 0.35 * s.span);
          if (w > bestW) { bestW = w; bestId = s.id; bestSt = s.strength; }
          vx += s.tx * w;
          vy += s.ty * w;
          wt += w;
          if (s.warm) warmW += w; else coldW += w;
        }
      }
    }
    if (wt < 0.015) return { vx: 0, vy: 0, warm: false, ok: false, strength: 1, cId: '', weight: 0 };
    return { vx: vx / wt, vy: vy / wt, warm: warmW >= coldW, ok: true, strength: bestSt, cId: bestId, weight: Math.min(1.4, wt) };
  }

  /** 在任意洋流路径上随机取一个出生点（屏幕坐标 + 横向抖动，模拟流体扩散） */
  spawnDot(): FlowDot {
    const pool = this.spawnPool;
    if (!pool.length) {
      return { x: -999, y: -999, age: 1e9, life: 0, len: 8, width: 1.5, warm: false, cId: '', seed: 0 };
    }
    const total = pool[pool.length - 1].cum;
    const r = Math.random() * total;
    let pick = pool[0];
    for (const p of pool) {
      if (r <= p.cum) { pick = p; break; }
    }
    const [lng, lat] = pointAt(pick.sp, Math.random() * pick.sp.total);
    const [x, y] = this.proj(lng, lat);
    const ang = Math.random() * Math.PI * 2;
    const jr = Math.random() * 26;
    let sx = x + Math.cos(ang) * jr;
    let sy = y + Math.sin(ang) * jr;
    // 出生点落在陆地上则重试，保证粒子从海洋出生
    if (this.maskReady) {
      for (let t = 0; t < 8; t++) {
        if (this.isOcean(sx, sy)) break;
        sx = x + Math.cos(ang + t * 0.9) * (jr * (t + 1));
        sy = y + Math.sin(ang + t * 0.9) * (jr * (t + 1));
      }
    }
    return {
      x: sx,
      y: sy,
      age: Math.random() * 3,
      life: 4.5 + Math.random() * 5,
      len: 6 + Math.random() * 9,
      width: 1.15 + Math.random() * 0.85,
      warm: pick.warm,
      cId: pick.id,
      seed: Math.random() * 100,
    };
  }

  /** 海洋底层的轻微水面流动感：低振幅缓漂波纹 + 柔和反光，纯背景层 */
  drawWaterTexture(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const t = this.time;
    // 淡白缓漂波纹（大波长，浅浅起伏）
    for (let k = 0; k < 3; k++) {
      const y0 = ((t * (10 + k * 4) + k * 190) % (h + 320)) - 160;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = y0 + Math.sin(x * 0.008 + t * 0.22 + k * 2.1) * 26 + Math.sin(x * 0.021 + t * 0.13 + k) * 9;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(160,220,250,' + (0.02 + k * 0.005) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 淡蓝细波纹，反向缓漂
    for (let k = 0; k < 2; k++) {
      const y0 = ((h + 320) - ((t * (7 + k * 3) + k * 97) % (h + 320))) - 160;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = y0 + Math.sin(x * 0.013 + t * 0.18 + k * 3.3) * 18;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(70,150,210,' + (0.018 + k * 0.006) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 柔和反光斑缓慢移动
    const px = ((t * 6.5) % (w + 600)) - 300;
    const py = ((h * 0.35 + t * 4.2) % (h + 400)) - 200;
    const rg = ctx.createRadialGradient(px, py, 0, px, py, 380);
    rg.addColorStop(0, 'rgba(140,220,255,0.04)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }

  /** Ventusky 式流场粒子：柔和彗尾渲染（lighter 叠加），zoom-aware + ocean mask + 经度环绕 */
  drawFlowField(ctx: CanvasRenderingContext2D, w: number, h: number, speedMul: number, dt: number) {
    if (this.fieldCacheKey() !== this.fieldKey) this.rebuildField();
    if (this.opts.showArrows === false) return;
    const dense = this.opts.dense ?? 1;
    const lod = this.lodK();
    const target = Math.round(Math.min(3600, Math.max(420, (w * h) / 620)) * Math.pow(lod, 0.7) * dense);
    const dots = this.flowDots;
    if (dots.length > target) dots.length = target;
    else while (dots.length < target) dots.push(this.spawnDot());

    const base = 48 * speedMul * (0.65 + 0.65 * lod); // zoom 决定流速观感
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const f = this.pointField(dot.x, dot.y);
      if (f.ok) {
        const wob = pseudoNoise(dot.x * 0.011 + this.time * 0.33, dot.seed);
        const perpX = -f.vy;
        const perpY = f.vx;
        const st = f.strength;
        dot.warm = f.warm;
        dot.cId = f.cId;
        const spd = base * st * (0.72 + (dot.seed % 97) / 210);
        const effLen = dot.len * (0.6 + st * 0.4) * (0.55 + 0.45 * lod);
        const vx = f.vx * spd + perpX * wob * 7;
        const vy = f.vy * spd + perpY * wob * 7;
        const nx = dot.x + vx * dt;
        const ny = dot.y + vy * dt;
        // 经度环绕：跨地图边缘时换到另一侧，不穿出地图
        dot.x = nx > w + 40 ? nx - w : (nx < -40 ? nx + w : nx);
        dot.y = ny;
        // ocean mask：离开海洋立即重生
        if (!this.isOcean(dot.x, dot.y)) {
          dots[i] = this.spawnDot();
          continue;
        }
        const vlen = Math.hypot(vx, vy) || 1;
        const ux = vx / vlen;
        const uy = vy / vlen;
        const fadeIn = Math.min(1, dot.age / 1.0);
        const fadeOut = Math.min(1, (dot.life - dot.age) / 2.4);
        let fade = Math.max(0, Math.min(fadeIn, fadeOut));
        if (this.opts.dimUnselected && this.opts.selectedId && f.cId !== this.opts.selectedId) fade *= 0.16;
        // 边缘渐隐：离开流场核心越远越透明（密度/透明度梯度）
        fade *= 0.28 + 0.72 * Math.min(1, f.weight);
        if (fade <= 0.02) continue;
        const col = dot.warm ? T_WARM : T_COLD;
        ctx.strokeStyle = col;
        ctx.lineWidth = dot.width * clamp(lod * 0.85, 0.6, 1.7);
        // 柔和彗尾：4 段渐次淡出的短尾叠加 → 流动感而非独立短线
        for (let s = 1; s <= 4; s++) {
          const t1 = s / 4;
          const t0 = (s - 1) / 4;
          ctx.globalAlpha = fade * (0.028 + 0.1 * t1);
          ctx.beginPath();
          ctx.moveTo(dot.x - ux * effLen * t0, dot.y - uy * effLen * t0);
          ctx.lineTo(dot.x - ux * effLen * t1, dot.y - uy * effLen * t1);
          ctx.stroke();
        }
        // 头部一个柔亮小点，让流向可读
        ctx.globalAlpha = fade * 0.15;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.width * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
      dot.age += dt * (f.ok ? 1 : 3.5);
      if (dot.age > dot.life || dot.x < -120 || dot.x > w + 120 || dot.y < -120 || dot.y > h + 120) {
        dots[i] = this.spawnDot();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt';
  }

  drawWindBelts(ctx: CanvasRenderingContext2D, w: number, h: number, season: Season) {
    if (!this.opts.showWindBelts) return;
    const bands = [
      { min: 0, max: 30, zh: '信风带', en: 'TRADE WINDS', dirN: 225, dirS: 135 },
      { min: 30, max: 60, zh: '西风带', en: 'WESTERLIES', dirN: 45, dirS: 315 },
      { min: 60, max: 90, zh: '极地东风带', en: 'POLAR EASTERLIES', dirN: 225, dirS: 135 },
    ];
    for (const b of bands) {
      // 北半球
      this.fillBand(ctx, b.min, b.max, 'rgba(94,200,255,0.045)', this.view);
      this.fillBand(ctx, -b.max, -b.min, 'rgba(94,200,255,0.045)', this.view);
      for (const hem of [1, -1]) {
        const dir = hem === 1 ? b.dirN : b.dirS;
        const mLat = ((b.min + b.max) / 2) * hem;
        for (let lng = -150; lng <= 150; lng += 45) {
          this.drawArrow(ctx, this.proj(lng, mLat), dir, hem === 1 && lng === -150 ? b.en + ' ' + b.zh : '');
        }
      }
      // 纬度带标注
      const yN = (this.view.lat0 - 30) * this.view.scale;
      if (yN > 0 && yN < h) {
        ctx.fillStyle = 'rgba(140,180,220,0.5)';
        ctx.font = '500 10px sans-serif';
        ctx.fillText('北纬 30°', 8, yN - 5);
      }
    }
    // 季风区提示（北印度洋）
    if (this.opts.windArrows?.length) return;
  }

  fillBand(ctx: CanvasRenderingContext2D, min: number, max: number, color: string, view: View) {
    const y0 = (view.lat0 - Math.max(min, max)) * view.scale;
    const y1 = (view.lat0 - Math.min(min, max)) * view.scale;
    ctx.fillStyle = color;
    ctx.fillRect(0, y0, this.w, y1 - y0);
  }

  drawArrow(ctx: CanvasRenderingContext2D, [x, y]: [number, number], dirDeg: number, label: string) {
    if (x < -40 || x > this.w + 40 || y < -40 || y > this.h + 40) return;
    const rad = (dirDeg * Math.PI) / 180;
    const len = 0.32 * this.view.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad);
    ctx.strokeStyle = 'rgba(160, 220, 255, 0.4)';
    ctx.fillStyle = 'rgba(160, 220, 255, 0.5)';
    ctx.lineWidth = 1;
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 2 + x * 0.03);
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(len / 2, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len / 2, 0);
    ctx.lineTo(len / 2 - 4, -3.2);
    ctx.lineTo(len / 2 - 4, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    if (label) {
      ctx.fillStyle = 'rgba(150, 200, 240, 0.75)';
      ctx.font = '600 10px sans-serif';
      ctx.fillText(label, x + len, y - 4);
    }
  }

  drawWindArrows(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const ar = this.opts.windArrows;
    if (!ar?.length) return;
    for (const a of ar) {
      const [x, y] = this.proj(a.lng, a.lat);
      if (x < -60 || x > w + 60 || y < -60 || y > h + 60) continue;
      const len = (26 + a.strength * 0.9) * (this.view.scale / 4.2);
      const rad = (a.dir * Math.PI) / 180;
      const wob = 0.12 * Math.sin(this.time * 2.2 + a.lng);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rad + wob);
      const alpha = 0.5 + 0.3 * a.strength / 100;
      const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
      grad.addColorStop(0, `rgba(150, 225, 255, ${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(150, 225, 255, ${alpha})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.fillStyle = `rgba(190, 235, 255, ${alpha + 0.2})`;
      ctx.beginPath();
      ctx.moveTo(len / 2, 0);
      ctx.lineTo(len / 2 - 6, -4.5);
      ctx.lineTo(len / 2 - 6, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (a.label) {
        ctx.font = '600 10.5px sans-serif';
        ctx.fillStyle = 'rgba(190, 230, 255, 0.85)';
        const tw = ctx.measureText(a.label).width;
        ctx.fillStyle = 'rgba(4,14,28,0.7)';
        ctx.beginPath();
        ctx.roundRect(x - tw / 2 - 6, y - 30, tw + 12, 16, 4);
        ctx.fill();
        ctx.fillStyle = '#cfeaff';
        ctx.fillText(a.label, x - tw / 2, y - 19);
      }
    }
  }

  drawLabels(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const season = this.opts.season ?? 'summer';
    const ids = this.opts.currentIds?.length ? this.opts.currentIds : CURRENTS.map((c) => c.id);
    const lod = this.lodK();
    const subset = !!this.opts.currentIds?.length; // 子图（档案馆/实验）保留全部标签
    for (const id of ids) {
      const c = CURRENT_MAP[id];
      if (!c) continue;
      const active = this.opts.selectedId === c.id;
      const major = MAJOR_IDS.has(id);
      // 全球页默认只显示主要洋流；放大后其余洋流逐步出现；选中/交互总是显示
      if (!active && !major && !subset && lod < 1.9) continue;
      if (this.opts.labelsOnlySelected && !active) continue;
      const p = pathOf(c, season);
      const anchor = p[Math.floor(p.length * 0.5)];
      const [x, y] = this.proj(anchor[0], anchor[1]);
      if (x < -80 || x > w + 80 || y < -40 || y > h + 40) continue;
      const scaleK = clamp(this.view.scale / 4, 0.75, 1.5);
      const fs = 11.5 * scaleK;
      const col = typeColor(seasonalType(c, season));
      const dimmed = this.opts.dimUnselected && this.opts.selectedId && c.id !== this.opts.selectedId;
      const alpha = active ? 1 : (dimmed ? 0.3 : 0.82);
      ctx.font = '600 ' + fs + 'px "PingFang SC", sans-serif';
      const name = c.nameZh + (c.seasonal ? (season === 'summer' ? '（夏）' : '（冬）') : '');
      const tw = ctx.measureText(name).width;
      const padX = 7;
      const bh = fs + 8;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(2, 8, 16, 0.62)';
      ctx.beginPath();
      ctx.roundRect(x - tw / 2 - padX, y - bh / 2, tw + padX * 2, bh, 6);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.fillText(name, x - tw / 2, y + fs * 0.34);
      ctx.globalAlpha = 1;
      // 英文小字（主要/选中/子图或放大时）
      if (this.view.scale > 3.2 && !active && (major || subset || lod >= 1.9)) {
        ctx.font = '500 ' + (fs * 0.62) + 'px sans-serif';
        ctx.fillStyle = 'rgba(140, 180, 215, 0.5)';
        ctx.fillText(c.nameEn.slice(0, 26), x - tw / 2, y + bh / 2 + fs * 0.62);
      }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
  }
}

const pathCache = new Map<string, SampledPath>();
function samplePathCache(c: OceanCurrent, season: Season): SampledPath {
  const key = c.id + season;
  let sp = pathCache.get(key);
  if (!sp) {
    sp = samplePath(pathOf(c, season), 0.5);
    pathCache.set(key, sp);
  }
  return sp;
}

/* ───────────────────────── React 组件 ───────────────────────── */

export const OceanMap = forwardRef<OceanMapHandle, OceanMapProps>(function OceanMap(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const optsRef = useRef(props);
  optsRef.current = props;
  // 引擎持有的 props 需要在每次渲染时同步，滑块/开关/季节才能即时生效
  if (engineRef.current) engineRef.current.opts = props;

  useImperativeHandle(ref, () => ({
    focus: (id) => engineRef.current?.focus(id),
    reset: () => engineRef.current?.reset(),
    zoomBy: (f) => engineRef.current?.zoomBy(f),
    setView: (r) => engineRef.current?.setView(r),
    dropTracker: (o) => engineRef.current?.dropTracker(o),
    clearTrackers: () => engineRef.current?.clearTrackers(),
    setPollution: (s) => engineRef.current?.setPollution(s),
    releaseBurst: (o) => engineRef.current?.releaseBurst(o),
  }));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new MapEngine(canvas, optsRef.current);
    engineRef.current = engine;
    // 需要把采样路径与洋流对应起来
    const season = props.season ?? 'summer';
    const ids = props.currentIds?.length ? props.currentIds : CURRENTS.map((c) => c.id);
    for (const id of ids) {
      const c = CURRENT_MAP[id];
      if (!c) continue;
      engine.sampleOwner.set(samplePathCache(c, season), c);
    }
    engine.raf = requestAnimationFrame((n) => { engine.last = n; engine.tick(n); });

    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      if (r.width > 10 && r.height > 10 && (Math.abs(r.width - engine.w) > 1 || Math.abs(r.height - engine.h) > 1)) {
        engine.resize(r.width, r.height);
      }
    });
    ro.observe(wrap);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      engine.zoomBy(Math.exp(-e.deltaY * 0.0011), x, y);
    };
    const onDown = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      engine.pointerDown(e.clientX - r.left, e.clientY - r.top);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      engine.pointerMove(x, y);
      if (props.interactive) {
        const hit = engine.hitTest(x, y);
        if (hit !== engine.hovered) {
          engine.hovered = hit;
          props.onHover?.(hit);
          wrap.style.cursor = hit ? 'pointer' : 'grab';
        }
      }
    };
    const onUp = () => engine.pointerUp();
    const onClick = (e: MouseEvent) => {
      if (!props.interactive) return;
      const r = wrap.getBoundingClientRect();
      const hit = engine.hitTest(e.clientX - r.left, e.clientY - r.top);
      props.onSelect?.(hit);
    };
    const onDbl = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      engine.zoomBy(1.8, x, y);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDbl);

    const ro2 = new ResizeObserver(() => {});
    return () => {
      engine.dispose();
      ro.disconnect();
      ro2.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('dblclick', onDbl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 响应属性变化
  useEffect(() => { engineRef.current?.setPathSeason(); }, [props.season]);
  useEffect(() => { engineRef.current?.buildParticles(); }, [props.currentIds, props.dense]);
  useEffect(() => { engineRef.current?.setPollution(props.pollute ?? []); }, [props.pollute]);
  useEffect(() => { if (engineRef.current) engineRef.current.onTrackerMove = props.onTrackerMove; }, [props.onTrackerMove]);
  const isDrag = useRef(false);

  return (
    <div ref={wrapRef} className={`map-shell ${props.className ?? ''}`} style={props.style}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 z-10" onPointerDown={(e) => e.stopPropagation()}>
        <button className="w-8 h-8 rounded-[9px] border border-[rgba(126,190,255,0.25)] bg-[rgba(6,18,34,0.75)] text-[#cfe0f2] text-sm hover:bg-[rgba(20,50,84,0.8)]"
          onClick={() => engineRef.current?.zoomBy(1.5)} aria-label="放大">＋</button>
        <button className="w-8 h-8 rounded-[9px] border border-[rgba(126,190,255,0.25)] bg-[rgba(6,18,34,0.75)] text-[#cfe0f2] text-sm hover:bg-[rgba(20,50,84,0.8)]"
          onClick={() => engineRef.current?.zoomBy(1 / 1.5)} aria-label="缩小">−</button>
        <button className="w-8 h-8 rounded-[9px] border border-[rgba(126,190,255,0.25)] bg-[rgba(6,18,34,0.75)] text-[#cfe0f2] text-[11px] hover:bg-[rgba(20,50,84,0.8)]"
          onClick={() => engineRef.current?.reset()} aria-label="复位">◎</button>
      </div>
    </div>
  );
});

export { samplePathCache, typeColor };
