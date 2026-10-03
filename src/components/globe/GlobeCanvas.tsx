'use client';
import { asset } from '@/lib/asset';
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { CURRENTS, pathOf } from '@/data/currents';
import { samplePath } from '@/lib/geo';

const R = 1.0;

function lngLatToVec(lng: number, lat: number, r = 1, out?: THREE.Vector3): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  const v = out ?? new THREE.Vector3();
  return v.set(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}




/** 固定种子 PRNG：让组件在渲染期保持纯函数（随机只在模块构建期发生一次） */
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG2RAD = Math.PI / 180;

/* ── 流场参数 ─────────────────────────────────────────────
 * 全球洋流统一使用“连续平流粒子场”：每条洋流按宽度拥有自己的流带半宽、
 * 流速系数与颜色；粒子在局部速度场里被平流，留下渐变的尾迹。
 * 视觉：柔软、有宽度、持续流动的“海流带”，而不是短线群。
 */
const TRAIL_N = 7;                                            // 每粒子尾迹点数
const TRAIL_W: number[] = [0.05, 0.13, 0.23, 0.35, 0.52, 0.74, 1.0]; // 尾→头 alpha 权重
const TRAIL_STEP = 9;                                         // 每 N 帧记录一个尾迹点
const CORE_SPEED_DEG = 1.3;                                   // 核心带参考流速 °/s
const PARTICLE_LIMIT = 9000;
const WARM: [number, number, number] = [1.0, 0.58, 0.28];     // 柔和的暖橙金
const COLD: [number, number, number] = [0.45, 0.75, 1.0];     // 柔和的蓝青

/** 洋流中心线片段：单位球面上的位置 + 流向切向量 */
interface FieldSeg {
  q: THREE.Vector3;
  t: THREE.Vector3;
}

/** 一条洋流的完整流场：中心线 + 带宽 + 流速系数 + 暖寒属性 */
interface FlowField {
  warm: boolean;
  band: number;         // 流带半宽（速度场 σ，度）
  speedK: number;       // 流速系数
  segs: FieldSeg[];
  total: number;        // 路径总长（度）
}

interface FlowParticle2 {
  dir: THREE.Vector3;   // 单位方向（球心→表面）
  rad: number;          // 距球心半径（轻微深度变化）
  speedF: number;       // 个体速度差
  life: number;
  age: number;
  opacity: number;      // 个体透明度变化
  seed: number;
  step: number;         // 尾迹记录节拍
  segIdx: number;       // 上一帧命中的中心线段（窗口搜索锚点）
  frameCheck: number;   // 定期全量重锚计数
  ff: FlowField;        // 所属洋流的流场
  trail: THREE.Vector3[]; // 尾迹（已乘 rad，head 在末尾）
}

/** 构建全球连续速度场：每条洋流 = 中心线按 0.35° 采样 + 表面切向 */
function buildFlowFields(): FlowField[] {
  const out: FlowField[] = [];
  const tmp = new THREE.Vector3();
  for (const c of CURRENTS) {
    const sp = samplePath(pathOf(c, 'summer'), 0.35);
    if (sp.total < 4) continue;
    const span = c.width ?? 1;
    const qs: THREE.Vector3[] = [];
    for (const [lng, lat] of sp.pts) qs.push(lngLatToVec(lng, lat, 1));
    const segs: FieldSeg[] = [];
    for (let i = 0; i < qs.length - 1; i++) {
      const q = qs[i];
      const t = tmp.copy(qs[i + 1]).sub(q);
      t.addScaledVector(q, -t.dot(q));
      t.normalize();
      segs.push({ q: q.clone(), t: t.clone() });
    }
    out.push({
      warm: c.type === 'warm',
      band: 1.6 + span * 2.0,
      speedK: 0.75 + span * 0.45,
      segs,
      total: sp.total,
    });
  }
  return out;
}

/** 在指定洋流的流带内生成粒子：高斯横向偏移 → 中心密、边缘稀 */
function spawnParticle(ff: FlowField, rnd: () => number, freshAge: boolean): FlowParticle2 {
  const seg = ff.segs[Math.floor(rnd() * ff.segs.length)];
  const g = Math.max(-2.2, Math.min(2.2, (rnd() + rnd() + rnd() - 1.5) / 0.5));
  const perp = new THREE.Vector3().crossVectors(seg.q, seg.t).normalize();
  const dir = new THREE.Vector3()
    .copy(seg.q)
    .addScaledVector(perp, g * 0.6 * ff.band * DEG2RAD)
    .normalize();
  const rad = 1.003 + rnd() * 0.009;
  const pos = dir.clone().multiplyScalar(rad);
  const trail: THREE.Vector3[] = [];
  for (let k = 0; k < TRAIL_N; k++) trail.push(pos.clone());
  const life = 7 + rnd() * 9;
  return {
    dir,
    rad,
    speedF: 0.7 + rnd() * 0.6,
    life,
    age: freshAge ? rnd() * life : 0,
    opacity: 0.42 + rnd() * 0.58,
    seed: rnd() * 100,
    step: 0,
    segIdx: Math.floor(rnd() * ff.segs.length),
    frameCheck: 0,
    ff,
    trail,
  };
}

