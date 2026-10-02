'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { CURRENTS, pathOf } from '@/data/currents';
import { samplePath, pointAt } from '@/lib/geo';
import type { SampledPath } from '@/lib/geo';

const R = 1.0;
/** 粒子层略高于球面，避免与贴图 z-fighting，同时被球面正确遮挡 */
const FLOW_R = 1.009;

function lngLatToVec(lng: number, lat: number, r = FLOW_R, out?: THREE.Vector3): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  const v = out ?? new THREE.Vector3();
  return v.set(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

interface FlowItem {
  sp: SampledPath;
  s: number;        // 沿路径的当前位置（度）
  speed: number;    // 角速度 °/s
  len: number;      // 线段弧长（度）
  band: number;     // 该洋流流带半宽（度）
  edge: number;     // 横向位置 u ~ N(0,1)：决定密度/速度/颜色梯度
  phase: number;    // 横向微摆相位
  warm: boolean;
  age: number;
  life: number;
  px: number; py: number; pz: number; // 上一帧头部位置（短拖尾）
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

/** 溶于深海背景色的“淡出尾色”基准 */
const DEEP_OCEAN: [number, number, number] = [0.04, 0.14, 0.24];
const WARM: [number, number, number] = [1.0, 0.46, 0.2];
const COLD: [number, number, number] = [0.28, 0.66, 1.0];

const DEG2RAD = Math.PI / 180;

/**
 * 球面流场粒子（带状流体模型）：
 * 每条洋流不是一条线，而是一个“流带”——粒子按高斯分布铺在中心线两侧，
 * 核心带粒子更密、更快、更亮，边缘更稀、更慢、更淡；粒子带短拖尾沿球面流动。
 * 与平面地图同一套 CURRENTS 数据，全部粒子合并为一次 draw call 的 LineSegments。
 */
function CurrentFlow() {
  const items = useMemo<FlowItem[]>(() => {
    const rnd = mulberry32(20261002);
    const list: FlowItem[] = [];
    for (const c of CURRENTS) {
      const sp = samplePath(pathOf(c, 'summer'), 0.6);
      const total = sp.total;
      if (total < 4) continue;
      const span = c.width ?? 1;
      const strength = 0.55 + span * 0.55;
      // 流带半宽随洋流强弱变化（度）；核心带密度 ∝ 长度 × 宽度
      const band = 1.5 + span * 2.1;
      const n = Math.min(900, Math.max(12, Math.round((total / 1.15) * (0.8 + span * 0.6))));
      for (let i = 0; i < n; i++) {
        const life = 6 + rnd() * 10;
        list.push({
          sp,
          s: rnd() * total,
          speed: (2.4 + 2.4 * strength) * (0.75 + rnd() * 0.5),
          len: 2.4 + rnd() * 4.6,
          band,
          edge: Math.max(-2, Math.min(2, (rnd() + rnd() + rnd() - 1.5) / 0.5)),
          phase: rnd() * Math.PI * 2,
          warm: c.type === 'warm',
          age: rnd() * life,
          life,
          px: 0, py: 0, pz: 0,
        });
      }
      if (list.length >= 5400) break;
    }
    return list.slice(0, 5400);
  }, []);

  // 每个粒子 4 个顶点：头部/尾部（流线短段）+ 上一帧位置（淡出拖尾）
  const posAttr = useMemo(() => {
    const a = new THREE.BufferAttribute(new Float32Array(items.length * 12), 3);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  }, [items]);
  const colAttr = useMemo(
    () => new THREE.BufferAttribute(new Float32Array(items.length * 12), 3),
    [items],
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
        blending: THREE.NormalBlending,
      }),
    [],
  );

  const tmpN = useMemo(() => new THREE.Vector3(), []);
  const tmpT = useMemo(() => new THREE.Vector3(), []);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const pos = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const total = it.sp.total;
      it.age += d;
      if (it.age > it.life) {
        it.age = 0;
        it.s = Math.random() * total;
      }
      const escape = Math.min(1, Math.abs(it.edge) / 2);
      // 边缘粒子更慢（速度梯度）
      it.s += it.speed * (1 - 0.35 * escape * escape) * d;
      if (it.s >= total) it.s -= total;

      // 中心流线上的两个点 → 球面切向
      const [a1, b1] = pointAt(it.sp, it.s);
      const sn = it.s + 1.4 >= total ? it.s + 1.4 - total : it.s + 1.4;
      const [a2, b2] = pointAt(it.sp, sn);
      lngLatToVec(a1, b1, 1, tmpN);
      lngLatToVec(a2, b2, 1, tmpT);
      tmpT.sub(tmpN);
      // 切向投影到球面切平面
      const ndot = tmpT.dot(tmpN);
      tmpT.x -= tmpN.x * ndot;
      tmpT.y -= tmpN.y * ndot;
      tmpT.z -= tmpN.z * ndot;
      tmpT.normalize();
      // 球面法线方向上的横向基（在球面上垂直流向）
      tmpP.crossVectors(tmpN, tmpT).normalize();

      // 高斯横向偏移 + 沿路径的微摆 → 形成有宽度的流带
      const lateral = (it.edge * it.band + Math.sin(it.s * 0.21 + it.phase) * 0.8) * DEG2RAD;
      tmpN.addScaledVector(tmpP, lateral).normalize();

      // 流线短段（贴合球面曲率）
      const halfLen = (it.len * 0.5) * DEG2RAD;
      tmpA.copy(tmpN).addScaledVector(tmpT, halfLen).multiplyScalar(FLOW_R);
      tmpB.copy(tmpN).addScaledVector(tmpT, -halfLen).multiplyScalar(FLOW_R);

      const o = i * 12;
      pos[o] = tmpA.x; pos[o + 1] = tmpA.y; pos[o + 2] = tmpA.z;       // 头部（亮）
      pos[o + 3] = tmpB.x; pos[o + 4] = tmpB.y; pos[o + 5] = tmpB.z;   // 尾部（淡）
      pos[o + 6] = it.px; pos[o + 7] = it.py; pos[o + 8] = it.pz;      // 上一帧位置（拖尾）
      pos[o + 9] = tmpA.x; pos[o + 10] = tmpA.y; pos[o + 11] = tmpA.z; // 拖尾终点（头部）
      it.px = tmpA.x; it.py = tmpA.y; it.pz = tmpA.z;

      // 生命周期淡入淡出 + 边缘渐变（核心亮、边缘暗）+ 头亮尾淡
      const fi = Math.min(1, it.age / 0.9);
      const fo = Math.min(1, (it.life - it.age) / 2.2);
      const f = Math.max(0, Math.min(fi, fo));
      const edgeFade = 1 - 0.42 * escape * escape;
      const base = it.warm ? WARM : COLD;
      const hx = Math.min(1, base[0] * (0.68 + 0.32 * f) * edgeFade);
      const hy = Math.min(1, base[1] * (0.68 + 0.32 * f) * edgeFade);
      const hz = Math.min(1, base[2] * (0.68 + 0.32 * f) * edgeFade);
      col[o] = hx; col[o + 1] = hy; col[o + 2] = hz;
      col[o + 3] = hx + (DEEP_OCEAN[0] - hx) * 0.62;
      col[o + 4] = hy + (DEEP_OCEAN[1] - hy) * 0.62;
      col[o + 5] = hz + (DEEP_OCEAN[2] - hz) * 0.62;
      col[o + 6] = hx + (DEEP_OCEAN[0] - hx) * 0.78;
      col[o + 7] = hy + (DEEP_OCEAN[1] - hy) * 0.78;
      col[o + 8] = hz + (DEEP_OCEAN[2] - hz) * 0.78;
      col[o + 9] = hx + (DEEP_OCEAN[0] - hx) * 0.55;
      col[o + 10] = hy + (DEEP_OCEAN[1] - hy) * 0.55;
      col[o + 11] = hz + (DEEP_OCEAN[2] - hz) * 0.55;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return <lineSegments geometry={geo} material={mat} frustumCulled={false} />;
}

/** 水面反光：一束缓慢环绕的“阳光”，像日光在高光洋面上滑动 */
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
  const texture = useLoader(THREE.TextureLoader, '/textures/earth.jpg');
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
