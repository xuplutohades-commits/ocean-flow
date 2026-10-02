'use client';
import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { CURRENTS, pathOf } from '@/data/currents';

const R = 1.005;

function lngLatToVec(lng: number, lat: number, r = R): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

/** 洋流粒子光带：沿主要洋流路径分布的发光点 */
function CurrentParticles() {
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const timeRef = useRef(0);

  const { positions, colors, seeds } = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const seed: number[] = [];
    const majors = [
      'kuroshio', 'gulfStream', 'northAtlanticCurrent', 'peruCurrent', 'benguelaCurrent',
      'westWindS', 'monsoonSummer', 'californiaCurrent', 'northPacCurrent', 'oyashio',
      'pacNorthEq', 'atlNorthEq', 'brazilCurrent', 'eastAustralia', 'agulhas',
      'canaryCurrent', 'labradorCurrent', 'antarcticCirc',
    ];
    for (const id of majors) {
      const c = CURRENTS.find((x) => x.id === id);
      if (!c) continue;
      const p = pathOf(c, 'summer');
      const colv = c.type === 'warm' ? [1.0, 0.62, 0.36] : [0.37, 0.78, 1.0];
      for (let i = 0; i < p.length; i += 1) {
        const v = lngLatToVec(p[i][0], p[i][1]);
        pos.push(v.x, v.y, v.z);
        col.push(colv[0], colv[1], colv[2]);
        seed.push(Math.random() * 6.28);
      }
    }
    return { positions: new Float32Array(pos), colors: new Float32Array(col), seeds: new Float32Array(seed) };
  }, []);

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uSize: { value: 3.2 * Math.min(window.innerWidth, 1400) / 1400 } }),
    [],
  );

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (matRef.current) matRef.current.uniforms.uTime.value = timeRef.current;
  });

  const vertex = /* glsl */ `
    attribute float aSeed;
    attribute vec3 aColor;
    varying vec3 vColor;
    uniform float uTime;
    uniform float uSize;
    void main() {
      vColor = aColor;
      vec3 p = position + normal * (0.012 + 0.008 * sin(uTime * 1.6 + aSeed));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uSize * (2.0 + sin(uTime * 2.0 + aSeed)) * (280.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fragment = /* glsl */ `
    varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      float a = smoothstep(0.5, 0.05, d) * 0.9;
      gl_FragColor = vec4(vColor, a);
    }
  `;

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Earth() {
  const texture = useLoader(THREE.TextureLoader, '/textures/earth.jpg');
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }, [texture]);
  return (
    <group>
      <mesh rotation={[0, 0, 0]}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial map={texture} roughness={0.85} metalness={0.08} color="#cfe4ff" />
      </mesh>
      <CurrentParticles />
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
            float glow = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
            float flick = 0.85 + 0.15 * sin(uTime * 0.7);
            gl_FragColor = vec4(0.45, 0.78, 1.0, glow * 0.6 * flick);
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
          'radial-gradient(circle at 50% 46%, rgba(84, 168, 222, 0.24), rgba(10, 46, 84, 0.16) 42%, transparent 60%),' +
          'radial-gradient(circle at 50% 46%, rgba(3, 16, 32, 0.9) 0%, transparent 66%)',
      }} />
      <Canvas dpr={[1, 1.8]} camera={{ position: [0, 1.05, 3.45], fov: 42 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }} style={{ background: 'transparent' }}>
        <ambientLight intensity={interactive ? 1.15 : 1.0} />
        <directionalLight position={[4, 3, 6]} intensity={1.6} />
        <Stars radius={90} depth={50} count={2600} factor={3.2} saturation={0} fade speed={0.5} />
        <Earth />
        <Atmosphere />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={0.55}
          rotateSpeed={0.4}
          enabled={interactive}
        />
      </Canvas>
    </div>
  );
}
