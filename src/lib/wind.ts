import type { Season } from '@/types';

export interface WindVec {
  dx: number;
  dy: number;
  strength: number;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 全球行星风带（简化但方向正确，强度平滑衔接，任何纬度都不归零）：
 *   赤道无风带     |lat| < ~3°：近静风（信风在此辐合上升，即“赤道辐合带”）
 *   信风带   5–30°：北半球东北信风（吹向西南）、南半球东南信风（吹向西北）——都吹向赤道并偏西
 *   西风带  30–58°：北半球吹向东北、南半球吹向东南——都吹向极地并偏东
 *   极地东风带 60–90°：北半球吹向西南、南半球吹向西北——都吹向赤道并偏西
 */
export function globalWind(lat: number): WindVec {
  const a = Math.abs(lat);
  const n = Math.sign(lat) || 1; // 北半球 +1
  const r = (lo: number, hi: number) => smooth(clamp01((a - lo) / (hi - lo)));
  const trades = r(3, 8) * (1 - r(22, 30));
  const west = r(28, 36) * (1 - r(55, 62));       // 西风带延伸到 ~62°
  const polar = r(62, 68) * 0.45;                 // 极地东风带靠极一方且较弱
  // 方向（dx 向东，dy 向北）：
  let dx = -0.93 * trades + 0.97 * west - 0.90 * polar;
  let dy = (-0.12 * trades + 0.10 * west - 0.24 * polar) * n;
  const m0 = Math.hypot(dx, dy);
  const m = m0 || 1;
  // 过渡带（信风↔西风、西风↔极地东风）风速接近零时给一个微弱下限，
  // 避免水粒子在风带交界处近乎停车，长时间运行后出现大片“空海”死区
  return { dx: dx / m, dy: dy / m, strength: Math.max(0.16, Math.min(1, m0)) };
}

/**
 * 水体连续性补偿：表层海水不可压缩，风在赤道和 60° 极锋处辐合时，
 * 水不会无限堆积，而是“转到”沿辐合带的方向继续流动——
 * 赤道附近向西（南北赤道流），极锋附近向东（西风漂流 / 副极地环流）。
 * 它只在盛行风开启时随 windK 缩放生效，因此“关掉风，水就停下”的因果仍成立。
 */
export function oceanDrift(lat: number): WindVec {
  const a = Math.abs(lat);
  const eq = Math.exp(-(a * a) / 18); // 赤道辐合带，半宽约 ±4°
  const pf = Math.exp(-((a - 61) * (a - 61)) / 45); // 极锋辐合带，中心 61°，半宽约 ±7°（加宽避免聚成一条线）
  return { dx: -eq + pf * 1.4, dy: 0, strength: 1 };
}

/** 地转偏向力强度因子：随纬度增强（赤道上保留少量，避免粒子原地打转） */
export function coriolisScale(lat: number): number {
  return 0.35 + 0.65 * Math.sin(Math.abs(lat) * (Math.PI / 180));
}

/** 北印度洋 + 东亚沿岸季风修正（夏季西南风、冬季东北风） */
export function monsoonWind(lng: number, lat: number, season: Season): WindVec | null {
  const inIndian = lng > 38 && lng < 100 && lat > -8 && lat < 28;
  const inEastAsia = lng > 100 && lng < 150 && lat > 14 && lat < 45;
  if (!inIndian && !inEastAsia) return null;
  const latW = smooth(Math.min(1, Math.max(0, (lat + 8) / 20)));
  const edge = smooth(Math.min(1, Math.max(0, (lng - 38) / 12))) * smooth(Math.min(1, Math.max(0, (100 - lng) / 12)));
  const strength = 1.35 * latW * (0.55 + 0.45 * edge);
  if (season === 'summer') {
    // 印度：西南风（向东北，45° 方向）；东亚：东南风（向西北，315° 方向）
    const dir = inIndian ? 45 : 315;
    const rad = (dir * Math.PI) / 180;
    return { dx: Math.cos(rad), dy: Math.sin(rad), strength };
  }
  const dir = inIndian ? 225 : 135;
  const rad = (dir * Math.PI) / 180;
  return { dx: Math.cos(rad), dy: Math.sin(rad), strength };
}

export function windAt(lng: number, lat: number, season: Season): WindVec {
  const g = globalWind(lat);
  const m = monsoonWind(lng, lat, season);
  if (!m) return g;
  // 季风与背景风加权混合（教学上行星风带为主，季风只起修饰，避免扰散信风/西风的主体流场）
  const w = Math.min(1, m.strength) * 0.6;
  return {
    dx: g.dx * (1 - w * 0.75) + m.dx * w * 0.9,
    dy: g.dy * (1 - w * 0.75) + m.dy * w * 0.9,
    strength: Math.max(g.strength, m.strength),
  };
}

export const BELT_LABELS = [
  { min: 0, max: 5, zh: '赤道无风带', en: 'DOLDRUMS' },
  { min: 5, max: 30, zh: '信风带', en: 'TRADES' },
  { min: 30, max: 60, zh: '西风带', en: 'WESTERLIES' },
  { min: 60, max: 90, zh: '极地东风带', en: 'POLAR EASTERLIES' },
];
