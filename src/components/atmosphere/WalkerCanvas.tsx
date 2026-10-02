'use client';
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import { clamp, lerp } from '@/lib/geo';

export interface EnsoState {
  /** 东太平洋海温距平 ℃，-3..3 */
  anomaly: number;
  /** 信风强度 0..100 */
  tradeWind: number;
}

interface Dot {
  t: number;
  speed: number;
  seed: number;
}

/**
 * 沃克环流剖面示意：西太（印尼）— 东太（秘鲁）。
 * 正常年：东太信风强、东太冷水上升、西太暖池，环流自东向西沿洋面吹，高空自西向东。
 * 厄尔尼诺：信风减弱/逆转，冷水上涌停止，东太增温，环流减弱甚至反向。
 */
export default function WalkerCanvas({ state }: { state: EnsoState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dotsRef = useRef<Dot[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    if (!dotsRef.current.length) {
      dotsRef.current = Array.from({ length: 46 }, () => ({ t: Math.random(), speed: 0.12 + Math.random() * 0.06, seed: Math.random() * 100 }));
    }

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(100, r.width);
      h = Math.max(200, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      const T = now / 1000;
      const st = stateRef.current;
      const anomaly = st.anomaly;
      const trade = st.tradeWind / 100;
      const reversed = anomaly > 1.2;
      const loopStrength = reversed
        ? clamp((anomaly - 1.2) / 1.8, 0, 1)
        : clamp(trade * 1.15 + (anomaly > 0 ? -anomaly * 0.25 : anomaly * 0.18), 0.08, 1.2);

      // 几何布局
      const xW = w * 0.1;
      const xE = w * 0.9;
      const ySurf = h * 0.62;
      const yTop = h * 0.12;
      const yMid = h * 0.37;

      ctx.clearRect(0, 0, w, h);

      // 大气背景
      const airG = ctx.createLinearGradient(0, 0, 0, ySurf);
      airG.addColorStop(0, 'rgba(5, 22, 42, 0.0)');
      airG.addColorStop(1, 'rgba(10, 44, 78, 0.35)');
      ctx.fillStyle = airG;
      ctx.fillRect(0, 0, w, ySurf);

      // 洋面
      const sstE = 24 + anomaly;
      const sstW = 29;
      const sea = ctx.createLinearGradient(0, ySurf, w, ySurf);
      sea.addColorStop(0, seaColor(29));        // 西太暖池
      sea.addColorStop(0.55, seaColor(lerp(29, sstE, 0.55)));
      sea.addColorStop(1, seaColor(sstE));       // 东太
      ctx.fillStyle = sea;
      ctx.fillRect(0, ySurf, w, h - ySurf);
      // 洋面发光
      ctx.strokeStyle = 'rgba(140, 230, 255, 0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, ySurf);
      ctx.lineTo(w, ySurf);
      ctx.stroke();

      // 温跃层（thermocline）：正常年西深东浅；厄尔尼诺年东太加深
      const hw = h * 0.19;
      const he = h * 0.19 + (0.12 - 0.10 * trade - 0.075 * clamp(anomaly, 0, 3)) * h;
      ctx.strokeStyle = 'rgba(111,227,224,0.4)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(xW, ySurf + hw);
      ctx.quadraticCurveTo((xW + xE) / 2, ySurf + (hw + he) / 2 - 8, xE, ySurf + he);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '500 10px sans-serif';
      ctx.fillStyle = 'rgba(111,227,224,0.7)';
      ctx.fillText('温跃层', xW + 10, ySurf + hw - 4);

      // 垂直对流柱
      const riseWest = !reversed;
      const riseX = riseWest ? xW : xE;
      const sinkX = riseWest ? xE : xW;
      const riseCol = riseWest ? 'rgba(255,157,92,0.22)' : 'rgba(255,157,92,0.30)';
      const sinkCol = riseWest ? 'rgba(94,200,255,0.14)' : 'rgba(94,200,255,0.22)';
      ctx.fillStyle = riseCol;
      ctx.beginPath();
      ctx.ellipse(riseX, yMid, 46, ySurf - yTop, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sinkCol;
      ctx.beginPath();
      ctx.ellipse(sinkX, yMid, 42, ySurf - yTop, 0, 0, Math.PI * 2);
      ctx.fill();

      // 信风箭头（洋面）
      const arrowLen = lerp(30, 150, trade);
      const windAlpha = reversed ? 0.25 : 0.9;
      const windDir = reversed ? 1 : -1; // reversed 时气流向东
      const ay = ySurf + 22;
      for (const fx of [0.3, 0.55, 0.8]) {
        const x = lerp(xW, xE, fx);
        ctx.strokeStyle = `rgba(160, 225, 255, ${windAlpha * (0.6 + 0.4 * Math.sin(T * 2 + fx * 10))})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - (windDir * arrowLen) / 2, ay);
        ctx.lineTo(x + (windDir * arrowLen) / 2, ay);
        ctx.stroke();
        ctx.fillStyle = `rgba(190, 235, 255, ${windAlpha})`;
        ctx.beginPath();
        ctx.moveTo(x + (windDir * arrowLen) / 2, ay);
        ctx.lineTo(x + (windDir * arrowLen) / 2 - windDir * 8, ay - 4);
        ctx.lineTo(x + (windDir * arrowLen) / 2 - windDir * 8, ay + 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = `rgba(180, 230, 255, ${windAlpha})`;
      ctx.fillText(reversed ? '信风减弱 / 反向' : '东南信风（东→西）', lerp(xW, xE, 0.5) - 52, ay + 16);

      // 秘鲁沿岸上升流
      const upwell = reversed ? 0.06 : trade * 0.9;
      const ux = xE - 26;
      const uLen = (0.25 + upwell * 0.55) * (ySurf);
      ctx.strokeStyle = reversed ? 'rgba(94,200,255,0.12)' : 'rgba(94,200,255,0.65)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ux, ySurf + 2);
      ctx.lineTo(ux, ySurf - uLen);
      ctx.stroke();
      ctx.fillStyle = reversed ? 'rgba(94,200,255,0.18)' : 'rgba(94,200,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(ux, ySurf - uLen);
      ctx.lineTo(ux - 5, ySurf - uLen + 9);
      ctx.lineTo(ux + 5, ySurf - uLen + 9);
      ctx.closePath();
      ctx.fill();
      ctx.font = '500 10.5px sans-serif';
      ctx.fillStyle = `rgba(140, 210, 240, ${reversed ? 0.35 : 0.9})`;
      ctx.fillText('秘鲁上升流', ux - 34, ySurf - uLen - 6);

      // 环流粒子
      for (const d of dotsRef.current) {
        d.t += d.speed * loopStrength * dt * 3.2;
        if (d.t > 1) d.t -= 1;
        const t = d.t;
        let px: number;
        let py: number;
        if (riseWest) {
          // 正常：洋面自东向西 → 西侧上升 → 高空自西向东 → 东侧下沉
          if (t < 0.4) { const k = t / 0.4; px = lerp(xE, xW, k); py = ySurf + 6; }
          else if (t < 0.55) { const k = (t - 0.4) / 0.15; px = xW; py = lerp(ySurf + 6, yTop, k); }
          else if (t < 0.9) { const k = (t - 0.55) / 0.35; px = lerp(xW, xE, k); py = yTop + 8 * Math.sin(k * Math.PI); }
          else { const k = (t - 0.9) / 0.1; px = xE; py = lerp(yTop, ySurf - 4, k); }
        } else {
          // 厄尔尼诺：反向环流
          if (t < 0.4) { const k = t / 0.4; px = lerp(xW, xE, k); py = ySurf + 6; }
          else if (t < 0.55) { const k = (t - 0.4) / 0.15; px = xE; py = lerp(ySurf + 6, yTop, k); }
          else if (t < 0.9) { const k = (t - 0.55) / 0.35; px = lerp(xE, xW, k); py = yTop + 8 * Math.sin(k * Math.PI); }
          else { const k = (t - 0.9) / 0.1; px = xW; py = lerp(yTop, ySurf - 4, k); }
        }
        const wob = Math.sin(T * 2 + d.seed) * 2;
        ctx.fillStyle = `rgba(240, 214, 170, ${0.35 + 0.5 * loopStrength})`;
        ctx.beginPath();
        ctx.arc(px, py + wob, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 海温标注
      ctx.font = '600 12px sans-serif';
      ctx.fillStyle = '#ffd9ae';
      ctx.fillText('西太平洋暖池 29 ℃', xW - 10, ySurf + 34);
      ctx.fillStyle = sstE > 26 ? '#ffd9ae' : '#bde6ff';
      ctx.fillText(`东太平洋 ${sstE.toFixed(1)} ℃`, xE - 90, ySurf + 46);
      ctx.font = '500 10px sans-serif';
      ctx.fillStyle = 'rgba(150,190,220,0.75)';
      ctx.fillText(reversed ? '对流移到东太：东太多雨，西太干旱' : '西太对流旺盛：印尼多雨，东太干旱（副热带高压）', lerp(xW, xE, 0.5) - 130, yTop - 8);

      raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: 330, minWidth: 280 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

function seaColor(sst: number): string {
  const t = clamp((sst - 17) / 14, 0, 1); // 17 ℃ → 冷蓝，31 ℃ → 暖橙红
  const cold: [number, number, number] = [10, 52, 94];
  const warm: [number, number, number] = [184, 96, 42];
  const r = Math.round(lerp(cold[0], warm[0], t));
  const g = Math.round(lerp(cold[1], warm[1], t));
  const b = Math.round(lerp(cold[2], warm[2], t));
  return `rgb(${r},${g},${b})`;
}
