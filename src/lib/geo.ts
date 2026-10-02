export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 等距圆柱投影：x∈[0,1]，y∈[0,1]（上北下南） */
export function project(lng: number, lat: number): [number, number] {
  return [(lng + 180) / 360, (90 - lat) / 180];
}
export function unproject(x: number, y: number): [number, number] {
  return [x * 360 - 180, 90 - y * 180];
}

export type Pt = [number, number];

function wrapLng(x: number): number {
  return ((x + 540) % 360) - 180;
}

/** Chaikin 平滑，iterations 次细分，保留原路径端点（跨 ±180° 经线取最短方向） */
export function smoothPath(path: Pt[], iterations = 2): Pt[] {
  let pts = path.map((pp) => [...pp]) as Pt[];
  for (let it = 0; it < iterations; it++) {
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      let dx = b[0] - a[0];
      if (dx > 180) dx -= 360;
      if (dx < -180) dx += 360;
      const dy = b[1] - a[1];
      next.push([wrapLng(a[0] + dx * 0.25), a[1] + dy * 0.25]);
      next.push([wrapLng(a[0] + dx * 0.75), a[1] + dy * 0.75]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts.map((pp) => [wrapLng(pp[0]), pp[1]] as Pt);
}

export interface SampledPath {
  pts: Pt[];
  cum: number[]; // 累计长度（度）
  total: number;
}

/** 按步长重采样路径，返回点列与累计距离 */
export function samplePath(raw: Pt[], stepDeg = 0.6): SampledPath {
  const pts = smoothPath(raw, 2);
  const out: Pt[] = [pts[0]];
  const cum: number[] = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = out[out.length - 1];
    const [x1, y1] = pts[i];
    let dx = x1 - x0;
    let dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    // 处理跨 180° 经线：取最短方向
    if (dx > 180) dx -= 360;
    if (dx < -180) dx += 360;
    const steps = Math.max(1, Math.round(d / stepDeg));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      let lng = x0 + dx * t;
      // 归一化经度
      lng = ((lng + 540) % 360) - 180;
      const lat = y0 + dy * t;
      const last = out[out.length - 1];
      acc += Math.hypot(lng - last[0], lat - last[1]);
      out.push([lng, lat]);
      cum.push(acc);
    }
  }
  return { pts: out, cum, total: acc };
}

/** 点到折线最小距离（度），返回 [距离, 最近点参数 s∈[0,total]] */
export function distToPath(sp: SampledPath, pt: Pt): { d: number; s: number; index: number } {
  let best = { d: Infinity, s: 0, index: 0 };
  for (let i = 0; i < sp.pts.length - 1; i++) {
    const [ax, ay] = sp.pts[i];
    const [bx, by] = sp.pts[i + 1];
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = 0;
    if (len2 > 1e-9) t = clamp(((pt[0] - ax) * abx + (pt[1] - ay) * aby) / len2, 0, 1);
    const px = ax + abx * t;
    const py = ay + aby * t;
    const d = Math.hypot(pt[0] - px, pt[1] - py);
    if (d < best.d) {
      best = { d, s: sp.cum[i] + t * (sp.cum[i + 1] - sp.cum[i]), index: i };
    }
  }
  return best;
}

/** 根据累计距离取路径上的点（度坐标） */
export function pointAt(sp: SampledPath, s: number): Pt {
  const cum = sp.cum;
  if (s <= cum[0]) return sp.pts[0];
  if (s >= cum[cum.length - 1]) return sp.pts[sp.pts.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  const [ax, ay] = sp.pts[lo];
  const [bx, by] = sp.pts[hi];
  let lng = ax + (bx - ax) * t;
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;
  return [lng, ay + (by - ay) * t];
}

export function bboxOf(paths: Pt[][]): { minLng: number; maxLng: number; minLat: number; maxLat: number } | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of paths) {
    for (const [x, y] of p) {
      if (x < minLng) minLng = x;
      if (x > maxLng) maxLng = x;
      if (y < minLat) minLat = y;
      if (y > maxLat) maxLat = y;
    }
  }
  if (minLng === Infinity) return null;
  return { minLng, maxLng, minLat, maxLat };
}
