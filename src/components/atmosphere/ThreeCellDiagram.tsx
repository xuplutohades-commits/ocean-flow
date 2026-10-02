'use client';
/** 三圈环流剖面示意（SMIL 动画） */
export default function ThreeCellDiagram() {
  const W = 640;
  const H = 300;
  const surf = H - 34;
  const top = 26;
  const mid = (surf + top) / 2;

  const cell = (
    x0: number, x1: number,
    dir1: 'up' | 'down',
    color: string, rev = false,
  ): { rect: React.ReactNode; key: string } => {
    const cx = (x0 + x1) / 2;
    const cy = (surf + top) / 2;
    const rx = (x1 - x0) * 0.42;
    const ry = (surf - top) * 0.42;
    const ellipsePath = `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 ${rev ? 0 : 1} ${2 * rx} 0 a ${rx} ${ry} 0 1 ${rev ? 0 : 1} ${-2 * rx} 0`;
    return {
      key: `${x0}-${x1}`,
      rect: (
        <g>
          {dir1 === 'up' ? (
            <path d={`M ${cx - 34} ${surf + 4} L ${cx} ${mid - 8} L ${cx + 34} ${surf + 4} Z`} fill={color} opacity={0.5} />
          ) : (
            <path d={`M ${cx - 34} ${top - 2} L ${cx} ${mid + 8} L ${cx + 34} ${top - 2} Z`} fill={color} opacity={0.5} />
          )}
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="4 4" opacity={0.75} />
          <circle r={4} fill={color} opacity={0.9}>
            <animateMotion dur="5.5s" repeatCount="indefinite" path={ellipsePath} />
          </circle>
        </g>
      ),
    };
  };

  // 左（北半球）→ 右（南半球）：极地（下沉）/ 副极地（上升）/ 副热带（下沉对流）
  const north: ReturnType<typeof cell>[] = [];
  const mk = (x0: number, x1: number, dir: 'up' | 'down', color: string, rev = false) => {
    const c = cell(x0, x1, dir, color, rev);
    north.push(c);
  };
  mk(140, 210, 'down', '#5ec8ff');
  mk(250, 330, 'up', '#7fe3e0');
  mk(360, 440, 'up', '#ffd9ae');
  mk(450, 530, 'up', '#ffd9ae', true);
  mk(560, 640, 'up', '#7fe3e0', true);
  mk(660, 740, 'down', '#5ec8ff', true);

  const lat = (l: number, label: string, y: number, anchor = 'middle') => (
    <text x={l} y={y} textAnchor={anchor as 'middle'} fontSize={10} fill="#7fa3c4" fontWeight={600}>{label}</text>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="三圈环流示意图">
      <defs>
        <linearGradient id="tcbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(10,40,72,0.25)" />
          <stop offset="1" stopColor="rgba(6,22,42,0.1)" />
        </linearGradient>
      </defs>
      <rect x={-40} y={0} width={W + 80} height={H} fill="url(#tcbg)" />
      {/* 平流层/对流层顶 */}
      <line x1={0} y1={top} x2={W} y2={top} stroke="rgba(126,190,255,0.4)" strokeWidth={1} />
      <text x={W - 6} y={top - 6} textAnchor="end" fontSize={10} fill="#7fa3c4">对流层顶</text>
      <line x1={0} y1={surf} x2={W} y2={surf} stroke="rgba(140,220,255,0.55)" strokeWidth={2} />
      <text x={W - 6} y={surf + 16} textAnchor="end" fontSize={10} fill="#7fa3c4">地表</text>

      {/* 细胞 */}
      {north.map((c, i) => <g key={c.key}>{c.rect}</g>)}

      {/* 地面风箭头 */}
      {[
        { x: 175, dir: 1, label: '极地东风' },
        { x: 290, dir: 1, label: '盛行西风' },
        { x: 400, dir: -1, label: '信风' },
        { x: 490, dir: 1, label: '信风' },
        { x: 600, dir: -1, label: '盛行西风' },
        { x: 700, dir: -1, label: '极地东风' },
      ].map((a, i) => (
        <g key={i}>
          <line x1={a.x - 16 * a.dir} y1={surf - 10} x2={a.x + 16 * a.dir} y2={surf - 10}
            stroke="rgba(200,235,255,0.85)" strokeWidth={2.4} markerEnd={`url(#arr${i % 2})`} />
          {i === 2 && <text x={a.x} y={surf + 30} textAnchor="middle" fontSize={9.5} fill="#9db9d6">赤道无风带</text>}
          {i === 1 && <text x={a.x} y={surf - 20} textAnchor="middle" fontSize={9.5} fill="#7fa3c4">{a.label}</text>}
        </g>
      ))}
      <defs>
        <marker id="arr0" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 Z" fill="rgba(200,235,255,0.9)" />
        </marker>
        <marker id="arr1" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 Z" fill="rgba(200,235,255,0.9)" />
        </marker>
      </defs>

      {/* 气压带标注 */}
      {lat(175, '极地高压', 18)}
      {lat(290, '副极地低压', 18)}
      {lat(400, '副热带高压', 18)}
      {lat(490, '副热带高压', 18)}
      {lat(600, '副极地低压', 18)}
      {lat(700, '极地高压', 18)}
      {lat(400, '赤道低压（上升气流）', surf + 46)}
      <text x={110} y={150} fontSize={10} fill="#7fa3c4" textAnchor="middle" transform="rotate(-90 110 150)">北半球</text>
    </svg>
  );
}
