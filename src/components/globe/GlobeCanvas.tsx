'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { CURRENTS, pathOf } from '@/data/currents';
import { samplePath, pointAt } from '@/lib/geo';
import type { SampledPath } from '@/lib/geo';

const R = 1.005;

function lngLatToVec(lng: number, lat: number, r = R, out?: THREE.Vector3): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  const v = out ?? new THREE.Vector3();
  return v.set(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

/** 世界洋流箭头：在球面上画出全部教材洋流的路径线，箭头沿路径缓慢移动表示流向
 *  暖流 = 橙色，寒流 = 蓝色 —— 教科书式的“地球上画满洋流箭头”效果 */
function CurrentArrows() {
  const groupRef = useRef<THREE.Group>(null);
  const arrowsRef = useRef<{ sp: SampledPath; p: number; speed: number; color: [number, number, number] }[]>([]);
  const posAttrRef = useRef<THREE.BufferAttribute | null>(null);

  const tmpV1 = useMemo(() => new THREE.Vector3(), []);
  const tmpV2 = useMemo(() => new THREE.Vector3(), []);
  const tmpV3 = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const UP = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const ONE = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  // 锥体基形（非索引，逐顶点坐标）
  const coneBase = useMemo(() => {
    const g = new THREE.ConeGeometry(0.017, 0.062, 5).toNonIndexed();
    const p = g.getAttribute('position')?.array as Float32Array | undefined;
    return { pos: p ? new Float32Array(p) : new Float32Array(0), count: p ? g.getAttribute('position')!.count : 0 };
  }, []);

  // 箭头定义：每条洋流按长度分布 4～9 枚，沿路径前进；暖=橙 寒=蓝（逐顶点色）
  const arrows = useMemo(() => {
    const items: { sp: SampledPath; p: number; speed: number; color: [number, number, number] }[] = [];
    for (const c of CURRENTS) {
      const sp = samplePath(pathOf(c, 'summer'), 0.6);
      const n = Math.max(4, Math.min(9, Math.round(sp.total / 16)));
      const color: [number, number, number] = c.type === 'warm' ? [1, 0.67, 0.435] : [0.5, 0.82, 1];
      for (let i = 0; i < n; i++) {
        items.push({ sp, p: (i / n + Math.random() * 0.08) % 1, speed: 1 / (90 + Math.random() * 40), color });
      }
    }
    return items;
  }, []);

  // 全部箭头合并为一个几何体（单次 draw call），冷暖色写入顶点颜色
  const arrowMesh = useMemo(() => {
    const { count, pos: basePos } = coneBase;
    if (count === 0) return null;
    const n = arrows.length;
    const positions = new Float32Array(n * count * 3);
    const colors = new Float32Array(n * count * 3);
    for (let i = 0; i < n; i++) {
      const c = arrows[i].color;
      const o = i * count * 3;
      for (let v = 0; v < count; v++) {
        const idx = o + v * 3;
        colors[idx] = c[0];
        colors[idx + 1] = c[1];
        colors[idx + 2] = c[2];
      }
    }
    // 初始位置：把每支箭头的起点姿态也写入（第 0 帧即可见）
    for (let i = 0; i < n; i++) {
      const it = arrows[i];
      const sAt = it.p * it.sp.total;
      const [lng, lat] = pointAt(it.sp, sAt);
      const [lng2, lat2] = pointAt(it.sp, Math.min(it.sp.total, sAt + 0.9));
      const pos = lngLatToVec(lng, lat, 1.016, tmpV1);
      const ahead = lngLatToVec(lng2, lat2, 1.016, tmpV2);
      const tangent = ahead.sub(pos).normalize();
      tmpQ.setFromUnitVectors(UP, tangent);
      tmpM.compose(pos, tmpQ, ONE);
      const o = i * count * 3;
      for (let v = 0; v < count; v++) {
        tmpV3.set(basePos[v * 3], basePos[v * 3 + 1], basePos[v * 3 + 2]).applyMatrix4(tmpM);
        const idx = o + v * 3;
        positions[idx] = tmpV3.x;
        positions[idx + 1] = tmpV3.y;
        positions[idx + 2] = tmpV3.z;
      }
    }
    const geo = new THREE.BufferGeometry();
    posAttrRef.current = new THREE.BufferAttribute(positions, 3);
    posAttrRef.current.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttrRef.current);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [arrows, coneBase, tmpV1, tmpV2, tmpV3, tmpQ, tmpM, ONE, UP]);

  arrowsRef.current = arrows;

  // 每帧：沿洋流路径推进箭头并写回顶点位置
  useFrame((_, delta) => {
    const items = arrowsRef.current;
    const attr = posAttrRef.current;
    const { count, pos: basePos } = coneBase;
    if (!attr || count === 0 || basePos.length === 0 || items.length === 0) return;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.p += it.speed * delta;
      if (it.p > 1) it.p -= 1;
      const s = it.p * it.sp.total;
      const [lng, lat] = pointAt(it.sp, s);
      const [lng2, lat2] = pointAt(it.sp, Math.min(it.sp.total, s + 0.9));
      const pos = lngLatToVec(lng, lat, 1.016, tmpV1);
      const ahead = lngLatToVec(lng2, lat2, 1.016, tmpV2);
      const tangent = ahead.sub(pos).normalize();
      tmpQ.setFromUnitVectors(UP, tangent);
      tmpM.compose(pos, tmpQ, ONE);
      const o = i * count * 3;
      for (let v = 0; v < count; v++) {
        tmpV3.set(basePos[v * 3], basePos[v * 3 + 1], basePos[v * 3 + 2]).applyMatrix4(tmpM);
        const idx = o + v * 3;
        arr[idx] = tmpV3.x;
        arr[idx + 1] = tmpV3.y;
        arr[idx + 2] = tmpV3.z;
      }
    }
    attr.needsUpdate = true;
  });

  const arrowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    [],
  );

  const warmLineMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0xffab6f, transparent: true, opacity: 0.72 }),
    [],
  );
  const coldLineMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.62 }),
    [],
  );

  const lineObjects = useMemo(() => {
    const objs: THREE.Object3D[] = [];
    for (const c of CURRENTS) {
      const sp = samplePath(pathOf(c, 'summer'), 0.8);
      const pts = sp.pts.flatMap(([lng, lat]) => {
        const v = lngLatToVec(lng, lat, 1.006);
        return [v.x, v.y, v.z];
      });
      if (pts.length < 9) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      objs.push(new THREE.Line(g, c.type === 'warm' ? warmLineMat : coldLineMat));
    }
    return objs;
  }, [warmLineMat, coldLineMat]);

  return (
    <group ref={groupRef}>
      <ObjectMount objects={lineObjects} />
      {arrowMesh && <mesh geometry={arrowMesh} material={arrowMat} frustumCulled={false} />}
    </group>
  );
}