/** 尾迹淡出的目标色调：等离子流拖尾逐渐溶入深海水色 */
const DEEP_TONE: [number, number, number] = [0.05, 0.14, 0.24];

/**
 * 全球洋流平流粒子场：
 * position → sample local velocity field → update velocity → move → trail → fade → respawn。
 * 方向永远由所在位置的流场决定；尾迹沿流场弯曲、alpha 渐变淡出。
 */
function CurrentFlow() {
  const fields = useMemo(() => buildFlowFields(), []);
  const items = useMemo<FlowParticle2[]>(() => {
    const rnd = mulberry32(20261002);
    const list: FlowParticle2[] = [];
    for (const ff of fields) {
      const n = Math.min(900, Math.max(14, Math.round((ff.total / 0.3) * (0.65 + ff.band * 0.13))));
      for (let i = 0; i < n && list.length < PARTICLE_LIMIT; i++) {
        list.push(spawnParticle(ff, rnd, true));
      }
      if (list.length >= PARTICLE_LIMIT) break;
    }
    return list;
  }, [fields]);

  const segV = (TRAIL_N - 1) * 2;
  const posAttr = useMemo(() => {
    const a = new THREE.BufferAttribute(new Float32Array(items.length * segV * 3), 3);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  }, [items, segV]);
  const colAttr = useMemo(
    () => new THREE.BufferAttribute(new Float32Array(items.length * segV * 3), 3),
    [items, segV],
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', posAttr);
    g.setAttribute('color', colAttr);
    return g;
  }, [posAttr, colAttr]);
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    [],
  );

  const tmpT = useMemo(() => new THREE.Vector3(), []);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpV = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    if (!items.length) return;
    const pos = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const ff = it.ff;
      const sig = ff.band * DEG2RAD;
      // 1) 采样局部速度场：以上一帧命中的中心线段为中心扫 ±18 段
      //    （粒子每帧位移极小，窗口足够）；每 150 帧全量重锚防失锁
      it.frameCheck += 1;
      const fullScan = it.frameCheck >= 150;
      let best = it.segIdx;
      let bd = Infinity;
      if (!fullScan && ff.segs.length > 2) {
        const n = ff.segs.length;
        const from = Math.max(0, best - 18);
        const to = Math.min(n, best + 19);
        for (let j = from; j < to; j++) {
          const dd = it.dir.distanceToSquared(ff.segs[j].q);
          if (dd < bd) { bd = dd; best = j; }
        }
        // 路径首尾相接（环流）：越过接缝时检查另一侧
        if (best < 12) {
          for (let j = n - 18; j < n; j++) {
            const dd = it.dir.distanceToSquared(ff.segs[j].q);
            if (dd < bd) { bd = dd; best = j; }
          }
        } else if (best >= n - 12) {
          for (let j = 0; j < 18; j++) {
            const dd = it.dir.distanceToSquared(ff.segs[j].q);
            if (dd < bd) { bd = dd; best = j; }
          }
        }
      } else {
        it.frameCheck = 0;
        for (let j = 0; j < ff.segs.length; j++) {
          const dd = it.dir.distanceToSquared(ff.segs[j].q);
          if (dd < bd) { bd = dd; best = j; }
        }
      }
      it.segIdx = best;
      const seg = ff.segs[best];
      const w = Math.exp(-bd / (2 * sig * sig));
      // 2) 更新速度：切向平流 + 轻微横向游动
      tmpT.copy(seg.t).addScaledVector(it.dir, -seg.t.dot(it.dir)).normalize();
      tmpP.crossVectors(it.dir, tmpT).normalize();
      const spd = CORE_SPEED_DEG * ff.speedK * DEG2RAD * it.speedF * (0.8 + 0.25 * Math.sin(it.age * 0.5 + it.seed));
      const drift = (0.04 + 0.07 * Math.sin(it.age * 0.6 + it.seed * 0.17)) * DEG2RAD;
      tmpV.copy(tmpT).multiplyScalar(spd * w).addScaledVector(tmpP, drift * w);
      // 3) 移动（贴合球面曲率）
      it.dir.addScaledVector(tmpV, d).normalize();

      it.age += d;
      const fi = Math.min(1, it.age / 1.1);
      const fo = Math.min(1, (it.life - it.age) / 2.4);
      const f = Math.max(0, Math.min(fi, fo));
      const alpha = it.opacity * (0.45 + 0.55 * w) * f;

      // 4) 尾迹记录
      it.step += 1;
      if (it.step >= TRAIL_STEP) {
        it.step = 0;
        it.trail.push(it.dir.clone().multiplyScalar(it.rad));
        if (it.trail.length > TRAIL_N) it.trail.shift();
      }

      // 5) 生命周期结束或离开流场 → 重生
      if (it.age > it.life || w < 0.03) {
        const np = spawnParticle(ff, Math.random, false);
        it.dir.copy(np.dir);
        it.rad = np.rad;
        it.speedF = np.speedF;
        it.life = np.life;
        it.age = np.age;
        it.opacity = np.opacity;
        it.seed = np.seed;
        it.step = 0;
        it.segIdx = np.segIdx;
        it.frameCheck = 150;
        it.trail = np.trail;
      }

      // 6) 写入顶点：段间 alpha 渐变、头亮尾淡
      const o = i * segV;
      const tint = 0.9 + 0.1 * Math.sin(it.seed * 1.7);
      const base = ff.warm ? WARM : COLD;
      for (let kk = 0; kk < TRAIL_N - 1; kk++) {
        const va = it.trail[kk];
        const vb = it.trail[kk + 1];
        const vx = (o + kk * 2) * 3;
        pos[vx] = va.x; pos[vx + 1] = va.y; pos[vx + 2] = va.z;
        pos[vx + 3] = vb.x; pos[vx + 4] = vb.y; pos[vx + 5] = vb.z;
        const wA = TRAIL_W[kk];
        const wB = TRAIL_W[kk + 1];
        const cfA = (0.45 + 0.55 * wA) * tint;
        const cfB = (0.45 + 0.55 * wB) * tint;
        const eA = wA * alpha; // 有效透明度：淡出端向海面色调靠拢
        const eB = wB * alpha;
        col[vx] = base[0] * cfA * eA + DEEP_TONE[0] * (1 - eA);
        col[vx + 1] = base[1] * cfA * eA + DEEP_TONE[1] * (1 - eA);
        col[vx + 2] = base[2] * cfA * eA + DEEP_TONE[2] * (1 - eA);
        col[vx + 3] = base[0] * cfB * eB + DEEP_TONE[0] * (1 - eB);
        col[vx + 4] = base[1] * cfB * eB + DEEP_TONE[1] * (1 - eB);
        col[vx + 5] = base[2] * cfB * eB + DEEP_TONE[2] * (1 - eB);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return <lineSegments geometry={geo} material={mat} frustumCulled={false} />;
}

