'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from 'react';
import { CURRENTS, CURRENT_MAP, pathOf, typeColor, seasonalType } from '@/data/currents';
import { project, unproject, samplePath, distToPath, pointAt, bboxOf, clamp, type SampledPath, type Pt } from '@/lib/geo';
import { pseudoNoise } from '@/lib/noise';
import type { OceanCurrent, Season, WindArrow } from '@/types';

const T_WARM = '#d14f1c';
const T_COLD = '#1763a6';
const T_WARM_TEXT = '#a84417';
const T_COLD_TEXT = '#135c93';
const tCol = (warm: boolean) => (warm ? T_WARM : T_COLD);

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
  seed: number;
}

interface FlowSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  tx: number; ty: number;
  span: number;
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
  spawnPool: { sp: SampledPath; warm: boolean; span: number; cum: number }[] = [];
  trackers: Tracker[] = [];
  dots: OverlayDot[] = [];
  pollutionSources: PollutionSource[] = [];
  pollAccum: Record<string, number> = {};
  hovered: string | null = null;
  land: { x: number; y: number }[][] = [];
  landReady = false;
  raf = 0;
  last = 0;
  time = 0;
  dragging = false;
  lastPt = { x: 0, y: 0 };
  disposed = false;
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
    // 海洋底色（跟随视窗的滚动可能有裁剪，这里画满即可）
    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#dfeaf3');
    g.addColorStop(0.5, '#d3e4f0');
    g.addColorStop(1, '#c2d9e9');
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);
    // 柔和光斑
    const spots: [number, number, number][] = [
      [0.22, 0.28, 0.28], [0.68, 0.4, 0.22], [0.45, 0.75, 0.24], [0.85, 0.2, 0.18],
    ];
    for (const [sx, sy, a] of spots) {
      const rg = b.createRadialGradient(sx * w, sy * h, 0, sx * w, sy * h, 0.45 * Math.min(w, h));
      rg.addColorStop(0, `rgba(255, 255, 255, ${a})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      b.fillStyle = rg;
      b.fillRect(0, 0, w, h);
    }
    // 网格
    if (this.opts.showGraticule !== false) {
      b.strokeStyle = 'rgba(60, 105, 145, 0.16)';
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
      // 赤道与回归线
      for (const [lt, col] of [[0, 'rgba(52, 120, 180, 0.32)'], [23.4, 'rgba(120, 90, 40, 0.12)'], [-23.4, 'rgba(120, 90, 40, 0.12)']] as const) {
        const y = (this.view.lat0 - lt) * this.view.scale;
        b.strokeStyle = col;
        b.beginPath(); b.moveTo(0, y); b.lineTo(w, y); b.stroke();
      }
    }
    // 陆地
    if (this.landReady) {
      b.fillStyle = '#f1ebdd';
      for (const poly of this.land) {
        b.beginPath();
        let started = false;
        for (const pt of poly) {
          const x = (pt.x * 360 - 180 - this.view.lng0) * this.view.scale;
          const y = (this.view.lat0 - (90 - pt.y * 180)) * this.view.scale;
          // 跳过超出画布过远的点（含跨 180° 断点）
          if (!started) { b.moveTo(x, y); started = true; }
          else b.lineTo(x, y);
        }
        b.closePath();
        b.fill();
      }
      // 海岸线
      b.strokeStyle = 'rgba(95, 115, 135, 0.5)';
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
    }
  }

  buildParticles() {
    this.rebuildField();
    const dense = this.opts.dense ?? 1;
    const target = Math.round(Math.min(3400, Math.max(650, (this.w * this.h) / 480)) * dense);
    const dots = this.flowDots;
    if (dots.length > target) dots.length = target;
    else while (dots.length < target) dots.push(this.spawnDot());
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

    this.drawWindBelts(ctx, w, h, season);
    this.drawWindArrows(ctx, w, h);

    // 洋流带底层（半透明路径）
    this.drawCurrentBands(ctx, w, h);

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
    const pool: { sp: SampledPath; warm: boolean; span: number; cum: number }[] = [];
    let acc = 0;
    for (const id of ids) {
      const c = CURRENT_MAP[id];
      if (!c) continue;
      const sp = samplePathCache(c, season);
      const span = c.width ?? 1;
      const warm = c.type === 'warm';
      for (let i = 0; i < sp.pts.length - 1; i++) {
        const [x1, y1] = this.proj(sp.pts[i][0], sp.pts[i][1]);
        const [x2, y2] = this.proj(sp.pts[i + 1][0], sp.pts[i + 1][1]);
        if ((x1 < -90 && x2 < -90) || (x1 > w + 90 && x2 > w + 90)) continue;
        if ((y1 < -90 && y2 < -90) || (y1 > h + 90 && y2 > h + 90)) continue;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        segs.push({ x1, y1, x2, y2, tx: dx / len, ty: dy / len, span, warm });
      }
      acc += sp.total;
      pool.push({ sp, warm, span, cum: acc });
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
  pointField(x: number, y: number): { vx: number; vy: number; warm: boolean; ok: boolean } {
    const cell = this.fieldCell;
    const g = this.fieldGrid;
    const segs = this.fieldSegs;
    if (!segs.length) return { vx: 0, vy: 0, warm: false, ok: false };
    const R = 46;
    let vx = 0, vy = 0, wt = 0, warmW = 0, coldW = 0;
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
          vx += s.tx * w;
          vy += s.ty * w;
          wt += w;
          if (s.warm) warmW += w; else coldW += w;
        }
      }
    }
    if (wt < 0.015) return { vx: 0, vy: 0, warm: false, ok: false };
    return { vx: vx / wt, vy: vy / wt, warm: warmW >= coldW, ok: true };
  }

  /** 在任意洋流路径上随机取一个出生点（屏幕坐标 + 横向抖动，模拟流体扩散） */
  spawnDot(): FlowDot {
    const pool = this.spawnPool;
    if (!pool.length) {
      return { x: -999, y: -999, age: 1e9, life: 0, len: 8, width: 1.5, warm: false, seed: 0 };
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
    return {
      x: x + Math.cos(ang) * jr,
      y: y + Math.sin(ang) * jr,
      age: Math.random() * 3,
      life: 4.5 + Math.random() * 5,
      len: 6 + Math.random() * 9,
      width: 1.15 + Math.random() * 0.85,
      warm: pick.warm,
      seed: Math.random() * 100,
    };
  }

  /** Ventusky 式流场粒子：粒子沿矢量场运动，短线段尾部淡出，长短/速度/粗细各异 */
  drawFlowField(ctx: CanvasRenderingContext2D, w: number, h: number, speedMul: number, dt: number) {
    if (this.fieldCacheKey() !== this.fieldKey) this.rebuildField();
    if (this.opts.showArrows === false) return;
    const dense = this.opts.dense ?? 1;
    const target = Math.round(Math.min(3400, Math.max(650, (w * h) / 480)) * dense);
    const dots = this.flowDots;
    if (dots.length > target) dots.length = target;
    else while (dots.length < target) dots.push(this.spawnDot());

    const base = 42 * speedMul; // 参考流速 px/s
    ctx.lineCap = 'round';
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const f = this.pointField(dot.x, dot.y);
      if (f.ok) {
        const wob = pseudoNoise(dot.x * 0.011 + this.time * 0.33, dot.seed);
        const perpX = -f.vy;
        const perpY = f.vx;
        const spd = base * (0.75 + (dot.seed % 97) / 190);
        dot.warm = f.warm;
        const vx = f.vx * spd + perpX * wob * 7;
        const vy = f.vy * spd + perpY * wob * 7;
        dot.x += vx * dt;
        dot.y += vy * dt;
        const vlen = Math.hypot(vx, vy) || 1;
        const ux = vx / vlen;
        const uy = vy / vlen;
        const tailX = dot.x - ux * dot.len;
        const tailY = dot.y - uy * dot.len;
        const midX = dot.x - ux * dot.len * 0.5;
        const midY = dot.y - uy * dot.len * 0.5;
        const fadeIn = Math.min(1, dot.age / 0.9);
        const fadeOut = Math.min(1, (dot.life - dot.age) / 1.4);
        const fade = Math.max(0, Math.min(fadeIn, fadeOut));
        if (fade > 0.01) {
          ctx.strokeStyle = dot.warm ? T_WARM : T_COLD;
          ctx.lineWidth = dot.width;
          ctx.globalAlpha = 0.2 * fade;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(midX, midY);
          ctx.stroke();
          ctx.globalAlpha = 0.78 * fade;
          ctx.beginPath();
          ctx.moveTo(midX, midY);
          ctx.lineTo(dot.x, dot.y);
          ctx.stroke();
        }
      }
      dot.age += dt * (f.ok ? 1 : 3.5);
      if (dot.age > dot.life || dot.x < -90 || dot.x > w + 90 || dot.y < -90 || dot.y > h + 90) {
        dots[i] = this.spawnDot();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  drawCurrentBands(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const season = this.opts.season ?? 'summer';
    const ids = this.opts.currentIds?.length ? this.opts.currentIds : CURRENTS.map((c) => c.id);
    const dim = this.opts.dimUnselected && this.opts.selectedId;
    for (const id of ids) {
      const c = CURRENT_MAP[id];
      if (!c) continue;
      const sp = samplePathCache(c, season);
      const col = tCol(c.type === 'warm');
      ctx.strokeStyle = col;
      ctx.globalAlpha = dim && c.id !== this.opts.selectedId ? 0.02 : 0.1;
      ctx.lineWidth = (5 + (c.width ?? 1) * 2.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      sp.pts.forEach((p, i) => {
        const [x, y] = this.proj(p[0], p[1]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
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
    for (const id of ids) {
      const c = CURRENT_MAP[id];
      if (!c) continue;
      if (this.opts.labelsOnlySelected && c.id !== this.opts.selectedId) continue;
      const p = pathOf(c, season);
      const anchor = p[Math.floor(p.length * 0.5)];
      const [x, y] = this.proj(anchor[0], anchor[1]);
      if (x < -80 || x > w + 80 || y < -40 || y > h + 40) continue;
      const scaleK = clamp(this.view.scale / 4, 0.75, 1.5);
      const fs = 11.5 * scaleK;
      const col = typeColor(seasonalType(c, season));
      const active = this.opts.selectedId === c.id;
      const dimmed = this.opts.dimUnselected && this.opts.selectedId && c.id !== this.opts.selectedId;
      if (dimmed) continue;
      ctx.font = `600 ${fs}px "PingFang SC", sans-serif`;
      const name = c.nameZh + (c.seasonal ? (season === 'summer' ? '（夏）' : '（冬）') : '');
      const tw = ctx.measureText(name).width;
      const padX = 7;
      const bh = fs + 8;
      ctx.globalAlpha = active ? 1 : 0.82;
      ctx.fillStyle = 'rgba(3, 11, 22, 0.72)';
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
      // 英文小字
      if (this.view.scale > 3.2 && !active) {
        ctx.font = `500 ${fs * 0.62}px sans-serif`;
        ctx.fillStyle = 'rgba(150, 185, 220, 0.55)';
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
