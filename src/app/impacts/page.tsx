'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { OceanMap, type OceanMapHandle } from '@/components/map/OceanMap';
import FisheryViz from '@/components/impacts/FisheryViz';
import { Panel, Seg, Reveal } from '@/components/ui/kit';
import { useApp } from '@/store/app';

type Branch = 'climate' | 'fishery' | 'voyage' | 'pollution';

const BRANCHES: { id: Branch; zh: string; en: string; icon: string; brief: string }[] = [
  { id: 'climate', zh: '气候', en: 'CLIMATE', icon: '🌡', brief: '暖流增温增湿 · 寒流降温减湿' },
  { id: 'fishery', zh: '渔场', en: 'FISHERY', icon: '🐟', brief: '寒暖流交汇 · 上升流营养盐' },
  { id: 'voyage', zh: '航海', en: 'VOYAGE', icon: '⛵', brief: '顺流省时 · 海雾与冰山风险' },
  { id: 'pollution', zh: '海洋污染', en: 'POLLUTION', icon: '⚠', brief: '污染物随洋流跨国扩散' },
];

/* ── 气候分支 ── */
function TempBar({ label, v, max = 28, col }: { label: string; v: number; max?: number; col: string }) {
  const frac = Math.abs(v) / max;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11.5px] text-[#a9c3de]">
        <span>{label}</span>
        <span className="num font-bold" style={{ color: col }}>{v > 0 ? '+' : ''}{v} ℃</span>
      </div>
      <div className="h-[48px] flex items-end gap-1 mt-1.5">
        {[0.35, 0.6, 0.85, 1].map((k, i) => (
          <span key={i} className="w-[14%] rounded-t-md transition-all duration-1000"
            style={{ height: `${Math.max(8, frac * 48 * k)}px`, background: `linear-gradient(180deg, ${col}, ${col}55)`, boxShadow: `0 0 10px ${col}44` }} />
        ))}
      </div>
      <div className="text-[10px] text-[#5f7b99] mt-1">1 月均温（示意）</div>
    </div>
  );
}

function ClimateDemo() {
  const [view, setView] = useState<'compare' | 'warm' | 'cold'>('compare');
  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      <Seg options={[
        { id: 'compare', label: '同纬度对比' },
        { id: 'warm', label: '暖流增温增湿' },
        { id: 'cold', label: '寒流降温减湿' },
      ] as { id: 'compare' | 'warm' | 'cold'; label: string }[]} value={view} onChange={setView} />
      <div className={view === 'compare' ? 'block' : 'hidden'}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(255,157,92,0.3)' }}>
            <div className="text-[13px] font-bold text-[#ffd9ae]">欧洲西岸 · 伦敦（51.5°N）</div>
            <div className="mt-3"><TempBar label="受北大西洋暖流影响" v={5} col="#ff9d5c" /></div>
            <p className="text-[11.5px] text-[#8ba7c6] mt-2">暖流把低纬热量送进西欧，1 月均温 4～6 ℃，港口冬季不冻。</p>
          </div>
          <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(94,200,255,0.3)' }}>
            <div className="text-[13px] font-bold text-[#bde6ff]">北美同纬度 · 魁北克（46°N）</div>
            <div className="mt-3"><TempBar label="同纬度但无暖流" v={-15} col="#5ec8ff" max={28} /></div>
            <p className="text-[11.5px] text-[#8ba7c6] mt-2">同纬度的北美东岸受大陆性气候与寒流影响，1 月均温低至 −15 ℃。差 20 ℃，这就是暖流强弱的差距。</p>
          </div>
        </div>
        <p className="text-[11.5px] text-[#5f7b99] mt-3">延伸：日本暖流 → 日本南岸冬季温和；秘鲁寒流 → 阿塔卡马沙漠；本格拉寒流 → 纳米布沙漠。详见<a href="/cases/peru" className="text-[#6fe3e0] underline">洋流档案馆</a>。</p>
      </div>
      <div className={view === 'warm' ? 'block' : 'hidden'}>
        <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(255,157,92,0.3)' }}>
          <div className="text-[14px] font-bold text-[#ffd9ae]">暖流对气候：增温 + 增湿</div>
          <p className="text-[12.5px] leading-relaxed text-[#a9c3de] mt-2">
            暖流加热流经海域上方的空气（海气热交换），再借盛行风把热量与水汽送上陆地：
            日本暖流让日本南岸冬季明显暖和；北大西洋暖流让西欧成为同纬度最温暖的地区。寒暖流影响的是<b>气温年较差与降水</b>。
          </p>
          <div className="mt-3 text-[11px] text-[#5f7b99]">演示：北大西洋暖流向大气输送热量（云街）——见洋流档案馆湾流案例。</div>
        </div>
      </div>
      <div className={view === 'cold' ? 'block' : 'hidden'}>
        <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(94,200,255,0.3)' }}>
          <div className="text-[14px] font-bold text-[#bde6ff]">寒流对气候：降温 + 减湿</div>
          <p className="text-[12.5px] leading-relaxed text-[#a9c3de] mt-2">
            寒流使沿岸大气下层冷却、形成稳定逆温，云雨难成——三大“寒流沙漠带”：秘鲁—阿塔卡马、纳米布—本格拉、加那利—撒哈拉西缘、加利福尼亚—墨西哥西北。
            同时寒流上空易形成<b>海雾</b>（暖湿空气遇冷水面凝结）。
          </p>
          <div className="mt-3 text-[11px] text-[#5f7b99]">在地图上：澳大利亚西岸（西澳大利亚寒流）沙漠同样沿海分布。</div>
        </div>
      </div>
    </div>
  );
}

