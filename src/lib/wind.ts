import type { Season } from '@/types';

export interface WindVec {
  dx: number;
  dy: number;
  strength: number;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** 平滑纬度带分段 */
function profile(lat: number): { angleRad: number; strength: number } {
  const a = Math.abs(lat);
  const n = Math.sign(lat) || 1; // 北半球 +1
  const step = (lo: number, hi: number) => smooth(Math.min(1, Math.max(0, (a - lo) / (hi - lo))));
  const inTrades = 1 - step(5, 10) - step(28, 33);
  const trades = Math.max(0, inTrades);
  const west = Math.max(0, step(28, 33) - step(58, 63));
  const polar = Math.max(0, step(58, 63));
  // 去向角（0=东, 90=南, 180=西, 270=北），风向=风吹向的方向
  let angle: number;
  if (trades >= west && trades >= polar) angle = n > 0 ? 225 : 315;
  else if (west >= polar) angle = n > 0 ? 45 : 135;
  else angle = n > 0 ? 225 : 315;
  const strength = 1.0 * trades + 0.82 * west + 0.45 * polar;
  const rad = (angle * Math.PI) / 180;
  return { angleRad: rad, strength };
}

/** 全球风场（不含季风），返回风的去向单位向量与相对强度 */
export function globalWind(lat: number): WindVec {
  const { angleRad, strength } = profile(lat);
  return { dx: Math.cos(angleRad), dy: Math.sin(angleRad), strength };
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
    // 印度：西南风（向东北，225°→45°方向为东北向即 45°）；东亚：东南风（向西北 315°）
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
  // 季风与背景风加权混合
  const w = Math.min(1, m.strength);
  return {
    dx: g.dx * (1 - w * 0.75) + m.dx * w * 0.9,
    dy: g.dy * (1 - w * 0.75) + m.dy * w * 0.9,
    strength: Math.max(g.strength, m.strength),
  };
}

export const BELT_LABELS = [
  { min: 0, max: 30, zh: '信风带', en: 'TRADES' },
  { min: 30, max: 60, zh: '西风带', en: 'WESTERLIES' },
  { min: 60, max: 90, zh: '极地东风带', en: 'POLAR EASTERLIES' },
];