function ObjectMount({ objects }: { objects: THREE.Object3D[] }) {
  const gRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    g.clear();
    for (const o of objects) g.add(o);
    return () => { g.clear(); };
  }, [objects]);
  return <group ref={gRef} />;
}

function ArrowMount({ items }: { items: { mesh: THREE.Mesh; sp: SampledPath; p: number; speed: number }[] }) {
  const gRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    g.clear();
    for (const it of items) g.add(it.mesh);
    return () => { g.clear(); };
  }, [items]);
  return <group ref={gRef} />;
}

function useDimTexture(): THREE.Texture | null {
  const raw = useLoader(THREE.TextureLoader, '/textures/earth.jpg');
  return useMemo(() => {
    if (!raw.image || (raw.image as HTMLImageElement).width < 10) return raw;
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return raw;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(raw.image, 0, 0, c.width, c.height);
    // 轻度压暗 + 降饱和：保留大陆轮廓与蓝色海洋，整体沉入深海色调
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(12, 24, 37, 0.79)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'luminosity';
    ctx.globalAlpha = 0.38;
    ctx.drawImage(c, 0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [raw]);
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
  return <directionalLight ref={lightRef} intensity={0.85} color="#dceefc" />;
}


function Earth() {
  const texture = useDimTexture();
  const earthRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (earthRef.current) earthRef.current.rotation.y += delta * 0.05;
  });
  useEffect(() => {
    // 初始视角：让大西洋（湾流正对观众）作为开场构图
    if (earthRef.current) earthRef.current.rotation.y = 0.9;
  }, []);
  return (
    /* 地球贴图 + 洋流线条/箭头放在同一自转组，保证箭头始终贴在地理位置上 */
    <group ref={earthRef}>
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        {/* Phong 高光 = 海面波光；颜色覆盖轻微提亮，保证大陆清晰 */}
        <meshPhongMaterial
          map={texture}
          shininess={18}
          specular={new THREE.Color('#6f92ab')}
          color={new THREE.Color('#b7c9d6')}
        />
      </mesh>
      <CurrentArrows />
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
  return (
    <mesh scale={1.035}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          varying vec3 vNormal;
          uniform float uTime;
          void main() {
            float glow = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);
            float flick = 0.9 + 0.1 * sin(uTime * 0.5);
            gl_FragColor = vec4(0.42, 0.62, 0.82, glow * 0.22 * flick);
          }
        `}
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
        position: 'absolute', inset: 0,
        background:
          'radial-gradient(circle at 50% 46%, rgba(46, 96, 138, 0.14), rgba(8, 32, 56, 0.10) 44%, transparent 62%),' +
          'radial-gradient(circle at 50% 46%, rgba(2, 10, 20, 0.85) 0%, transparent 68%)',
      }} />
      <Canvas dpr={[1, 1.8]} camera={{ position: [0, 1.05, 3.45], fov: 42 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }} style={{ background: 'transparent' }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 3, 6]} intensity={0.82} />
        <SunGlint />
        <Stars radius={90} depth={50} count={700} factor={2.2} saturation={0} fade speed={0.3} />
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
