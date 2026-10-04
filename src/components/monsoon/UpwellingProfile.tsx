'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { clamp, lerp } from '@/lib/geo';
import type { Season } from '@/types';

/* ═══════════════════════════════════════════════════════════════
   垂直剖面分步演示：风 → 表层海水 → 沿岸上升流
   - 不画整张陆海地图，只画垂直于海岸的剖面：左边索马里大陆，右边海洋。
   - 三步依次播放（每步约 3.6s），不同时出现：
       ① 风：少量轻柔箭头扫过（代表季风风向），停风后消失
       ② 表层海水：稀疏蓝色粒子被带动（夏：离岸 / 冬：向岸）
       ③ 上升流：沿岸深层冷水垂直上泛（夏强 / 冬停）
   ═══════════════════════════════════════════════════════════════ */

export type StageId = 0 | 1 | 2;

interface WindArrow { x: number; y: number; life: number; speed: number; seed: number; }
interface WaterDot { x: number; y: number; speed: number; seed: number; }
interface UpwellDot { x: number; y: number; speed: number; seed: number; }

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

const STAGE_SEC = 3.6;
const CHAIN = ['风', '表层海水', '上升流'];

export default function UpwellingProfile({
  season,
  className,
  style,
}: {
  season: Season;
  className?: string;
  style?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seasonRef = useRef(season);
  seasonRef.current = season;
  const [mode, setMode] = useState<'auto' | StageId>('auto');
  const [stage, setStage] = useState<StageId>(0);
  const [playing, setPlaying] = useState(true);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const stampRef = useRef(0);
  const playRef = useRef(playing);
  playRef.current = playing;
  const onStageRef = useRef<(s: StageId) => void>(() => {});
  onStageRef.current = setStage;

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let time = 0;        // 累计秒（自动循环 & 手动步骤共用）
    let manualT0 = 0;    // 上次手动切换到某一步的时刻
    let s = season === 'winter' ? 1 : 0;
    let lastStage = -1;
    let lastStamp = -1;
    let arrows: WindArrow[] = [];
    let waters: WaterDot[] = [];
    let ups: UpwellDot[] = [];

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(120, r.width);
      h = Math.max(220, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      arrows = [];
      waters = [];
      ups = [];
      for (let i = 0; i < 6; i++) arrows.push({ x: Math.random() * w, y: h * (0.14 + Math.random() * 0.15), life: Math.random(), speed: 26 + Math.random() * 18, seed: Math.random() * 100 });
      for (let i = 0; i < 46; i++) waters.push({ x: Math.random() * w, y: Math.random(), speed: 16 + Math.random() * 14, seed: Math.random() * 100 });
      for (let i = 0; i < 26; i++) ups.push({ x: Math.random(), y: Math.random(), speed: 34 + Math.random() * 26, seed: Math.random() * 100 });
    };

    /* ── 当前步骤与步骤内进度 ── */
    const stageInfo = (): { st: StageId; tau: number; auto: boolean } => {
      const m = modeRef.current;
      if (m === 'auto') {
        const cyc = time % (STAGE_SEC * 3);
        const st = Math.floor(cyc / STAGE_SEC) as StageId;
        return { st, tau: cyc - st * STAGE_SEC, auto: true };
      }
      return { st: m, tau: time - manualT0, auto: false };
    };

    const frame = (now: number) => {
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      if (playRef.current) time += dt;
      if (stampRef.current !== lastStamp) { lastStamp = stampRef.current; manualT0 = time; }
      const targetS = seasonRef.current === 'summer' ? 0 : 1;
      s += (targetS - s) * (1 - Math.exp(-dt * 2.2));
      const { st: stage, tau, auto } = stageInfo();
      if (stage !== lastStage) { lastStage = stage; onStageRef.current(stage); }

      /* 视觉层开关：保证分步、不同时出现。
         自动模式：每步渐进进入、风在步骤末尾淡出；
         手动模式（点击步骤）：立即满强度显示该层。 */
      const tauEff = auto ? tau : 1e9;
      const gWind = stage === 0 ? (auto ? clamp((STAGE_SEC - tau) / 0.7, 0, 1) : 1) : 0;
      const gWater = stage >= 1 ? smoothstep(0, 1.3, tauEff) : 0;
      const gUp = stage >= 2 ? smoothstep(0, 1.8, tauEff) : 0;

      ctx.clearRect(0, 0, w, h);
      const ySurf = h * 0.38;
      const landW = w * 0.16;
      const seaBot = h * 0.97;

      /* 天空 */
      const sky = ctx.createLinearGradient(0, 0, 0, ySurf);
      sky.addColorStop(0, '#060f1c');
      sky.addColorStop(1, 'rgba(7, 26, 46, 0.45)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, ySurf);

      /* 海洋 */
      const sea = ctx.createLinearGradient(0, ySurf, 0, h);
      sea.addColorStop(0, '#0d4a68');
      sea.addColorStop(0.35, '#0a3855');
      sea.addColorStop(1, '#051f33');
      ctx.fillStyle = sea;
      ctx.fillRect(landW, ySurf, w - landW, h - ySurf);

      /* 大陆坡示意线 */
      ctx.strokeStyle = 'rgba(90, 150, 190, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(landW + 2, ySurf + (h - ySurf) * 0.4);
      ctx.lineTo(w, seaBot - (h - ySurf) * 0.1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '11px "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(120, 175, 210, 0.55)';
      ctx.fillText('深层冷水', landW + 26, h - (h - ySurf) * 0.34);

      /* 左侧大陆（剖面） */
      const lg = ctx.createLinearGradient(0, 0, landW, 0);
      lg.addColorStop(0, '#20323b');
      lg.addColorStop(1, '#2c4249');
      ctx.fillStyle = lg;
      ctx.fillRect(0, ySurf, landW, h - ySurf);
      ctx.strokeStyle = 'rgba(150, 190, 210, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(landW, ySurf);
      ctx.lineTo(landW, h);
      ctx.stroke();
      ctx.save();
      ctx.translate(Math.max(14, landW * 0.22), (ySurf + h) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '600 12px "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(190, 215, 225, 0.7)';
      ctx.fillText('索马里 · 大陆', 0, 0);
      ctx.restore();

      /* 海面光带 */
      ctx.strokeStyle = 'rgba(160, 225, 255, 0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let x = landW - 4; x <= w; x += 4) {
        const yy = ySurf + Math.sin(x * 0.04 + time * 0.8) * 1.2;
        if (x === landW - 4) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();

      /* ① 风：轻柔箭头（仅第 1 步，风停后消失） */
      if (gWind > 0.02) {
        const dir = lerp(1, -1, s);
        ctx.save();
        ctx.lineCap = 'round';
        for (const ar of arrows) {
          ar.x += dir * ar.speed * dt;
          ar.life = (ar.life + dt * 0.55) % 1;
          if (dir > 0 && ar.x > w + 60) ar.x = -40;
          if (dir < 0 && ar.x < -60) ar.x = w + 40;
          /* 柔和信封：整段生命周期内可见，两端淡入淡出 */
          const env = Math.sin(ar.life * Math.PI);
          const alpha = gWind * 0.62 * env;
          if (alpha < 0.03) continue;
          const len = 24;
          const x0 = ar.x - dir * len * 0.5;
          const y0 = ar.y;
          const tipY = y0 + Math.sin(time * 1.8 + ar.seed) * 2;
          ctx.strokeStyle = 'rgba(236, 249, 255, 1)';
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + dir * len, tipY);
          ctx.stroke();
          ctx.globalAlpha = alpha * 1.15;
          ctx.fillStyle = 'rgba(242, 251, 255, 1)';
          ctx.beginPath();
          ctx.moveTo(x0 + dir * len, tipY);
          ctx.lineTo(x0 + dir * len - dir * 6, tipY - 3.4);
          ctx.lineTo(x0 + dir * len - dir * 6, tipY + 3.4);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      /* ② 表层海水粒子（第 2 步起；稀疏、蓝色） */
      if (gWater > 0.02) {
        const dir = lerp(1, -1, s);
        const bandTop = ySurf + 8;
        const bandH = Math.max(24, (h - ySurf) * 0.2);
        ctx.save();
        ctx.lineCap = 'round';
        for (const d of waters) {
          const y = bandTop + d.y * bandH;
          d.x += dir * d.speed * gWater * dt;
          if (d.x > w + 24) d.x = -18;
          if (d.x < -24) d.x = w + 18;
          const yy = y + Math.sin(time * 1.6 + d.seed * 3) * 1.5;
          const alpha = (0.30 + 0.22 * ((d.seed % 5) / 5)) * gWater;
          ctx.strokeStyle = 'rgba(135, 205, 255, 1)';
          ctx.lineWidth = 1.1;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(d.x - dir * 5.5, yy + Math.sin(d.seed) * 1.2);
          ctx.lineTo(d.x, yy);
          ctx.stroke();
          ctx.globalAlpha = alpha * 1.5;
          ctx.fillStyle = 'rgba(170, 228, 255, 1)';
          ctx.beginPath();
          ctx.arc(d.x, yy, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      /* ③ 沿岸上升流（第 3 步；夏强冬停） */
      const upwellK = Math.pow(1 - s, 1.4);
      const zoneW = w * 0.115;
      const zoneX0 = landW + 4;
      if (gUp > 0.02 && upwellK > 0.03) {
        const k = gUp * upwellK;
        const gl = ctx.createLinearGradient(0, h, 0, ySurf);
        gl.addColorStop(0, `rgba(20, 90, 150, ${0.6 * k})`);
        gl.addColorStop(1, `rgba(90, 200, 245, ${0.36 * k})`);
        ctx.fillStyle = gl;
        ctx.fillRect(zoneX0, ySurf + 4, zoneW, h - ySurf);
        ctx.save();
        /* 三道宽软流柱（一眼能看出“上泛”） */
        ctx.lineCap = 'round';
        for (let ci = 0; ci < 3; ci++) {
          const cxp = zoneX0 + 14 + ci * ((zoneW - 24) / 2);
          const wave = Math.sin(time * 1.2 + ci * 2.1) * 2.5;
          const grad = ctx.createLinearGradient(0, h, 0, ySurf);
          grad.addColorStop(0, `rgba(120, 215, 255, ${0.16 * k})`);
          grad.addColorStop(1, `rgba(70, 170, 235, ${0.05 * k})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 3.4;
          ctx.beginPath();
          ctx.moveTo(cxp + wave, ySurf + 6);
          ctx.bezierCurveTo(cxp + wave * 1.3, ySurf + (h - ySurf) * 0.45, cxp - wave, ySurf + (h - ySurf) * 0.7, cxp + wave * 0.5, h - 6);
          ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        ctx.lineCap = 'round';
        for (const u of ups) {
          u.y -= u.speed * k * dt;
          if (u.y < 0.05) { u.y = 1; u.x = Math.random(); }
          const x = zoneX0 + 7 + u.x * Math.max(8, zoneW - 14);
          const y = ySurf + u.y * (h - ySurf - 6);
          const fade = clamp(u.y / 0.12, 0, 1) * clamp((1 - u.y) / 0.1, 0, 1);
          const bl = 195 + Math.round(50 * ((u.seed % 6) / 6));
          ctx.strokeStyle = `rgba(${46 + Math.round(34 * (1 - u.y))}, ${118 + Math.round(80 * (1 - u.y))}, ${bl}, 1)`;
          ctx.lineWidth = 1.5 + 0.4 * ((u.seed % 4) / 4);
          ctx.globalAlpha = k * (0.30 + 0.20 * fade);
          ctx.beginPath();
          ctx.moveTo(x + Math.sin(u.seed + u.y * 9) * 2.4, y + 8);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.restore();
        /* 海面冷色斑（沿岸降温） */
        const cx0 = zoneX0 + zoneW * 0.42;
        const ww2 = Math.max(30, (w - landW) * 0.08);
        const rg = ctx.createRadialGradient(cx0, ySurf, 2, cx0, ySurf, ww2);
        rg.addColorStop(0, `rgba(105, 210, 255, ${0.42 * k})`);
        rg.addColorStop(1, 'rgba(90, 200, 255, 0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.ellipse(cx0, ySurf, ww2, ww2 * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      /* 顶部：当前步骤标题 + 因果链 */
      const headDesc: [string, string] =
        stage === 0 ? ['① 风', s < 0.5 ? '西南季风沿岸吹拂 · 箭头表示风向' : '东北季风从陆地吹向海洋'] :
        stage === 1 ? ['② 表层海水', s < 0.5 ? '被风带动，向离岸方向移动 · 粒子表示海水' : '被推向海岸（向岸流）'] :
        ['③ 沿岸上升流', s < 0.5 ? '表层海水流走，深层冷水垂直上泛' : '上升流停止：向岸风使冷水无法上泛'];
      ctx.font = '600 13px "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(235, 248, 255, 0.95)';
      ctx.fillText(headDesc[0], 18, 26);
      const headW = ctx.measureText(headDesc[0]).width;
      ctx.font = '500 11.5px "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(170, 205, 230, 0.9)';
      ctx.fillText(headDesc[1], 18 + headW + 10, 26);

      let cxp = 18;
      for (let i = 0; i < 3; i++) {
        const isCur = i === stage;
        if (i > 0) { ctx.fillStyle = 'rgba(160, 200, 225, 0.7)'; ctx.fillText('→', cxp + 2, 45); cxp += 15; }
        ctx.font = `${isCur ? '700' : '500'} 11px "PingFang SC", sans-serif`;
        ctx.fillStyle = isCur ? 'rgba(255, 217, 174, 0.95)' : 'rgba(150, 190, 220, 0.42)';
        ctx.fillText(CHAIN[i], cxp, 45);
        cxp += ctx.measureText(CHAIN[i]).width + 7;
      }

      raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const pick = (m: 'auto' | StageId) => {
    setMode(m);
    stampRef.current += 1;
    if (m === 'auto') setPlaying(true);
  };
  const togglePlay = () => {
    if (modeRef.current !== 'auto') setMode('auto');
    setPlaying((p) => !p);
  };

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className ?? ''}`} style={style}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? '暂停自动演示' : '播放自动演示'}
          className="w-8 h-8 rounded-[9px] border border-[rgba(126,190,255,0.25)] bg-[rgba(6,18,34,0.78)] text-[#cfe0f2] text-[12px] hover:bg-[rgba(20,50,84,0.85)]">
          {playing ? '⏸' : '▶'}
        </button>
        {CHAIN.map((label, i) => {
          const active = (mode !== 'auto' && mode === i) || (mode === 'auto' && stage === i);
          return (
            <button
              key={label}
              type="button"
              onClick={() => pick(i as StageId)}
              className={`px-2.5 h-8 rounded-[9px] border text-[11.5px] transition-colors ${
                active
                  ? 'border-[rgba(255,217,174,0.55)] bg-[rgba(90,60,30,0.6)] text-[#ffd9ae]'
                  : 'border-[rgba(126,190,255,0.22)] bg-[rgba(6,18,34,0.75)] text-[#a9c3de] hover:bg-[rgba(20,50,84,0.85)]'
              }`}>
              {i + 1}·{label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
