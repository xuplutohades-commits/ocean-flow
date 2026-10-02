'use client';
import { useState } from 'react';
import Link from 'next/link';
import DriftBottle from '@/components/lab/DriftBottle';
import UpwellingLab, { type UpwellParams } from '@/components/lab/UpwellingLab';
import ConvergenceLab, { type ConvergeParams } from '@/components/lab/ConvergenceLab';
import MonsoonLab from '@/components/lab/MonsoonLab';
import RouteSim, { ROUTES } from '@/components/lab/RouteSim';
import EnsoLab from '@/components/lab/EnsoLab';
import { Panel, Slider, Seg, Reveal } from '@/components/ui/kit';
import { useApp } from '@/store/app';

type ExpId = 'bottle' | 'upwelling' | 'converge' | 'monsoon' | 'voyage' | 'enso' | null;

const EXPS: { id: Exclude<ExpId, null>; zh: string; en: string; icon: string; desc: string; tag: string }[] = [
  { id: 'bottle', zh: '漂流瓶实验', en: 'DRIFT BOTTLE', icon: '🍾', desc: '选择投放海域，让瓶子随表层洋流开始环球旅行', tag: '洋流方向' },
  { id: 'upwelling', zh: '上升流实验', en: 'UPWELLING', icon: '⬆️', desc: '调离岸风强度，看冷水与营养盐如何上涌成渔场', tag: '渔场成因' },
  { id: 'converge', zh: '寒暖流交汇实验', en: 'CONVERGENCE', icon: '🌫', desc: '调水温差与扰动强度：锋面、海雾与渔群一起出现', tag: '渔场成因' },
  { id: 'monsoon', zh: '季风切换实验', en: 'MONSOON SWITCH', icon: '🌀', desc: '冬夏切换，北印度洋洋流整体转向、索马里寒暖反转', tag: '季节变化' },
  { id: 'voyage', zh: '航海路线实验', en: 'VOYAGE', icon: '⛵', desc: '比较顺流与逆流的航时差，规划最省时航线', tag: '对航运影响' },
  { id: 'enso', zh: '厄尔尼诺模拟', en: 'ENSO SIM', icon: '🌡', desc: '调节海温距平与信风，观察沃克环流与全球天气连锁反应', tag: '海气相互作用' },
];

