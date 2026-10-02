'use client';
import { create } from 'zustand';
import type { Mode, Season } from '@/types';

/**
 * 全局应用状态：三种使用模式、季节（影响北印度洋季风洋流与东亚季风）、
 * 形成实验的因素开关、ENSO 参考状态。各模块通过 set 更新，跨页联动。
 */
interface AppState {
  mode: Mode;
  season: Season;
  selectedCurrentId: string | null;
  windBelts: boolean;
  surfaceWind: boolean;
  coriolis: boolean;
  landBarrier: boolean;
  ensoAnomaly: number; // 东太平洋海温距平 °C，-3..3
  tradeWind: number; // 信风强度 0..100
  setMode: (m: Mode) => void;
  setSeason: (s: Season) => void;
  setSelectedCurrent: (id: string | null) => void;
  setFactor: (k: 'windBelts' | 'surfaceWind' | 'coriolis' | 'landBarrier', v: boolean) => void;
  toggleFactor: (k: 'windBelts' | 'surfaceWind' | 'coriolis' | 'landBarrier') => void;
  setEnso: (v: { anomaly?: number; tradeWind?: number }) => void;
}

export const useApp = create<AppState>((set) => ({
  mode: 'explore',
  season: 'summer',
  selectedCurrentId: null,
  windBelts: false,
  surfaceWind: false,
  coriolis: false,
  landBarrier: true,
  ensoAnomaly: 0,
  tradeWind: 65,
  setMode: (mode) => set({ mode }),
  setSeason: (season) => set({ season }),
  setSelectedCurrent: (selectedCurrentId) => set({ selectedCurrentId }),
  setFactor: (k, v) => set({ [k]: v } as Partial<AppState>),
  toggleFactor: (k) => set((s) => ({ [k]: !s[k] }) as Partial<AppState>),
  setEnso: (v) =>
    set((s) => ({
      ensoAnomaly: v.anomaly ?? s.ensoAnomaly,
      tradeWind: v.tradeWind ?? s.tradeWind,
    })),
}));
