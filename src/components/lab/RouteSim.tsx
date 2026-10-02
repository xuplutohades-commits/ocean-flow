'use client';
/** 航海路线实验：SVG 世界小图 + 顺流/逆流双船对比 */
const W = 700;
const H = 330;
const X = (lng: number) => ((lng + 180) / 360) * W;
const Y = (lat: number) => ((90 - lat) / 180) * H;

export interface RouteDef {
  id: string;
  label: string;
  desc: string;
  outbound: [number, number][];
  inbound: [number, number][];
  base: number; // 基准航时（单位：示意天）
  assist: number; // 顺流增益 %
  penalty: number; // 逆流损耗 %
}

export const ROUTES: RouteDef[] = [
  {
    id: 'pacific-east',
    label: '上海 → 洛杉矶',
    desc: '顺黑潮 + 北太平洋暖流东行，利用中纬西风带',
    outbound: [[122, 31], [128, 30], [135, 33], [143, 36], [152, 40], [162, 42], [172, 44], [-180, 45], [-168, 44], [-155, 43], [-140, 41], [-124, 34], [-118, 34]],
    inbound: [[-118, 34], [-140, 40], [-158, 43], [-175, 44], [170, 42], [155, 40], [142, 37], [132, 33], [124, 30], [122, 31]],
    base: 22,
    assist: 18,
    penalty: 14,
  },
  {
    id: 'pacific-west',
    label: '洛杉矶 → 上海',
    desc: '去西西行：加利福尼亚寒流 + 北赤道暖流，仍可借东风',
    outbound: [[-118, 34], [-124, 32], [-128, 27], [-128, 20], [-122, 15], [-112, 13], [-98, 11], [-82, 10], [-66, 9], [-50, 9], [-34, 10], [-18, 11], [-2, 11], [14, 11], [30, 11], [46, 9], [62, 8], [78, 9], [94, 11], [110, 13], [122, 15], [128, 22], [124, 30], [122, 31]],
    inbound: [[122, 31], [150, 34], [-180, 38], [-155, 34], [-135, 29], [-122, 25], [-118, 34]],
    base: 20,
    assist: 12,
    penalty: 16,
  },
  {
    id: 'columbus',
    label: '哥伦布去程 vs 回程',
    desc: '去程绕加那利—北赤道西行；回程借湾流+西风',
    outbound: [[-8, 36], [-16, 28], [-30, 22], [-45, 20], [-60, 22], [-74, 26]],
    inbound: [[-74, 26], [-68, 34], [-58, 40], [-46, 44], [-32, 46], [-16, 43], [-9, 39]],
    base: 37,
    assist: 42,
    penalty: 100, // 去程真的"慢"很多其实是因为逆风逆流；示意用
  },
];

export default function RouteSim({ route, speedK, assist, penalty, comparing }: {
  route: RouteDef; speedK: number; assist: number; penalty: number; comparing?: boolean;
}) {
  const effDown = Math.max(0.3, 1 + assist * speedK * 0.02);
  const effUp = Math.max(0.25, 1 - penalty * speedK * 0.02);
  const tDown = Math.round((route.base / effDown) * 10) / 10;
  const tUp = Math.round((route.base / effUp) * 10) / 10;
  const d1 = route.outbound.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(p[0])} ${Y(p[1])}`).join(' ');
  const d2 = route.inbound.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(p[0])} ${Y(p[1])}`).join(' ');
  return (
    <div>
      <div className="rounded-[12px] overflow-hidden relative" style={{ border: '1px solid rgba(126,190,255,0.18)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: 'linear-gradient(180deg,#032034,#032a44)' }}>
          {/* 大陆示意 */}
          {[[[100, 25], [115, 30], [135, 42], [105, 55], [100, 25]], [[-70, 20], [-95, 30], [-125, 50], [-110, 60], [-70, 20]]].map((p, i) => (
            <polygon key={i} points={p.map(([a, b]) => `${X(a)},${Y(b)}`).join(' ')} fill="rgba(100,80,60,0.3)" stroke="rgba(200,220,240,0.3)" strokeWidth="1" />
          ))}
          <path d={d1} fill="none" stroke="#ff9d5c" strokeWidth={2.2} strokeDasharray="6 4" opacity={0.8} />
          <path d={d2} fill="none" stroke="#5ec8ff" strokeWidth={2.2} strokeDasharray="6 4" opacity={0.8} />
          <circle r={4.5} fill="#ffd9ae">
            <animateMotion dur={`${tDown * 0.6}s`} repeatCount="indefinite" path={d1} />
          </circle>
          <circle r={4.5} fill="#bde6ff">
            <animateMotion dur={`${tUp * 0.6}s`} repeatCount="indefinite" path={d2} />
          </circle>
        </svg>
        <div className="absolute top-2 left-2 flex gap-2">
          <span className="badge badge-warm">● 方向 A（顺流潜力）</span>
          <span className="badge badge-cold">● 方向 B（对比）</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-[12px] p-3" style={{ background: 'rgba(255,157,92,0.08)', border: '1px solid rgba(255,157,92,0.3)' }}>
          <div className="text-[11px] text-[#ffd9ae]">方向 A · 顺流组合</div>
          <div className="num text-[22px] font-bold text-[#ffd9ae] mt-1">{tDown}<span className="text-[12px]"> 天</span></div>
          <div className="text-[10.5px] text-[#a9c3de] mt-1">船速增益 ≈ {(effDown - 1) * 100 | 0}%（含洋流推送{Math.round(assist)}%）</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ background: 'rgba(94,200,255,0.08)', border: '1px solid rgba(94,200,255,0.3)' }}>
          <div className="text-[11px] text-[#bde6ff]">方向 B · 常规</div>
          <div className="num text-[22px] font-bold text-[#bde6ff] mt-1">{tUp}<span className="text-[12px]"> 天</span></div>
          <div className="text-[10.5px] text-[#a9c3de] mt-1">受逆流影响损失 ≈ {Math.round(penalty * speedK * 0.02 * 100)}%</div>
        </div>
      </div>
    </div>
  );
}
