/** 轻量伪噪声：多频正弦叠加，用于粒子抖动，避免明显规律 */
export function pseudoNoise(t: number, seed = 0): number {
  return (
    Math.sin(t * 1.7 + seed * 12.9898) * 0.5 +
    Math.sin(t * 3.1 + seed * 78.233) * 0.3 +
    Math.sin(t * 7.7 + seed * 37.719) * 0.2
  );
}

/** 0..1 平滑噪声（用于温度等渐变的抖动） */
export function smoothNoise(x: number, seed = 1): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i, seed);
  const b = hash(i + 1, seed);
  return a + (b - a) * u;
}

function hash(n: number, seed: number): number {
  const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
