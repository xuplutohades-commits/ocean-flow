'use client';
import { useMemo, useState } from 'react';
import FormationCanvas, { type FormationState } from '@/components/formation/FormationCanvas';
import { Panel, Slider, Toggle, Seg, Reveal } from '@/components/ui/kit';
import { useApp } from '@/store/app';
import type { Season } from '@/types';

const CHAIN = [
  { n: '①', k: 'windBelts', zh: '全球风带', en: 'WIND BELTS', d: '赤道两侧信风、中纬西风、极地东风——七个气压带六个风带是“原动力”，打开后先看到风的舞台。' },
  { n: '②', k: 'surfaceWind', zh: '盛行风推动海水', en: 'SURFACE WIND', d: '风摩擦海面，把动量传给表层海水，粒子开始顺着风向运动（风海流的直接驱动）。' },
  { n: '③', k: 'coriolis', zh: '地转偏向力', en: 'CORIOLIS', d: '地球自转使运动物体在北半球右偏、南半球左偏。叠加摩擦与风后，表层海水流向与风向约呈 45°角，深层更偏。' },
  { n: '④', k: 'landBarrier', zh: '海陆分布阻挡', en: 'CONTINENTS', d: '大陆把偏转中的水流逼回大洋：东岸形成狭急的暖流（黑潮、湾流），环流被“围”出来——这就是大洋环流的骨架。' },
] as const;

const TEACH_STEPS = [
  { t: '第一步 · 先看舞台', desc: '打开“全球风带”，观察七带六风：赤道无风带、信风带、西风带、极地东风带。', set: { windBelts: true, surfaceWind: false, coriolis: false, landBarrier: true } },
  { t: '第二步 · 风推水动', desc: '再打开“盛行风”，粒子立刻顺着风带漂移：信风把水推向赤道方向，西风把水推向极地方向。注意粒子的主要方向。', set: { windBelts: true, surfaceWind: true, coriolis: false, landBarrier: true } },
  { t: '第三步 · 地球让它偏转', desc: '打开“地转偏向力”，对比南北半球：北半球粒子向右偏、南半球向左偏，漂移轨迹变成斜向的“螺旋”。', set: { windBelts: true, surfaceWind: true, coriolis: true, landBarrier: true } },
  { t: '第四步 · 大陆围出环流', desc: '关闭“海陆分布”再打开：没有大陆时粒子几乎只在经向和纬向之间来回；有大陆后，每个大洋的“8 字形”环流立刻成形。', set: { windBelts: true, surfaceWind: true, coriolis: true, landBarrier: true } },
];

const FACTORS: { k: 'windBelts' | 'surfaceWind' | 'coriolis' | 'landBarrier'; zh: string; en: string; d: string }[] = [
  { k: 'windBelts', zh: '全球风带', en: 'WIND BELTS', d: '显示七带六风的空间格局' },
  { k: 'surfaceWind', zh: '盛行风', en: 'SURFACE WIND', d: '风摩擦海面，推动表层海水' },
  { k: 'coriolis', zh: '地转偏向力', en: 'CORIOLIS', d: '北右偏 / 南左偏，随纬度增强' },
  { k: 'landBarrier', zh: '海陆分布', en: 'CONTINENTS', d: '大陆阻挡，把水流围成环流' },
];