/* ── 渔场分支 ── */
function FisheryDemo() {
  const [view, setView] = useState<'converge' | 'upwell' | 'four'>('converge');
  return (
    <div>
      <Seg options={[
        { id: 'converge', label: '寒暖流交汇型' },
        { id: 'upwell', label: '上升流型' },
        { id: 'four', label: '世界四大渔场' },
      ] as { id: 'converge' | 'upwell' | 'four'; label: string }[]} value={view} onChange={setView} />
      <div className={view === 'converge' ? 'mt-4 grid md:grid-cols-2 gap-4' : 'hidden'}>
        <FisheryViz type="convergence" />
        <div>
          <div className="text-[14px] font-bold text-[#cfe4ff]">为什么交汇处渔产丰饶</div>
          <ul className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-[#a9c3de]">
            <li>① 海水<b>扰动强烈</b>：冷暖水交锋搅动海水，把下层营养盐带到表层；</li>
            <li>② <b>水障效应</b>：鱼群被“困”在锋面两侧聚集，形成移动渔场；</li>
            <li>③ 冷暖水系不同鱼种混合：冷水性 + 暖水性鱼类在同一海域咬合。</li>
          </ul>
          <div className="mt-3 text-[11.5px] text-[#5f7b99]">典型案例：北海道渔场（黑潮×亲潮）、纽芬兰渔场（湾流×拉布拉多寒流）、北海渔场。</div>
        </div>
      </div>
      <div className={view === 'upwell' ? 'mt-4 grid md:grid-cols-2 gap-4' : 'hidden'}>
        <FisheryViz type="upwelling" />
        <div>
          <div className="text-[14px] font-bold text-[#cfe4ff]">上升流渔场：离岸风的馈赠</div>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#a9c3de]">
            秘鲁、本格拉、加利福尼亚、索马里（夏季）等东边界海域，盛行离岸风把表层海水吹走，
            深处富含营养盐的冷水上升，浮游植物爆发 → 浮游动物 → 小鱼群 → 大渔群。秘鲁渔场因此一度是全球渔获量最大的渔场。
          </p>
          <div className="mt-3 text-[11.5px] text-[#5f7b99]">
            注意：上升流渔场与寒暖流交汇渔场的成因不同，但“<b>营养盐 → 浮游生物 → 鱼</b>”链是共同的核心。厄尔尼诺使秘鲁渔场减产，也沿这条链发生。
          </div>
        </div>
      </div>
      <div className={view === 'four' ? 'mt-4 block' : 'hidden'}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { n: '北海道渔场', c: '黑潮 × 千岛寒流', z: '交汇', t: '寒暖流交汇' },
            { n: '纽芬兰渔场', c: '湾流 × 拉布拉多寒流', z: '交汇', t: '寒暖流交汇' },
            { n: '北海渔场', c: '北大西洋暖流 × 北冰洋冷水', z: '交汇', t: '寒暖流交汇' },
            { n: '秘鲁渔场', c: '秘鲁寒流 + 离岸信风', z: '上升', t: '上升流' },
          ].map((f) => (
            <div key={f.n} className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(126,190,255,0.18)' }}>
              <div className="text-[14px] font-bold text-[#eaf6ff]">{f.n}</div>
              <div className="text-[11.5px] text-[#8ba7c6] mt-1.5">{f.c}</div>
              <span className={`badge mt-2 ${f.t === '上升流' ? 'badge-cold' : 'badge-warm'}`}>{f.t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 航海分支 ── */
function VoyageDemo() {
  const [view, setView] = useState<'columbus' | 'ice' | 'modern'>('columbus');
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <div className="space-y-4">
        <Seg options={[
          { id: 'columbus', label: '哥伦布两程对比' },
          { id: 'ice', label: '冰山与海雾' },
          { id: 'modern', label: '现代航运' },
        ] as { id: 'columbus' | 'ice' | 'modern'; label: string }[]} value={view} onChange={setView} />
        {view === 'columbus' && (
          <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid rgba(126,190,255,0.16)' }}>
            <ColumbusSvg />
            <div className="p-3.5 bg-[rgba(8,22,40,0.6)] text-[12px] leading-relaxed text-[#8ba7c6]">
              1492 年哥伦布第一次横渡大西洋：<b className="text-[#ffd9ae]">去程</b>沿加那利寒流 + 北赤道暖流西行，历时约 37 天；
              <b className="text-[#bde6ff]">回程</b>顺墨西哥湾暖流 + 西风带，仅约 3 周。顺流节省的不仅是时间，更是船员的给养与生命。
            </div>
          </div>
        )}
        {view === 'ice' && (
          <div className="rounded-[12px] p-4 text-[12.5px] leading-relaxed text-[#a9c3de]" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(94,200,255,0.3)' }}>
            拉布拉多寒流每年把数百座冰山从格陵兰带入北大西洋航道；湾流暖湿空气在寒流冷水面上冷却，纽芬兰外海终年多雾。
            1912 年 4 月 14 日，“泰坦尼克号”在这片海域撞上冰山沉没，1500 余人遇难——洋流塑造了世界上最繁忙也最危险的航道。
            <div className="mt-2"><Link href="/cases/labrador" className="text-[#6fe3e0] underline">进入档案馆：拉布拉多寒流 →</Link></div>
          </div>
        )}
        {view === 'modern' && (
          <div className="rounded-[12px] p-4 text-[12.5px] leading-relaxed text-[#a9c3de]" style={{ background: 'rgba(8,22,40,0.55)', border: '1px solid rgba(126,190,255,0.25)' }}>
            现代船舶利用洋流规划航线：中欧航线绕好望角时借助本格拉寒流与西风漂流的推送；太平洋航线常沿黑潮—北太平洋暖流东行提速。
            顺流可节省 1～3 天航程，对应可观燃油成本；**逆流**则须预留更多燃料与时间。到<b>地理实验室 → 航海路线实验</b>亲自比较航速。
          </div>
        )}
      </div>
      <div className="rounded-[12px] p-4" style={{ background: 'rgba(8,22,40,0.45)', border: '1px solid rgba(126,190,255,0.14)' }}>
        <div className="kicker-dim mb-2">航行小知识</div>
        <ul className="space-y-2 text-[12px] leading-relaxed text-[#8ba7c6]">
          <li>· 洋流决定帆船时代的航线；蒸汽动力出现后仍是省时关键</li>
          <li>· 寒流携带冰山位置变化无常，冰情巡逻由卫星持续监测</li>
          <li>· 海雾多发区：纽芬兰、日本东北沿岸、纳米布海域</li>
        </ul>
      </div>
    </div>
  );
}

function ColumbusSvg() {
  const W = 560, H = 300;
  const px = (lng: number) => ((lng + 45) / 70) * W;
  const py = (lat: number) => ((50 - lat) / 55) * H;
  const outbound = [[-8, 36], [-16, 28], [-30, 22], [-45, 20], [-60, 22], [-74, 26]]; // 加那利→北赤道→巴哈马
  const inbound = [[-74, 26], [-70, 34], [-62, 40], [-50, 44], [-38, 46], [-22, 44], [-10, 39]]; // 湾流→西风带回程
  const d1 = outbound.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p[0])} ${py(p[1])}`).join(' ');
  const d2 = inbound.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p[0])} ${py(p[1])}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: 'linear-gradient(180deg,#04203a,#032033)' }}>
      <rect x={px(-30)} y={py(55)} width={px(-20) - px(-30)} height={py(5) - py(55)} fill="rgba(120,80,40,0.25)" stroke="rgba(200,220,240,0.3)" />
      <text x={px(-25)} y={py(48)} fontSize={10} fill="#9fb8d4">非洲</text>
      <rect x={px(-85)} y={py(55)} width={px(-70) - px(-85)} height={py(10) - py(55)} fill="rgba(120,80,40,0.25)" stroke="rgba(200,220,240,0.3)" />
      <text x={px(-78)} y={py(48)} fontSize={10} fill="#9fb8d4">美洲</text>
      <rect x={px(-25)} y={py(15)} width={px(-10) - px(-25)} height={py(5) - py(15)} fill="rgba(120,80,40,0.22)" stroke="rgba(200,220,240,0.3)" />
      <text x={px(-17)} y={py(23)} fontSize={9} fill="#9fb8d4">欧洲</text>
      <path d={d1} fill="none" stroke="#ff9d5c" strokeWidth={2.4} strokeDasharray="1 0" opacity={0.85} markerEnd="url(#cmk)" />
      <path d={d2} fill="none" stroke="#5ec8ff" strokeWidth={2.4} opacity={0.85} />
      <defs>
        <marker id="cmk" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ffd9ae" /></marker>
      </defs>
      <circle r={5} fill="#ffd9ae"><animateMotion dur="9s" repeatCount="indefinite" path={d1} /></circle>
      <circle r={5} fill="#bde6ff"><animateMotion dur="6s" repeatCount="indefinite" path={d2} /></circle>
      <text x={px(-8)} y={py(10)} fontSize={11} fontWeight={700} fill="#ffd9ae">去程 37 天 · 借北赤道西行</text>
      <text x={px(-8)} y={py(18)} fontSize={11} fontWeight={700} fill="#bde6ff">回程 3 周 · 顺湾流+西风</text>
      <text x={px(-42)} y={py(32)} fontSize={9.5} fill="#7fa3c4">加那利寒流</text>
      <text x={px(-58)} y={py(24)} fontSize={9.5} fill="#7fa3c4">北赤道暖流</text>
    </svg>
  );
}

/* ── 污染分支 ── */
function PollutionDemo() {
  const { season } = useApp();
  const mapRef = useRef<OceanMapHandle>(null);
  const [source, setSource] = useState<'fukushima' | 'gulf' | 'none'>('fukushima');
  const [speed, setSpeed] = useState(1.2);
  useApp;
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4">
      <div className="rounded-[12px] overflow-hidden relative" style={{ border: '1px solid rgba(255,157,92,0.25)', minHeight: 420 }}>
        <OceanMap
          ref={mapRef}
          season={season}
          speed={speed}
          dense={0.75}
          pollute={source === 'fukushima' ? [{ lng: 141.5, lat: 37.5, color: '#ffb27a', label: '福岛近海', rate: 2.4 }] :
            source === 'gulf' ? [{ lng: -88.5, lat: 28.5, color: '#ffd9ae', label: '墨西哥湾', rate: 2.4 }] : []}
          currentIds={source === 'fukushima'
            ? ['kuroshio', 'northPacCurrent', 'californiaCurrent', 'pacNorthEq']
            : ['atlNorthEq', 'gulfStream', 'northAtlanticCurrent', 'canaryCurrent']}
          showLabels
          dimUnselected
        />
        <div className="absolute top-3 left-3 pointer-events-none">
          <span className="badge" style={{ background: 'rgba(4,14,28,0.8)' }}>
            {source === 'fukushima' ? '2011 福岛近海：污染物随黑潮→北太平洋暖流→北美西海岸' :
              source === 'gulf' ? '2010 深水地平线：油污被湾流带向佛罗里达与东海岸' : '选择上方案例释放污染物'}
          </span>
        </div>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          {([
            { id: 'fukushima', label: '福岛核污染水（2011 起，随黑潮漂向北美）' },
            { id: 'gulf', label: '墨西哥湾石油泄漏（2010，随湾流扩散）' },
            { id: 'none', label: '停止释放' },
          ] as const).map((o) => (
            <button key={o.id}
              onClick={() => { setSource(o.id); mapRef.current?.reset(); }}
              className={`chip w-full justify-between ${source === o.id ? 'chip-on' : ''}`}>
              {o.label}
            </button>
          ))}
        </div>
        <Panel className="p-4">
          <div className="kicker-dim mb-2">扩散演示速度</div>
          <input type="range" className="slider" min={0.3} max={2.4} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          <p className="mt-3 text-[12px] leading-relaxed text-[#8ba7c6]">
            污染物本身不“消失”，只是被稀释。福岛释放的放射性物质数月后在北美西海岸检出；
            太平洋垃圾带则聚集在副热带环流中心——洋流能搬运，也能“收藏”。
          </p>
        </Panel>
      </div>
    </div>
  );
}

export default function ImpactsPage() {
  const [branch, setBranch] = useState<Branch>('climate');
  return (
    <div style={{ paddingTop: 96 }} className="pb-14">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-10">
        <Reveal>
          <div className="kicker">MODULE 04 · IMPACTS</div>
          <h1 className="title-disp text-[26px] md:text-[34px] mt-2 grad-text">洋流会带来什么</h1>
          <p className="mt-3 text-[13.5px] text-[#8ba7c6] max-w-3xl leading-relaxed">
            气候、渔场、航海、污染——四条由洋流引发的因果链。点击分支展开互动演示，把“洋流”与“人间”连起来。
          </p>
        </Reveal>

        {/* 因果网络 */}
        <Reveal delay={0.05}>
          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {BRANCHES.map((b) => (
              <button key={b.id}
                onClick={() => setBranch(b.id)}
                className={`glass p-5 text-left transition-all hover:-translate-y-0.5 ${branch === b.id ? 'ring-1 ring-[rgba(111,227,224,0.6)]' : ''}`}
                style={branch === b.id ? { boxShadow: '0 0 30px rgba(111,227,224,0.15)' } : undefined}>
                <div className="text-[22px]">{b.icon}</div>
                <div className="kicker text-[9.5px] mt-3">{b.en}</div>
                <div className="text-[16px] font-bold text-[#eaf6ff] mt-1">{b.zh}</div>
                <div className="text-[11.5px] text-[#7996b5] mt-1.5 leading-relaxed">{b.brief}</div>
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-4 min-h-[420px]">
            <div key={branch} className="animate-[floaty_0.4s_ease]">
              {branch === 'climate' && <ClimateDemo />}
              {branch === 'fishery' && <FisheryDemo />}
              {branch === 'voyage' && <VoyageDemo />}
              {branch === 'pollution' && <PollutionDemo />}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
