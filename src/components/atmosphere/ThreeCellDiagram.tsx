'use client';
/**
 * 三圈环流与全球风带 —— 剖面示意（左 90°N → 右 90°S）
 *
 * 结构（严格镜像，六单元等宽）：
 *   POLAR | FERREL | HADLEY | HADLEY | FERREL | POLAR
 *  90°N    60°N     30°N     0°      30°S    60°S    90°S
 *
 * 垂直运动：0° 上升（赤道受热）· 30° 下沉（副热带高压）· 60° 上升（副极地低压）· 90° 下沉（极地高压）
 * 地转偏向力使近地面气流偏转 → 东北/东南信风、盛行西风、极地东风。
 * 环流圈用"流线式闭合回环"（顶底横线 + 圆角转向），不用椭圆；方向与物理一致。
 */
export default function ThreeCellDiagram() {
  const W = 900;
  const H = 500;
  const yT = 150;          // 环流带顶
  const yB = 334;          // 环流带底
  const R = 26;            // 圆角半径

  // 纬度柱（七个，等距）
  const latXs = [60, 190, 320, 450, 580, 710, 840];
  const latNames = ['90°N', '60°N', '30°N', '0°', '30°S', '60°S', '90°S'];

  // 生成顺时针闭合回环点列（顶边左→右 → 右上角 → 右边 ↓ → 右下角 → 底边右→左 → 左下角 → 左边 ↑ → 左上角）
  const loopCW = (x0: number, x1: number, r = R): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    const push = (x: number, y: number) => {
      const l = pts.length;
      if (l === 0 || Math.hypot(x - pts[l - 1][0], y - pts[l - 1][1]) > 2.4) pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    };
    const arc = (cx: number, cy: number, a0: number, a1: number) => {
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const a = ((a0 + (a1 - a0) * i / steps) * Math.PI) / 180;
        push(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
    };
    const x0r = x0 + r, x1r = x1 - r;
    for (let x = x0r; x <= x1r; x += 3) push(x, yT);      // 顶边 L→R
    arc(x1r, yT + r, 270, 360);                            // 右上角
    for (let y = yT + r; y <= yB - r; y += 3) push(x1, y); // 右边 ↓
    arc(x1r, yB - r, 0, 90);                               // 右下角
    for (let x = x1r; x >= x0r; x -= 3) push(x, yB);       // 底边 R→L
    arc(x0r, yB - r, 90, 180);                             // 左下角
    for (let y = yB - r; y >= yT + r; y -= 3) push(x0, y); // 左边 ↑
    arc(x0r, yT + r, 180, 270);                            // 左上角
    return pts;
  };
  const pathOf = (pts: Array<[number, number]>, rev: boolean) =>
    `M ${pts.map((p) => `${p[0]} ${p[1]}`).join(' L ')} Z`;
  const loopPath = (x0: number, x1: number, rev: boolean) => {
    const pts = loopCW(x0, x1);
    return pathOf(rev ? [...pts].reverse() : pts, rev);
  };
  const midXY = (x0: number, x1: number) => [(x0 + x1) / 2, (yT + yB) / 2];

  // 六单元：等宽、南北镜像；北=逆时针(极地/哈德莱)/顺时针(费雷尔)，南反之
  const cells: Array<{ kind: 'polar' | 'ferrel' | 'hadley'; zone: number; rev: boolean }> = [
    { kind: 'polar', zone: 0, rev: true },
    { kind: 'ferrel', zone: 1, rev: false },
    { kind: 'hadley', zone: 2, rev: true },
    { kind: 'hadley', zone: 3, rev: false },
    { kind: 'ferrel', zone: 4, rev: true },
    { kind: 'polar', zone: 5, rev: false },
  ];
  const COLOR: Record<string, string> = { hadley: '#ffb47d', ferrel: '#7fe3e0', polar: '#5ec8ff' };
  const COLOR_L: Record<string, string> = { hadley: '#ffc9a0', ferrel: '#a9f0ed', polar: '#90d2f5' };
  const NAME: Record<string, { zh: string; en: string }> = {
    hadley: { zh: '哈德莱环流', en: 'HADLEY CELL' },
    ferrel: { zh: '中纬环流', en: 'FERREL CELL' },
    polar: { zh: '极地环流', en: 'POLAR CELL' },
  };

  // 节点：纬度 → 上升/下沉 与气压带
  const nodes: Array<{ x: number; up: boolean; label: string; strong?: boolean }> = [
    { x: 450, up: true, label: '赤道受热上升', strong: true },
    { x: 320, up: false, label: '30° 下沉' },
    { x: 580, up: false, label: '30° 下沉' },
    { x: 190, up: true, label: '60° 上升' },
    { x: 710, up: true, label: '60° 上升' },
    { x: 60, up: false, label: '极地下沉' },
    { x: 840, up: false, label: '极地下沉' },
  ];
  const pressures = ['极地高压', '副极地低压', '副热带高压', '赤道低压', '副热带高压', '副极地低压', '极地高压'];

  // 地面风带（近地面 meridional 分量）：等宽区域
  const winds: Array<{ x0: number; x1: number; dir: number; name: string }> = [
    { x0: 60, x1: 190, dir: 1, name: '极地东风带' },
    { x0: 190, x1: 320, dir: -1, name: '盛行西风带' },
    { x0: 320, x1: 450, dir: 1, name: '东北信风带' },
    { x0: 450, x1: 580, dir: -1, name: '东南信风带' },
    { x0: 580, x1: 710, dir: 1, name: '盛行西风带' },
    { x0: 710, x1: 840, dir: -1, name: '极地东风带' },
  ];

  const chevron = (x: number, y: number, dir: number) => (
    <path
      d={`M ${x - 5 * dir} ${y - 3} L ${x + 2 * dir} ${y} L ${x - 5 * dir} ${y + 3}`}
      fill="none" stroke="rgba(225,245,255,0.85)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
    />
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="三圈环流与全球风带剖面示意图">
      <defs>
        <marker id="tcUp" markerWidth="8" markerHeight="8" refX="4" refY="6" orient="auto">
          <path d="M0,8 L4,0 L8,8 Z" fill="#ffc9a0" />
        </marker>
        <marker id="tcDown" markerWidth="8" markerHeight="8" refX="4" refY="2" orient="auto">
          <path d="M0,0 L4,8 L8,0 Z" fill="#9fd2ff" />
        </marker>
        <marker id="tcWind" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(220,245,255,0.95)" />
        </marker>
        <radialGradient id="tcGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgba(255,180,125,0.16)" />
          <stop offset="1" stopColor="rgba(255,180,125,0)" />
        </radialGradient>
      </defs>

      {/* ===== L1 标题 ===== */}
      <text x={W / 2} y={38} textAnchor="middle" fontSize={18} fontWeight={700} fill="#eaf6ff" letterSpacing={1}>三圈环流与全球风带</text>
      <text x={W / 2} y={58} textAnchor="middle" fontSize={10.5} fill="#8ba7c6">太阳辐射差异 + 地转偏向力 → 全球大气环流</text>
      <line x1={40} y1={74} x2={860} y2={74} stroke="rgba(126,190,255,0.16)" strokeWidth={1} />

      {/* ===== 气压带层 ===== */}
      <rect x={60} y={86} width={780} height={24} rx={6} fill="rgba(8,30,55,0.4)" stroke="rgba(126,190,255,0.12)" strokeWidth={1} />
      {pressures.map((p, i) => (
        <text key={p} x={latXs[i]} y={102} textAnchor="middle" fontSize={8.5}
          fill={i === 3 ? '#ffd9ae' : '#8aa8c6'} fontWeight={i === 3 ? 700 : 500}>{p}</text>
      ))}

      {/* ===== 纬度辅助线（0° 强调，30/60 略强调） ===== */}
      {latXs.map((x, i) => (
        <g key={i}>
          <line x1={x} y1={118} x2={x} y2={yB + 4} stroke={
            i === 3 ? 'rgba(111,227,224,0.34)' : i === 1 || i === 5 ? 'rgba(126,190,255,0.2)' : i === 2 || i === 4 ? 'rgba(126,190,255,0.2)' : 'rgba(126,190,255,0.12)'
          } strokeWidth={i === 3 ? 1.4 : 1} strokeDasharray={i === 3 ? 'none' : '3 4'} />
          <text x={x} y={134} textAnchor="middle" fontSize={9} fill={i === 3 ? '#9fe8e4' : '#6f92b4'} fontWeight={i === 3 ? 700 : 500}>{latNames[i]}</text>
        </g>
      ))}

      {/* ===== 赤道光晕 ===== */}
      <ellipse cx={450} cy={(yT + yB) / 2} rx={170} ry={190} fill="url(#tcGlow)" />

      {/* ===== 六个环流单元 ===== */}
      {cells.map((c, ci) => {
        const x0 = latXs[c.zone] + 5;
        const x1 = latXs[c.zone + 1] - 5;
        const [cx, cy] = midXY(x0, x1);
        const d = loopPath(x0, x1, c.rev);
        const col = COLOR[c.kind];
        // 顶部流线方向：逆时针单元顶边 R→L，顺时针单元顶边 L→R；底边与之相反
        const topDir = c.rev ? -1 : 1;
        return (
          <g key={ci}>
            <path d={d} fill="none" stroke={col} strokeWidth={1.6} opacity={0.55} />
            <circle r={3.4} fill={col} opacity={0.95}>
              <animateMotion dur={c.kind === 'polar' ? '7.5s' : c.kind === 'ferrel' ? '6.5s' : '6s'} repeatCount="indefinite" path={d} />
            </circle>
            {chevron(cx, yT + 3, topDir)}
            {chevron(cx, yB - 3, -topDir)}
            <text x={cx} y={cy - 15} textAnchor="middle" fontSize={8} fill="#5f7b99" letterSpacing={1.6}>{NAME[c.kind].en}</text>
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={COLOR_L[c.kind]}>{NAME[c.kind].zh}</text>
          </g>
        );
      })}

      {/* ===== 垂直运动箭头 + 节点文字 ===== */}
      {nodes.map((n) => (
        <g key={n.label + n.x}>
          {n.up ? (
            <line x1={n.x} y1={326} x2={n.x} y2={178} stroke={n.strong ? '#ffb47d' : 'rgba(143,227,223,0.9)'}
              strokeWidth={n.strong ? 2.4 : 1.8} markerEnd="url(#tcUp)" />
          ) : (
            <line x1={n.x} y1={178} x2={n.x} y2={326} stroke="rgba(159,210,255,0.9)"
              strokeWidth={1.8} markerEnd="url(#tcDown)" />
          )}
          <text x={n.x} y={356} textAnchor="middle" fontSize={n.strong ? 10 : 9.5}
            fill={n.strong ? '#ffc9a0' : n.up ? '#8fe3df' : '#b9dcff'} fontWeight={n.strong ? 700 : 500}>{n.label}</text>
        </g>
      ))}

      {/* ===== 近地面风带 ===== */}
      <line x1={60} y1={382} x2={840} y2={382} stroke="rgba(126,190,255,0.18)" strokeWidth={1} />
      <text x={22} y={420} textAnchor="middle" fontSize={9} fill="#6f92b4" transform="rotate(-90 22 420)">近地面风带</text>
      {winds.map((w) => {
        const cx = (w.x0 + w.x1) / 2;
        return (
          <g key={w.name}>
            <line x1={cx - 13 * w.dir} y1={418} x2={cx + 13 * w.dir} y2={418}
              stroke="rgba(200,235,255,0.9)" strokeWidth={2} markerEnd="url(#tcWind)" />
            <text x={cx} y={440} textAnchor="middle" fontSize={10} fill="#d7ecff">{w.name}</text>
          </g>
        );
      })}
      <text x={450} y={440} textAnchor="middle" fontSize={8.5} fill="#ffd9ae" opacity={0.9}>赤道无风带</text>
    </svg>
  );
}
