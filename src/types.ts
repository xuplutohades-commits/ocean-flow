export type CurrentType = 'warm' | 'cold';
export type Season = 'summer' | 'winter';
export type Mode = 'explore' | 'teach' | 'lab';

export interface CurrentStats {
  lengthKm?: number;
  speed?: string;
  temp?: string;
  note?: string;
}

export interface OceanCurrent {
  id: string;
  nameZh: string;
  nameEn: string;
  type: CurrentType;
  ocean: string;
  seasonal?: boolean;
  /** 主路径（按流向排序的 [经度, 纬度]），冬夏一致时使用 */
  path: [number, number][];
  /** 夏季路径（季节性洋流） */
  summerPath?: [number, number][];
  /** 冬季路径（季节性洋流） */
  winterPath?: [number, number][];
  /** 到达终点后跟随的下一支洋流（用于漂流瓶/污染扩散模拟） */
  continuation?: string;
  formation: string;
  effects: string[];
  cases: string[];
  textbook: string;
  stats?: CurrentStats;
  /** 视觉宽度系数，主流（湾流/黑潮/西风漂流）更大 */
  width?: number;
}

export type SectionViz = 'none' | 'upwelling' | 'convergence' | 'climate-compare' | 'fog' | 'seasonal';

export interface CaseSection {
  title: string;
  body: string;
  viz?: SectionViz;
}

export interface CaseImage {
  key: string;
  url: string;
  caption: string;
  source: string;
  pageUrl: string;
  license: string;
}

export interface OceanCase {
  id: string;
  title: string;
  subtitle: string;
  currentIds: string[];
  region: { center: [number, number]; zoom?: number };
  imageKeys: string[];
  facts: { label: string; value: string }[];
  formation: string;
  sections: CaseSection[];
  teaching: string[];
  sstProfile?: { lat: number; temp: number }[];
}