export default function FormationPage() {
  const app = useApp();
  const [season, setSeason] = useState<Season>('summer');
  const [windK, setWindK] = useState(60);
  const [corK, setCorK] = useState(55);
  const [friction, setFriction] = useState(72);
  const [count, setCount] = useState(1500);
  const [play, setPlay] = useState(true);
  const [step, setStep] = useState<number | null>(null);

  const state: FormationState = useMemo(() => ({
    windBelts: app.windBelts,
    surfaceWind: app.surfaceWind,
    coriolis: app.coriolis,
    landBarrier: app.landBarrier,
    windK,
    corK,
    friction,
    count,
    season,
    play,
  }), [app.windBelts, app.surfaceWind, app.coriolis, app.landBarrier, windK, corK, friction, count, season, play]);

  const applyStep = (i: number) => {
    setStep(i);
    const s = TEACH_STEPS[i].set;
    (Object.keys(s) as (keyof typeof s)[]).forEach((k) => {
      if (app[k] !== s[k]) (app as unknown as { setFactor: Function }).setFactor(k as any, s[k]);
    });
  };

  const activeCount = FACTORS.filter((f) => app[f.k]).length;

  return (
    <div style={{ paddingTop: 96 }} className="pb-10">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-10">
        <Reveal>
          <div className="kicker">MODULE 02 · FORMATION LAB</div>
          <h1 className="title-disp text-[26px] md:text-[34px] mt-2 grad-text">为什么会有洋流</h1>
          <p className="mt-3 text-[13.5px] text-[#8ba7c6] max-w-3xl leading-relaxed">
            这不是图文讲解，而是一台可操作的模拟器：<b className="text-[#dff4ff]">粒子 = 表层海水</b>。
            依次打开四个因素，看海水粒子如何从“随风漂移”变成“绕大洋打圈”的环流；随时关闭某个因素，观察它消失了什么——因果关系自己会显现。
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="mt-7 grid lg:grid-cols-[300px_1fr] gap-4 items-stretch">
            {/* 控制台 */}
            <Panel className="p-4 lg:p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="kicker text-[10px]">FACTORS · 因素开关</div>
                <span className="badge badge-accent">{activeCount} / 4 已开启</span>
              </div>
              {FACTORS.map((f) => (
                <Toggle key={f.k} label={f.zh} desc={`${f.en} — ${f.d}`} on={app[f.k]} onChange={(v) => app.setFactor(f.k, v)}
                  accent={f.k === 'coriolis' ? 'gold' : 'teal'} />
              ))}
              <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(126,190,255,0.25), transparent)' }} />
              <Slider label="盛行风强度" value={windK} min={0} max={100} onChange={setWindK} unit="%" hint="调制风对海面的推力" />
              <Slider label="地转偏向力" value={corK} min={0} max={100} onChange={setCorK} unit="%" hint="0 = 无偏向；100 = 强偏向" />
              <Slider label="阻尼（摩擦耗能）" value={friction} min={40} max={96} onChange={setFriction} unit="%" hint="越大粒子越快“停住”，越小运动越持久" />
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-[#a9c3de] flex-1">粒子数</label>
                <select className="rounded-[9px] border border-[rgba(126,190,255,0.2)] bg-[rgba(8,22,40,0.8)] text-[12px] px-2 py-1.5 text-[#cfe4ff]"
                  value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[600, 1000, 1500, 2200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn flex-1" onClick={() => setPlay(!play)}>{play ? '❚❚ 暂停' : '▶ 继续'}</button>
                <button className="btn flex-1" onClick={() => { setPlay(true); }}>↻ 重置粒子</button>
              </div>
              <div className="text-[11px] leading-relaxed text-[#5f7b99]">
                <b className="text-[#8fb7d8]">观察要点：</b>
                ① 只有风：粒子沿风带直线漂移；② 加偏向力：北半球右偏、南半球左偏；③ 加陆地：副热带环流成形，西侧（大陆东岸）流速明显变快——这就是“西边界强化”。
              </div>
            </Panel>

            {/* 模拟画布 */}
            <div className="relative rounded-[16px] overflow-hidden border border-[rgba(126,190,255,0.16)]" style={{ minHeight: 560 }}>
              <FormationCanvas state={state} />
              <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
                <span className="badge" style={{ background: 'rgba(4,14,28,0.75)' }}>颗粒 = 表层海水</span>
                <span className="badge hidden sm:inline-flex" style={{ background: 'rgba(4,14,28,0.75)' }}>
                  颜色 = 速度（蓝慢 · 琥珀快）
                </span>
              </div>
              <div className="absolute top-3 right-3 pointer-events-auto">
                <Seg<Season>
                  options={[{ id: 'summer', label: '夏季' }, { id: 'winter', label: '冬季' }]}
                  value={season} onChange={setSeason}
                />
              </div>
            </div>
          </div>
        </Reveal>

        {/* 教学模式分步 */}
        {app.mode === 'teach' && (
          <Reveal delay={0.1}>
            <Panel className="mt-4 p-4">
              <div className="kicker text-[10px] mb-3">TEACHING FLOW · 跟着教材走（点击步骤自动切换因素）</div>
              <div className="grid md:grid-cols-4 gap-2.5">
                {TEACH_STEPS.map((s, i) => (
                  <button key={i}
                    onClick={() => applyStep(i)}
                    className={`rounded-[12px] border text-left p-3.5 transition-all ${step === i ? 'border-[rgba(111,227,224,0.55)] bg-[rgba(111,227,224,0.08)]' : 'border-[rgba(126,190,255,0.14)] bg-[rgba(8,22,40,0.5)] hover:bg-[rgba(15,38,66,0.6)]'}`}>
                    <div className={`text-[13px] font-semibold ${step === i ? 'text-[#d9fffd]' : 'text-[#cfe4ff]'}`}>{s.t}</div>
                    <div className="text-[11.5px] leading-relaxed text-[#7996b5] mt-1.5">{s.desc}</div>
                  </button>
                ))}
              </div>
            </Panel>
          </Reveal>
        )}

        {/* 因果链与知识点 */}
        <Reveal>
          <div className="mt-10 grid lg:grid-cols-2 gap-4">
            <Panel className="p-6">
              <div className="kicker text-[10px]">CAUSAL CHAIN · 因果链</div>
              <div className="mt-4 flex flex-wrap items-center gap-y-2">
                {CHAIN.map((c, i) => (
                  <div key={c.k} className="flex items-center gap-2">
                    <div className={`rounded-[12px] border px-3 py-2 max-w-[150px] ${app[c.k] ? 'border-[rgba(111,227,224,0.5)] bg-[rgba(111,227,224,0.08)]' : 'border-[rgba(126,190,255,0.12)] bg-[rgba(8,22,40,0.5)] opacity-70'}`}>
                      <div className="text-[10px] text-[#6fe3e0]">{c.n} {c.en}</div>
                      <div className="text-[13px] font-semibold text-[#eaf6ff] mt-0.5">{c.zh}</div>
                    </div>
                    {i < CHAIN.length - 1 && <span className="text-[#6fe3e0] text-[14px]">→</span>}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[10px] p-3.5 border border-[rgba(126,190,255,0.14)] bg-[rgba(8,22,40,0.5)]">
                <p className="text-[12.5px] leading-relaxed text-[#8ba7c6]">
                  <b className="text-[#cfe4ff]">教材结论：</b>
                  盛行风是洋流最主要的动力（<b>风海流</b>）；地转偏向力改变流向；海陆分布决定环流路径。
                  赤道两侧信风与中纬西风共同作用，加上陆地阻挡，形成以副热带为中心的环流——<b>北顺南逆</b>。
                </p>
              </div>
            </Panel>
            <Panel className="p-6">
              <div className="kicker text-[10px]">TWO GYRES · 两类环流对比</div>
              <div className="mt-4 space-y-3">
                <div className="rounded-[12px] p-4 border" style={{ borderColor: 'rgba(255,157,92,0.25)', background: 'rgba(255,157,92,0.05)' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: '#ff9d5c', boxShadow: '0 0 10px rgba(255,157,92,0.8)' }} />
                    <b className="text-[14px] text-[#ffd9ae]">副热带环流（中低纬）</b>
                    <span className="badge ml-auto">北：顺时针</span>
                  </div>
                  <p className="text-[12.5px] text-[#a9c3de] mt-2 leading-relaxed">西侧为暖流（大陆东岸），东侧为寒流（大陆西岸）。受信风与西风夹持，是教材考查的重点。</p>
                </div>
                <div className="rounded-[12px] p-4 border" style={{ borderColor: 'rgba(94,200,255,0.25)', background: 'rgba(94,200,255,0.05)' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: '#5ec8ff', boxShadow: '0 0 10px rgba(94,200,255,0.8)' }} />
                    <b className="text-[14px] text-[#bde6ff]">副极地环流（中高纬）</b>
                    <span className="badge ml-auto">北：逆时针</span>
                  </div>
                  <p className="text-[12.5px] text-[#a9c3de] mt-2 leading-relaxed">北半球在副极地低压区形成逆时针环流；南半球中高纬陆地缺口，环流不成圈，由西风漂流贯通三大洋，南极洲外围另有南极环流。</p>
                </div>
                <p className="text-[11px] text-[#5f7b99]">提示：把模拟器中“海陆分布”关掉再打开，能直观看到这两套环流是怎么被“围”出来的。</p>
              </div>
            </Panel>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