function SunGlint() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (lightRef.current) {
      lightRef.current.position.set(
        Math.cos(t * 0.11) * 6,
        Math.sin(t * 0.05) * 3.4,
        Math.sin(t * 0.11) * 6,
      );
    }
  });
  return <directionalLight ref={lightRef} intensity={0.8} color="#dceefc" />;
}

/** 自然色地球：原始 NASA 贴图，陆地是陆地、海面是海面，Phong 高光模拟海面反光 */
function Earth() {
  const texture = useLoader(THREE.TextureLoader, asset('/textures/earth.jpg'));
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }, [texture]);
  const earthRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (earthRef.current) earthRef.current.rotation.y += delta * 0.04;
  });
  useEffect(() => {
    // 初始视角：让大西洋（湾流正对观众）作为开场构图
    if (earthRef.current) earthRef.current.rotation.y = 0.85;
  }, []);
  return (
    /* 地球贴图 + 粒子流放在同一自转组，保证粒子始终贴在地理位置上 */
    <group ref={earthRef}>
      <mesh>
        <sphereGeometry args={[R, 96, 96]} />
        <meshPhongMaterial
          map={texture}
          shininess={14}
          specular={new THREE.Color('#7fa3bd')}
          color={new THREE.Color('#f4f9fd')}
        />
      </mesh>
      <CurrentFlow />
    </group>
  );
}

function Atmosphere() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const timeRef = useRef(0);
  useFrame((_, delta) => {
    timeRef.current += delta;
    if (matRef.current) matRef.current.uniforms.uTime.value = timeRef.current;
  });
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const VS = 'varying vec3 vNormal;\nvoid main() {\n  vNormal = normalize(normalMatrix * normal);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}';
  const FS = 'varying vec3 vNormal;\nuniform float uTime;\nvoid main() {\n  float glow = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);\n  float flick = 0.9 + 0.1 * sin(uTime * 0.5);\n  gl_FragColor = vec4(0.45, 0.66, 0.86, glow * 0.2 * flick);\n}';
  return (
    <mesh scale={1.035}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VS}
        fragmentShader={FS}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export default function GlobeCanvas({ className = '', interactive = true }: { className?: string; interactive?: boolean }) {
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(circle at 50% 46%, rgba(34, 122, 196, 0.2), transparent 64%)',
      }} />
      <Canvas dpr={[1, 1.8]} camera={{ position: [0, 1.05, 3.45], fov: 42 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
        <ambientLight intensity={1.05} />
        <directionalLight position={[4, 3, 6]} intensity={1.15} />
        <SunGlint />
        <Stars radius={90} depth={50} count={500} factor={1.9} saturation={0} fade speed={0.25} />
        <Earth />
        <Atmosphere />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate={false}
          rotateSpeed={0.35}
          enabled={interactive}
        />
      </Canvas>
    </div>
  );
}
