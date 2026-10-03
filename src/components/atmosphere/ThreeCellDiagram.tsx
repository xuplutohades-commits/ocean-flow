'use client';
/**
 * 三圈环流剖面示意（SMIL 动画）：
 * 赤道受热最强，空气上升 → 高空流向两极 → 30° 附近下沉（副热带高压）→ 低空流回赤道；
 * 地转偏向力使低空气流偏转，于是地面形成信风带、西风带与极地东风带。
 */
export default function ThreeCellDiagram() {
  const W = 760;
  const H = 340;
  const top = 38;      // 对流层顶
  const surf = 300;    // 地表
  const cy = (top + surf) / 2;
  const ry = (surf - top) / 2 - 4;
  // 纬度 → 画布 x（屏幕右 = 南半球，左 = 北半球）
  const X = (lat: number) => 380 + (lat / 90) * 320;

  // 六个环流圈：北 极地/费雷尔/哈德莱 + 南对称；dir: sweep 方向
  interface Loop { cx: number; rx: number; color: string; sweep: 0 | 1; label?: string }
  const loops: Loop[] = [
    { cx: (X(90) + X(60)) / 2, rx: (X(90) - X(60)) / 2, color: '#5ec8ff', sweep: 0 },
    { cx: (X(60) + X(30)) / 2, rx: (X(60) - X(30)) / 2, color: '#7fe3e0', sweep: 0 },
    { cx: (X(30) + X(0)) / 2,  rx: (X(30) - X(0)) / 2,  color: '#ffd9ae', sweep: 0 },
    { cx: (X(0) + X(-30)) / 2, rx: (X(-30) - X(0)) / 2, color: '#ffd9ae', sweep: 1 },
    { cx: (X(-30) + X(-60)) / 2, rx: (X(-60) - X(-30)) / 2, color: '#7fe3e0', sweep: 1 },
    { cx: (X(-60) + X(-90)) / 2, rx: (X(-90) - X(-60)) / 2, color: '#5ec8ff', sweep: 1 },
  ];
  const loopPath = (c: Loop) =>
    `M ${c.cx - c.rx} ${cy} a ${c.rx} ${ry} 0 1 ${c.sweep} ${2 * c.rx} 0 a ${c.rx} ${ry} 0 1 ${c.sweep} ${-2 * c.rx} 0`;

  // 上升 / 下沉三角标记
  const nodeMark = (x: number, up: boolean, color: string) => (
    <path
      d={up
        ? `M ${x - 7} ${cy + 8} L ${x + 7} ${cy + 8} L ${x} ${cy - 8} Z`
        : `M ${x - 7} ${cy - 8} L ${x + 7} ${cy - 8} L ${x} ${cy + 8} Z`}
      fill={color}
    />
  );

  const latLbl = (lat: number, label: string, y: number, pageSize = 9.5) => (
    <text x={X(lat)} y={y} textAnchor="middle" fontSize={pageSize} fill="#7fa3c4" fontWeight={600}>{label}</text>
  );

  const windArrow = (x: number, dir: number, marker: string) => (
    <line x1={x - 14 * dir} y1={surf + 18} x2={x + 14 * dir} y2={surf + 18}
      stroke="rgba(200,235,255,0.95)" strokeWidth={2.2} markerEnd={`url(#${marker})`} />
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="三圈环流剖面示意图">
      <defs>
        <marker id="wArr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(220,245,255,0.95)" />
        </marker>
        <marker id="fArr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(180,220,255,0.8)" />
        </marker>
        <marker id="sArr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(200,235,255,0.7)" />
        </marker>
        <linearGradient id="tcbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(10,40,72,0.28)" />
          <stop offset="1" stopColor="rgba(6,22,42,0.12)" />
        </linearGradient>
      </defs>

      {/* 背景 / 对流层顶 / 地表 */}
      <rect x={-10} y={0} width={W + 20} height={H} fill="url(#tcbg)" />
      <line x1={0} y1={top} x2={W} y2={top} stroke="rgba(126,190,255,0.4)" strokeWidth={1} />
      <text x={W - 4} y={top - 5} textAnchor="end" fontSize={9} fill="#7fa3c4">对流层顶</text>
      <line x1={0} y1={surf} x2={W} y2={surf} stroke="rgba(140,220,255,0.55)" strokeWidth={2} />

      {/* 六个环流圈 + 动点 */}
      {loops.map((c, i) => (
        <g key={i}>
          <ellipse cx={c.cx} cy={cy} rx={c.rx} ry={ry} fill="none" stroke={c.color}
            strokeWidth={1.4} strokeDasharray="4 4" opacity={0.55} />
          <circle r={3.6} fill={c.color} opacity={0.95}>
            <animateMotion dur={i < 3 ? '7s' : '6s'} repeatCount="indefinite" path={loopPath(c)} />
          </circle>
        </g>
      ))}

      {/* 上升 / 下沉节点 */}
      {nodeMark(X(0), true, '#ffb47d')}
      {nodeMark(X(30), false, '#9fd2ff')}
      {nodeMark(X(-30), false, '#9fd2ff')}
      {nodeMark(X(60), true, '#8fe3df')}
      {nodeMark(X(-60), true, '#8fe3df')}
      {nodeMark(X(90), false, '#9fd2ff')}
      {nodeMark(X(-90), false, '#9fd2ff')}

      {/* 高空与低空流动方向箭头 */}
      <g stroke="rgba(200,235,255,0.85)" strokeWidth={1.8} fill="none">
        <line x1={355} y1={70} x2={292} y2={70} markerEnd="url(#fArr)" />
        <line x1={405} y1={70} x2={468} y2={70} markerEnd="url(#fArr)" />
        <line x1={288} y1={282} x2={352} y2={282} markerEnd="url(#sArr)" />
        <line x1={472} y1={282} x2={408} y2={282} markerEnd="url(#sArr)" />
      </g>
      <text x={380} y={62} textAnchor="middle" fontSize={9.5} fill="#9db9d6">高空流向两极</text>
      <text x={380} y={272} textAnchor="middle" fontSize={9.5} fill="#9db9d6">低空流回赤道</text>

      {/* 关键节点说明 */}
      <text x={X(0)} y={cy - 26} textAnchor="middle" fontSize={10} fill="#ffc9a0" fontWeight={700}>赤道受热上升</text>
      {[30, -30].map((lt) => (
        <g key={lt}>
          <text x={X(lt)} y={cy + 30} textAnchor="middle" fontSize={9.5} fill="#b9dcff">30° 附近下沉</text>
          <text x={X(lt)} y={cy + 41} textAnchor="middle" fontSize={8.5} fill="#7fa3c4">副热带高压</text>
        </g>
      ))}
      {[60, -60].map((lt) => (
        <text key={lt} x={X(lt)} y={cy - 24} textAnchor="middle" fontSize={8.5} fill="#8fbfd8">60° 上升</text>
      ))}

      {/* 气压带 */}
      {latLbl(90, '极地高压', 20, 8)}
      {latLbl(60, '副极地低压', 20, 8)}
      {latLbl(30, '副热带高压', 20, 8)}
      {latLbl(0, '赤道低压', 20, 8)}
      {latLbl(-30, '副热带高压', 20, 8)}
      {latLbl(-60, '副极地低压', 20, 8)}
      {latLbl(-90, '极地高压', 20, 8)}

      {/* 地表三个风带（地转偏向力偏转后的地面风） */}
      {['极地东风带', '盛行西风带', '信风带（东北）'].map((t, i) => {
        const lat0 = i === 0 ? 90 : i === 1 ? 60 : 30;
        const lat1 = i === 0 ? 60 : i === 1 ? 30 : 0;
        const x = (X(lat0) + X(lat1)) / 2;
        const dir = i === 1 ? 1 : -1; // 西风指向极地，信风/极地东风指向赤道
        return (
          <g key={t}>
            {windArrow(x, dir, 'wArr')}
            <text x={x} y={surf + 33} textAnchor="middle" fontSize={9} fill="#d7ecff">{t}</text>
          </g>
        );
      })}
      {['信风带（东南）', '盛行西风带', '极地东风带'].map((t, i) => {
        const lat0 = i === 0 ? -30 : i === 1 ? -60 : -90;
        const lat1 = i === 0 ? 0 : i === 1 ? -30 : -60;
        const x = (X(lat0) + X(lat1)) / 2;
        const dir = i === 1 ? -1 : 1; // 南半球镜像：西风指向南极，信风/极地东风指向赤道
        return (
          <g key={t}>
            {windArrow(x, dir, 'wArr')}
            <text x={x} y={surf + 33} textAnchor="middle" fontSize={9} fill="#d7ecff">{t}</text>
          </g>
        );
      })}
      <text x={X(0)} y={surf + 33} textAnchor="middle" fontSize={9} fill="#ffd9ae">赤道无风带</text>

      {/* 半球与说明 */}
      <text x={95} y={328} fontSize={9.5} fill="#7fa3c4" textAnchor="middle">北半球 · 气流右偏（东北信风）</text>
      <text x={665} y={328} fontSize={9.5} fill="#7fa3c4" textAnchor="middle">南半球 · 气流左偏（东南信风）</text>
    </svg>
  );
}
