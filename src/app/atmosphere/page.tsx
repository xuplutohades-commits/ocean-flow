'use client';
import { asset } from '@/lib/asset';
import { useEffect, useMemo, useState } from 'react';
import MonsoonMap from '@/components/map/MonsoonMap';
import WalkerCanvas, { type EnsoState } from '@/components/atmosphere/WalkerCanvas';
import ThreeCellDiagram from '@/components/atmosphere/ThreeCellDiagram';
import { Panel, Slider, Seg, Reveal } from '@/components/ui/kit';
import { useApp } from '@/store/app';
import type { Season } from '@/types';

const ENSO_PRESETS = [
  { label: '正常年', anomaly: 0, tradeWind: 70 },
  { label: '厄尔尼诺', anomaly: 2.5, tradeWind: 18 },
  { label: '拉尼娜', anomaly: -2.2, tradeWind: 92 },
];

function MonsoonSchematic({ season, onSelect }: { season: Season; onSelect: (s: Season) => void }) {
  const summer = season === 'summer';
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {([summer ? 'summer' : 'winter', summer ? 'winter' : 'summer'] as Season[]).map((s) => {
        const isSummerShown = s === 'summer';
        const active = s === season;
        return (
          <button key={s} type="button"
            onClick={() => onSelect(s)}
            title={active ? `当前：${s === 'summer' ? '夏季' : '冬季'}` : `点击切换为${s === 'summer' ? '夏季' : '冬季'}`}
            className={`rounded-[12px] border p-4 text-left transition-all ${active ? 'cursor-default' : 'cursor-pointer hover:brightness-125 hover:scale-[1.015] active:scale-[0.99]'} ${active ? '' : 'opacity-35'} focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7fd4ff]/60`}
            style={{ borderColor: isSummerShown ? 'rgba(255,157,92,0.35)' : 'rgba(94,200,255,0.3)', background: 'rgba(8,22,40,0.5)' }}>
            <div className="text-[13px] font-bold" style={{ color: isSummerShown ? '#ffd9ae' : '#bde6ff' }}>
              {isSummerShown ? '夏季：大陆低压' : '冬季：大陆高压'}
            </div>
            <svg viewBox="0 0 300 120" className="mt-2 w-full">
              <rect x="10" y="20" width="120" height="70" rx="8" fill={isSummerShown ? 'rgba(255,157,92,0.18)' : 'rgba(94,200,255,0.16)'} stroke={isSummerShown ? '#ff9d5c' : '#5ec8ff'} strokeWidth="1.5" />
              <text x="70" y="58" textAnchor="middle" fontSize="11" fill="#cfe4ff">{isSummerShown ? '亚欧大陆' : '亚欧大陆'}</text>
              <text x="70" y="74" textAnchor="middle" fontSize="9.5" fill="#7fa3c4">{isSummerShown ? '热低压 G' : '冷高压 H'}</text>
              <rect x="170" y="20" width="120" height="70" rx="8" fill="rgba(94,200,255,0.1)" stroke="rgba(94,200,255,0.35)" strokeWidth="1.2" />
              <text x="230" y="58" textAnchor="middle" fontSize="11" fill="#cfe4ff">印度洋</text>
              <text x="230" y="74" textAnchor="middle" fontSize="9.5" fill="#7fa3c4">{isSummerShown ? '相对高压（暖湿）' : '相对低压（冷干）'}</text>
              {isSummerShown ? (
                <path d="M 158 55 Q 180 38 200 55" fill="none" stroke="#ffd9ae" strokeWidth="2" markerEnd="url(#msa)" />
              ) : (
                <path d="M 158 55 Q 180 72 200 55" fill="none" stroke="#bde6ff" strokeWidth="2" markerEnd="url(#msb)" />
              )}
              <defs>
                <marker id="msa" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#ffd9ae" /></marker>
                <marker id="msb" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#bde6ff" /></marker>
              </defs>
              <text x="150" y="18" textAnchor="middle" fontSize="10" fill="#7fa3c4">
                {isSummerShown ? '风从海洋吹向大陆（西南季风）' : '风从大陆吹向海洋（东北季风）'}
              </text>
            </svg>
            <div className={`mt-2 text-center text-[10px] ${active ? 'text-[#5f7b99]' : 'text-[#7fa3c4]'}`}>
              {active ? '✓ 当前季节' : (isSummerShown ? '点击切换到夏季' : '点击切换到冬季')}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function AtmospherePage() {
  const { season, setSeason, } = useApp();
  const [anomaly, setAnomaly] = useState(0);
  const [tradeWind, setTradeWind] = useState(70);

  const enso: EnsoState = useMemo(() => ({ anomaly, tradeWind }), [anomaly, tradeWind]);

  const reversed = anomaly > 1.2;
  const upwell = reversed ? 6 : Math.round(tradeWind * 0.95);
  const fishery = reversed ? 12 : Math.round(40 + tradeWind * 0.55);
  const indoRain = reversed ? 18 : Math.round(60 + tradeWind * 0.42);
  const peruRain = reversed ? 86 : Math.round(110 - tradeWind * 1.1);

  const ENSO_NOTES: Record<string, string[]> = {
    normal: ['东太平洋水温正常偏低（冷水舌），秘鲁上升流旺盛，渔场丰产', '西太平洋暖池对流旺盛，印尼—澳洲多雨', '我国东部夏季风正常推进，雨带按季节北移'],
    elnino: ['东太平洋异常增温 2～3 ℃，上升流衰退、渔场减产', '沃克环流减弱甚至反向：印尼干旱、澳洲山火，秘鲁沿岸暴雨', '对我国：夏季风减弱，南方（长江流域）易涝、北方易旱，台风路径偏东'],
    lanina: ['东太平洋异常偏冷，信风增强、上升流更强，渔场丰产', '沃克环流增强：西太对流更强，印尼多雨，太平洋东西温差加大', '对我国：冬季偏冷概率增大，夏季风偏强，雨带偏北'],
  };
  const ensoKey = anomaly > 1.2 ? 'elnino' : anomaly < -1.2 ? 'lanina' : 'normal';

  return (
    <div style={{ paddingTop: 96 }} className="pb-12">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-10">
        <Reveal>
          <div className="kicker">MODULE 03 · OCEAN × ATMOSPHERE</div>
          <h1 className="title-disp text-[26px] md:text-[34px] mt-2 grad-text">洋流 × 大气：一张互相牵动的网</h1>
          <p className="mt-3 text-[13.5px] text-[#8ba7c6] max-w-3xl leading-relaxed">
            风驱动洋流，洋流反过来加热或冷却大气。三个实验依次回答：三圈环流如何塑造风带？季风如何改写北印度洋？海温异常如何引爆全球天气（厄尔尼诺）？
          </p>
        </Reveal>

        {/* 页内导航 */}
        <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
          {[['#winds', '① 风带与洋流'], ['#monsoon', '② 季风与北印度洋'], ['#enso', '③ 沃克环流与厄尔尼诺']].map(([h, l]) => (
            <a key={h} href={h} className="badge badge-accent hover:brightness-125">{l}</a>
          ))}
        </div>
        <div id="winds" className="grid lg:grid-cols-[340px_1fr] gap-4 items-stretch">
          <Panel className="p-5">
            <div className="kicker text-[10px]">GLOBAL CIRCULATION · 三圈环流</div>
            <h3 className="text-[16px] font-bold mt-2 text-[#eaf6ff]">风从哪里来</h3>
            <p className="text-[12.5px] leading-relaxed text-[#8ba7c6] mt-2">
              赤道受热最强，空气上升 → 高空流向两极 → 30° 附近下沉（副热带高压）→ 低空流回赤道。
              地转偏向力使低空气流偏转，于是地面形成信风带、西风带与极地东风带——<b className="text-[#d9fffd]">风带就是洋流的第一推动力</b>。
            </p>
            <div className="mt-3 space-y-1.5 text-[12px] text-[#8ba7c6]">
              <div>· 赤道受热上升 → 高空向两极 → 30° 副热带高压下沉 → 低空回流（哈德莱环流）</div>
              <div>· 北半球信风为东北信风，南半球为东南信风——“偏转”就是地转偏向力</div>
              <div>· 中纬盛行西风——西风漂流的“发动机”</div>
              <div>· 极地东风驱动南极沿岸环流</div>
            </div>
          </Panel>

          <div className="rounded-[16px] overflow-hidden border border-[rgba(126,190,255,0.16)] relative flex items-center" style={{ minHeight: 480 }}>
            <ThreeCellDiagram />
            <div className="absolute top-3 left-3 pointer-events-none">
              <span className="badge" style={{ background: 'rgba(4,14,28,0.78)' }}>三圈环流剖面：赤道上升 → 30° 下沉 → 低空回流，地转偏转 → 三个风带</span>
            </div>
          </div>
        </div>
      </div>

      {/* ② 季风与北印度洋 */}
      <div id="monsoon" className="mx-auto max-w-[1500px] px-6 lg:px-10 mt-14">
        <Reveal>
          <div className="kicker">PART 02 · MONSOON</div>
          <h2 className="title-disp text-[22px] md:text-[26px] mt-2 grad-text">季风改写北印度洋</h2>
          <p className="mt-2 text-[13px] text-[#8ba7c6] max-w-3xl">切换夏季 / 冬季：风向、洋流方向、索马里沿岸寒暖全部反转——北印度洋是全球唯一冬夏流向相反的大洋。</p>
        </Reveal>
        <div className="mt-5 grid lg:grid-cols-[1fr_360px] gap-4">
          <div className="rounded-[16px] overflow-hidden border border-[rgba(126,190,255,0.16)] relative h-[480px] md:h-[540px] lg:h-[560px]">
            <MonsoonMap
              season={season}
              className="w-full h-full"
              style={{ minHeight: 460 }}
            />
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
              <span className="badge" style={{ background: 'rgba(4,14,28,0.78)' }}>动态因果演示：风 → 海水 → 洋流 → 上升流</span>
              {season === 'summer' ? (
                <span className="badge badge-cold" style={{ background: 'rgba(4,14,28,0.78)' }}>索马里寒流（上升流·冷蓝水带）</span>
              ) : (
                <span className="badge badge-warm" style={{ background: 'rgba(4,14,28,0.78)' }}>索马里暖流（上升流消失）</span>
              )}
            </div>
            <div className="absolute bottom-3 left-3 pointer-events-auto">
              <Seg<Season>
                options={[{ id: 'summer', label: '夏季（西南季风）' }, { id: 'winter', label: '冬季（东北季风）' }]}
                value={season}
                onChange={setSeason}
              />
            </div>
          </div>
          <div className="space-y-4">
            <Panel className="p-5">
              <div className="kicker text-[10px]">WHY DOES MONSOON FLIP · 季风为什么会反转</div>
              <div className="mt-3"><MonsoonSchematic season={season} onSelect={setSeason} /></div>
              <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-[#a9c3de]">
                {season === 'summer' ? (
                  <>
                    <div><b className="text-[#ffd9ae]">① 大陆受热</b> → 亚欧大陆升温快，形成热低压（G）</div>
                    <div><b className="text-[#ffd9ae]">②</b> 海洋升温慢 → 相对高压，风从海洋吹向大陆</div>
                    <div><b className="text-[#ffd9ae]">③ 西南季风</b> → 表层海水被推向东北，环流顺时针</div>
                  </>
                ) : (
                  <>
                    <div><b className="text-[#bde6ff]">① 大陆冷却</b> → 亚欧大陆降温快，形成冷高压（H）</div>
                    <div><b className="text-[#bde6ff]">②</b> 海洋降温慢 → 相对低压，风从大陆吹向海洋</div>
                    <div><b className="text-[#bde6ff]">③ 东北季风</b> → 表层海水被推向西南，环流逆时针</div>
                  </>
                )}
              </div>
              <p className="text-[11.5px] leading-relaxed text-[#6f8aa7] mt-3">
                冬夏海陆气压场相反 → 季风风向相反 → 表层洋流整体转向。这是“气压梯度力 + 地转偏向力”在区域尺度上的教科书级应用。
              </p>
            </Panel>
            <Panel className="p-5">
              <div className="kicker text-[10px]">WHY UPWELLING · 索马里沿岸为什么有上升流</div>
              {season === 'summer' ? (
                <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-[#a9c3de]">
                  <div><b className="text-[#7fd4ff]">① 西南季风沿岸吹拂</b>：风从海面吹向东北，把表层海水推离海岸</div>
                  <div><b className="text-[#7fd4ff]">② 离岸输运</b>：沿岸表层海水被带走，海面微微“缺位”</div>
                  <div><b className="text-[#7fd4ff]">③ 深层冷水上涌</b>：下层冷海水沿岸上升补位（图中沿岸蓝色低温区）</div>
                  <div><b className="text-[#7fd4ff]">④ 沿岸降温</b>：索马里沿岸夏季反而出现寒流，营养盐丰富 → 渔场“开工”</div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-[#a9c3de]">
                  <div><b className="text-[#bde6ff]">① 东北季风</b>：风从大陆吹向海面，转为<b>向岸风</b></div>
                  <div><b className="text-[#bde6ff]">② 向岸输运</b>：海水被推向岸边，不再缺位</div>
                  <div><b className="text-[#bde6ff]">③ 上升流停止</b>：冷水上涌消失，沿岸水温回升（暖流）</div>
                </div>
              )}
              <div className="mt-3 text-[11px] text-[#5f7b99]">关联影像：“阿拉伯海红色浮游生物”即夏季季风上升流的卫星证据（见洋流档案馆）。</div>
            </Panel>
          </div>
        </div>
      </div>

      {/* ③ 沃克环流与 ENSO */}
      <div id="enso" className="mx-auto max-w-[1500px] px-6 lg:px-10 mt-14">
        <Reveal>
          <div className="kicker">PART 03 · WALKER & ENSO</div>
          <h2 className="title-disp text-[22px] md:text-[26px] mt-2 grad-text">海气实验室：沃克环流与厄尔尼诺</h2>
          <p className="mt-2 text-[13px] text-[#8ba7c6] max-w-3xl">
            拖动“东太平洋海温距平”与“信风强度”，观察剖面图中的环流方向、上升流、温跃层与两侧降水如何连锁变化。
          </p>
        </Reveal>

        <div className="mt-5 grid lg:grid-cols-[1fr_330px] gap-4">
          <Panel className="p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="kicker text-[10px]">PACIFIC CROSS-SECTION · 太平洋赤道剖面（东 = 秘鲁）</div>
              <div className="flex gap-1.5">
                {ENSO_PRESETS.map((p) => (
                  <button key={p.label} onClick={() => { setAnomaly(p.anomaly); setTradeWind(p.tradeWind); }}
                    className={`chip !py-1.5 !px-3 ${ensoKey === (p.label === '正常年' ? 'normal' : p.label === '厄尔尼诺' ? 'elnino' : 'lanina') ? 'chip-on' : ''}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <WalkerCanvas state={enso} />
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <Slider label="东太平洋海温距平" value={anomaly} min={-3} max={3} step={0.1} onChange={setAnomaly} unit=" ℃" />
              <Slider label="东南信风强度" value={tradeWind} min={0} max={100} onChange={setTradeWind} unit=" %" />
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel className="p-5">
              <div className="kicker text-[10px]">LIVE METERS · 联动指标</div>
              <div className="mt-3 space-y-3">
                {[
                  { label: '秘鲁上升流强度', v: upwell, col: 'rgba(94,200,255,0.9)' },
                  { label: '秘鲁渔场丰产度', v: fishery, col: 'rgba(111,227,224,0.9)' },
                  { label: '印尼—西太降水', v: indoRain, col: 'rgba(255,157,92,0.9)' },
                  { label: '秘鲁沿岸降水', v: peruRain, col: 'rgba(255,157,92,0.9)' },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between text-[12px] text-[#a9c3de] mb-1">
                      <span>{m.label}</span><span className="num">{m.v}%</span>
                    </div>
                    <div className="h-[6px] rounded-full bg-[rgba(60,90,120,0.25)] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${m.v}%`, background: `linear-gradient(90deg, ${m.col}66, ${m.col})`, boxShadow: `0 0 8px ${m.col}88` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel className="p-5">
              <div className="kicker text-[10px]">TEXTBOOK NOTES · {ensoKey === 'normal' ? '正常年' : ensoKey === 'elnino' ? '厄尔尼诺年' : '拉尼娜年'}</div>
              <ul className="mt-3 space-y-2">
                {(ENSO_NOTES[ensoKey] ?? []).map((t, i) => (
                  <li key={i} className="text-[12px] leading-relaxed text-[#a9c3de] flex gap-2"><span className="text-[#6fe3e0]">›</span>{t}</li>
                ))}
              </ul>
              <div className="mt-3 text-[11px] text-[#5f7b99]">
                * 对我国的影响为简化教学表述，实际强度因年而异。想要精细操作？去 <b className="text-[#8fb7d8]">地理实验室 → 厄尔尼诺模拟</b>。
              </div>
            </Panel>
          </div>
        </div>

        <Reveal>
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            <div className="glass p-4">
              <ImageCard k="pacificSeaLevel" />
            </div>
            <div className="glass p-4">
              <ImageCard k="ensoAtmosphere" />
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function ImageCard({ k }: { k: string }) {
  // 客户端加载图片元数据（避免 SSR 读取 public JSON）
  const [meta, setMeta] = useState<{ url: string; caption: string; source: string; pageUrl: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(asset('/data/case-images.json')).then((r) => r.json()).then((j) => { if (alive && j[k]) setMeta({ ...j[k], url: asset(j[k].url) }); }).catch(() => {});
    return () => { alive = false; };
  }, [k]);
  if (!meta) return <div className="text-[12px] text-[#5f7b99]">正在加载影像…</div>;
  return (
    <div>
      <img src={meta.url} alt={meta.caption} className="rounded-[10px] w-full max-h-56 object-cover"
        style={{ border: '1px solid rgba(126,190,255,0.14)', filter: 'saturate(0.9) brightness(0.95)' }} />
      <div className="text-[11px] leading-relaxed text-[#8ba7c6] mt-2">{meta.caption}</div>
      <div className="text-[10.5px] text-[#5f7b99] mt-1">
        {meta.source} · <a href={meta.pageUrl} target="_blank" rel="noreferrer" className="underline hover:text-[#d9fffd]">来源</a>
      </div>
    </div>
  );
}
