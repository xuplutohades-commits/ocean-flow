'use client';
import { useMemo, useState } from 'react';
import WalkerCanvas, { type EnsoState } from '@/components/atmosphere/WalkerCanvas';
import { Slider } from '@/components/ui/kit';

const CHECKLIST = [
  { k: 'upwell', zh: '秘鲁沿岸上升流减弱 / 消失', bad: '正常' },
  { k: 'fish', zh: '秘鲁渔场减产', bad: '正常' },
  { k: 'rainW', zh: '西太平洋（印尼）降水减少', bad: '正常' },
  { k: 'rainE', zh: '东太平洋（秘鲁沿岸）降水增多', bad: '正常' },
  { k: 'trades', zh: '东南信风减弱甚至反向', bad: '正常' },
];

export default function EnsoLab() {
  const [anomaly, setAnomaly] = useState(0);
  const [tradeWind, setTradeWind] = useState(70);
  const [checked, setChecked] = useState<string[]>([]);
  const [play, setPlay] = useState(true);

  const enso: EnsoState = useMemo(() => ({ anomaly, tradeWind }), [anomaly, tradeWind]);
  const elNino = anomaly > 1.2;
  const laNina = anomaly < -1.2;

  const toggle = (k: string) => setChecked((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  // 观察得分：厄尔尼诺预期勾选项
  const expected = elNino ? CHECKLIST.map((c) => c.k) : [];
  const score = expected.length ? expected.filter((k) => checked.includes(k)).length / expected.length : 0;
  const expectText = elNino
    ? '预期勾选全部 5 项（厄尔尼诺状态下的连锁反应）'
    : laNina
      ? '拉尼娜状态：与清单相反——上升流增强、秘鲁渔场丰产、西太多雨'
      : '先把“海温距平”调到 +2 ℃ 以上，观察环流反转，再对照清单勾选';

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4">
      <div className="rounded-[14px] p-4" style={{ border: '1px solid rgba(255,157,92,0.3)', background: 'rgba(8,22,40,0.6)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="kicker text-[10px]">ENSO SIMULATION · 厄尔尼诺模拟器</div>
          <div className="flex gap-1.5">
            {[{ l: '正常年', a: 0, t: 70 }, { l: '厄尔尼诺', a: 2.5, t: 18 }, { l: '拉尼娜', a: -2.2, t: 92 }].map((p) => (
              <button key={p.l} onClick={() => { setAnomaly(p.a); setTradeWind(p.t); }} className={`chip !py-1 !px-3 text-[11.5px] ${(elNino && p.l === '厄尔尼诺') || (laNina && p.l === '拉尼娜') || (!elNino && !laNina && p.l === '正常年') ? 'chip-on' : ''}`}>
                {p.l}
              </button>
            ))}
          </div>
        </div>
        <WalkerCanvas state={enso} />
        <div className="grid sm:grid-cols-2 gap-4 mt-3">
          <Slider label="东太平洋海温距平" value={anomaly} min={-3} max={3} step={0.1} onChange={setAnomaly} unit=" ℃" />
          <Slider label="东南信风强度" value={tradeWind} min={0} max={100} onChange={setTradeWind} unit=" %" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className="btn !py-1.5 text-[12px]" onClick={() => setPlay(!play)}>{play ? '❚❚ 暂停动画' : '▶ 继续动画'}</button>
          <span className="text-[11px] text-[#5f7b99]">提示：信风与海温互相反馈——“信风减弱 → 东太增温 → 沃克环流减弱 → 信风进一步减弱”</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.6)', border: '1px solid rgba(126,190,255,0.16)' }}>
          <div className="kicker-dim mb-2">观察记录（勾选你看到了什么）</div>
          <div className="space-y-1.5">
            {CHECKLIST.map((c) => (
              <label key={c.k} className={`flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[12.5px] cursor-pointer transition-colors ${checked.includes(c.k) ? 'bg-[rgba(111,227,224,0.1)] text-[#d9fffd]' : 'bg-[rgba(10,26,46,0.5)] text-[#a9c3de]'}`}>
                <input type="checkbox" className="accent-[#6fe3e0] w-3.5 h-3.5" checked={checked.includes(c.k)} onChange={() => toggle(c.k)} />
                {c.zh}
              </label>
            ))}
          </div>
          <div className="mt-3 text-[11.5px] text-[#5f7b99]">{expectText}</div>
          {elNino && (
            <div className="mt-2 h-[7px] rounded-full bg-[rgba(60,90,120,0.25)] overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${score * 100}%`, background: 'linear-gradient(90deg,#ff9d5c,#6fe3e0)' }} />
            </div>
          )}
        </div>
        <div className="rounded-[12px] p-4" style={{ background: 'rgba(255,157,92,0.06)', border: '1px solid rgba(255,157,92,0.25)' }}>
          <div className="kicker-dim mb-2">为什么会“环环相扣”</div>
          <p className="text-[12px] leading-relaxed text-[#a9c3de]">
            厄尔尼诺的本质是<b>海气相互作用的正反馈</b>：信风减弱 → 东太冷水上涌停止 → 东太增温 →
            沃克环流减弱/反转 → 信风更弱。拉尼娜则是相反方向的加强循环。
            海洋与大气不是“谁影响谁”，而是同一个系统。
          </p>
        </div>
      </div>
    </div>
  );
}