export default function LabPage() {
  const { mode } = useApp();
  const [exp, setExp] = useState<ExpId>(null);
  const [up, setUp] = useState<UpwellParams>({ wind: 'offshore', windK: 65, speed: 1 });
  const [cv, setCv] = useState<ConvergeParams>({ dT: 10, windK: 55, speed: 1 });
  const [routeId, setRouteId] = useState(ROUTES[0].id);
  const [shipK, setShipK] = useState(70);
  const route = ROUTES.find((r) => r.id === routeId)!;

  if (exp) {
    return (
      <div style={{ paddingTop: 96 }} className="pb-14">
        <div className="mx-auto max-w-[1500px] px-6 lg:px-10">
          <button className="badge badge-accent mb-4" onClick={() => setExp(null)}>← 返回实验列表</button>
          <Reveal>
            <div className="kicker">{EXPS.find((e) => e.id === exp)?.en}</div>
            <h1 className="title-disp text-[26px] md:text-[32px] mt-1 grad-text">{EXPS.find((e) => e.id === exp)?.zh}</h1>
          </Reveal>
          <div className="mt-6">
            {exp === 'bottle' && <DriftBottle />}
            {exp === 'upwelling' && (
              <div className="grid lg:grid-cols-[1fr_320px] gap-4">
                <UpwellingLab params={up} />
                <div className="space-y-4">
                  <Panel className="p-5">
                    <div className="kicker-dim mb-3">实验参数</div>
                    <Seg options={[
                      { id: 'offshore', label: '离岸风' },
                      { id: 'onshore', label: '向岸风' },
                      { id: 'calm', label: '无风' },
                    ] as { id: 'offshore' | 'onshore' | 'calm'; label: string }[]} value={up.wind} onChange={(v) => setUp({ ...up, wind: v })} />
                    <div className="mt-4 space-y-3">
                      <Slider label="风强度" value={up.windK} min={0} max={100} onChange={(v) => setUp({ ...up, windK: v })} unit="%" />
                      <Slider label="动画速度" value={up.speed} min={0.3} max={2.5} step={0.1} onChange={(v) => setUp({ ...up, speed: v })} unit="×" />
                    </div>
                  </Panel>
                  <Panel className="p-5">
                    <div className="kicker-dim mb-2">实验结论</div>
                    <ul className="space-y-1.5 text-[12px] leading-relaxed text-[#a9c3de]">
                      <li>离岸风 → 表层海水离岸 → 深层冷水上升（温跃层近岸抬升）→ 营养盐 → 浮游 → 鱼</li>
                      <li>向岸风 → 下沉流（downwelling）：暖水堆积表层，营养盐被封在深层</li>
                      <li>真实案例：秘鲁渔场（东南信风离岸）、索马里夏季渔场</li>
                    </ul>
                  </Panel>
                </div>
              </div>
            )}
            {exp === 'converge' && (
              <div className="grid lg:grid-cols-[1fr_320px] gap-4">
                <ConvergenceLab params={cv} />
                <div className="space-y-4">
                  <Panel className="p-5">
                    <div className="kicker-dim mb-3">实验参数</div>
                    <div className="space-y-3">
                      <Slider label="水温差 ΔT" value={cv.dT} min={2} max={16} step={0.5} onChange={(v) => setCv({ ...cv, dT: v })} unit=" ℃" hint="黑潮×亲潮温差约 8～12 ℃" />
                      <Slider label="扰动强度" value={cv.windK} min={0} max={100} onChange={(v) => setCv({ ...cv, windK: v })} unit="%" />
                      <Slider label="动画速度" value={cv.speed} min={0.3} max={2.5} step={0.1} onChange={(v) => setCv({ ...cv, speed: v })} unit="×" />
                    </div>
                  </Panel>
                  <Panel className="p-5">
                    <div className="kicker-dim mb-2">实验结论</div>
                    <ul className="space-y-1.5 text-[12px] leading-relaxed text-[#a9c3de]">
                      <li>ΔT 大 → 锋面清晰、营养盐上泛快、海雾多（暖湿空气遇冷水）</li>
                      <li>扰动强 → 浮游生物与鱼群更多；这也是北海/纽芬兰/北海道渔场的共性</li>
                      <li>注意区分：交汇渔场靠“扰动翻营养盐”，上升流渔场靠“深层冷水上涌”</li>
                    </ul>
                  </Panel>
                </div>
              </div>
            )}
            {exp === 'monsoon' && <MonsoonLab />}
            {exp === 'voyage' && (
              <div className="grid lg:grid-cols-[1fr_320px] gap-4">
                <div>
                  <RouteSim route={route} speedK={shipK} assist={route.assist} penalty={route.penalty} />
                  <div className="mt-3 rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(126,190,255,0.16)' }}>
                    <div className="text-[12.5px] leading-relaxed text-[#a9c3de]">「{route.label}」{route.desc}。船速滑块影响洋流增益与损耗的相对大小——船越慢，洋流的影响占比越大。</div>
                  </div>
                </div>
                <div className="space-y-4">
                  <Panel className="p-5">
                    <div className="kicker-dim mb-3">选择航线</div>
                    <div className="space-y-1.5">
                      {ROUTES.map((r) => (
                        <button key={r.id} onClick={() => setRouteId(r.id)} className={`chip w-full justify-between ${routeId === r.id ? 'chip-on' : ''}`}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Slider label="船速（影响洋流占比）" value={shipK} min={20} max={100} onChange={setShipK} unit="%" hint="低速帆船时代洋流影响更大" />
                    </div>
                  </Panel>
                  <Panel className="p-5">
                    <div className="kicker-dim mb-2">历史数字</div>
                    <ul className="space-y-1.5 text-[12px] leading-relaxed text-[#a9c3de]">
                      <li>哥伦布 1492 去程 37 天（绕加那利—北赤道），回程约 3 周（顺湾流）</li>
                      <li>现代邮轮“洲际航线”常借湾流 / 黑潮省 1～3 天</li>
                      <li>战时商船反其道：利用寒流+逆流声呐隐蔽？——不，这是考点陷阱，见教材"顺流省时"</li>
                    </ul>
                  </Panel>
                </div>
              </div>
            )}
            {exp === 'enso' && <EnsoLab />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 96 }} className="pb-14">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-10">
        <Reveal>
          <div className="kicker">MODULE 06 · GEOGRAPHY LAB</div>
          <h1 className="title-disp text-[26px] md:text-[34px] mt-2 grad-text">地理实验室</h1>
          <p className="mt-3 text-[13.5px] text-[#8ba7c6] max-w-3xl leading-relaxed">
            六个可动手的小实验，覆盖高考最爱考的三类因果链：<b>洋流方向（漂流瓶）→ 渔场成因（上升流 / 交汇）→ 人类活动（航海 / 季风 / ENSO）</b>。
            每个实验都允许修改参数，观察结果的变化——{mode === 'lab' ? '你正处在实验模式，参数面板已全部开放。' : '把右上角切成“实验模式”后，参数面板会获得更强的实验语境。'}
          </p>
        </Reveal>

        <div className="mt-8 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {EXPS.map((e, i) => (
            <Reveal key={e.id} delay={i * 0.04}>
              <button onClick={() => setExp(e.id)} className="glass p-6 w-full text-left group hover:-translate-y-1 transition-transform h-full relative overflow-hidden">
                <div aria-hidden className="absolute -right-8 -top-10 text-[84px] opacity-[0.07] group-hover:opacity-20 transition-opacity">{e.icon}</div>
                <div className="text-[30px]">{e.icon}</div>
                <div className="kicker text-[9.5px] mt-3">{e.en}</div>
                <div className="text-[18px] font-bold text-[#eaf6ff] mt-1 group-hover:text-[#d9fffd] transition-colors">{e.zh}</div>
                <p className="text-[12.5px] text-[#7996b5] mt-2 leading-relaxed">{e.desc}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="badge badge-accent">{e.tag}</span>
                  <span className="text-[13px] text-[#6fe3e0] opacity-0 group-hover:opacity-100 transition-opacity">开始 →</span>
                </div>
              </button>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-10 glass p-6 grid md:grid-cols-[auto_1fr] gap-6 items-center">
            <div className="text-[26px]">🧪</div>
            <div>
              <div className="text-[14px] font-bold">实验纪律（教学建议）</div>
              <p className="text-[12.5px] leading-relaxed text-[#8ba7c6] mt-1.5">
                建议按“先预测 → 再操作 → 后解释”三步走：操作前先写下预期，操作后再用教材知识解释结果。
                例如漂流瓶：先预测“台湾东岸投放的瓶子会先向北还是向南”，再动手验证。真实世界比模拟更复杂（还有风、压强梯度、地形），但因果骨架与模拟一致。
              </p>
              <Link href="/cases" className="inline-block mt-3 text-[12.5px] text-[#6fe3e0] underline">配合洋流档案馆食用效果更佳 →</Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
