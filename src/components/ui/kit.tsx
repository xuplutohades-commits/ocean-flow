'use client';
import { useEffect, useRef, useState } from 'react';

/** 通用 UI 小组件 */

export function Panel({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`glass panel-edge ${className}`} style={style}>{children}</div>;
}

export function SectionTitle({ en, zh, desc }: { en: string; zh: string; desc?: string }) {
  return (
    <div className="mb-6">
      <div className="kicker">{en}</div>
      <h1 className="title-disp text-[26px] md:text-[32px] mt-2 grad-text">{zh}</h1>
      {desc && <p className="mt-3 text-[13.5px] leading-relaxed text-[#8ba7c6] max-w-3xl">{desc}</p>}
    </div>
  );
}

export function Slider({
  label, value, min, max, step = 1, onChange, unit = '', hint,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; unit?: string; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12.5px] text-[#a9c3de]">{label}</span>
        <span className="num text-[12.5px] font-semibold text-[#6fe3e0]">{value}{unit}</span>
      </div>
      <input type="range" className="slider" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="mt-1 text-[11px] text-[#5f7b99]">{hint}</div>}
    </div>
  );
}

export function Toggle({ label, desc, on, onChange, accent }: {
  label: string; desc?: string; on: boolean; onChange: (v: boolean) => void; accent?: 'teal' | 'gold' | 'blue';
}) {
  const [clicked, setClicked] = useState(false);
  useEffect(() => {
    if (!clicked) return;
    const t = setTimeout(() => setClicked(false), 900);
    return () => clearTimeout(t);
  }, [clicked]);
  return (
    <button
      className={`chip w-full justify-between ${on ? 'chip-on' : ''} ${clicked ? 'animate-glow' : ''}`}
      onClick={() => { onChange(!on); setClicked(true); }}
      style={accent === 'gold' && on ? { borderColor: 'rgba(242,198,109,.6)', background: 'rgba(242,198,109,.12)', color: '#ffe9c2' } : undefined}
      role="switch" aria-checked={on}
    >
      <span>
        <span className="block text-[13px]">{label}</span>
        {desc && <span className="block text-[11px] text-[#5f7b99] mt-0.5">{desc}</span>}
      </span>
      <span className={`toggle ${on ? 'toggle-on' : ''}`} />
    </button>
  );
}

export function Seg<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border border-[rgba(126,190,255,0.14)] bg-[rgba(8,22,40,0.55)] px-3.5 py-2.5">
      <div className="text-[10.5px] tracking-wide text-[#5f7b99]">{label}</div>
      <div className="text-[14px] font-semibold text-[#dff4ff] mt-0.5 num">{value}</div>
      {sub && <div className="text-[10.5px] text-[#6b87a5] mt-0.5">{sub}</div>}
    </div>
  );
}

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

export function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className}
      style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(18px)', transition: `opacity .7s ease ${delay}s, transform .7s ease ${delay}s` }}>
      {children}
    </div>
  );
}

export function DotLegend({ warm = '暖流', cold = '寒流' }: { warm?: string; cold?: string }) {
  return (
    <div className="flex items-center gap-4 text-[12px] text-[#8ba7c6]">
      <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#ff9d5c', boxShadow: '0 0 8px rgba(255,157,92,.7)' }} />{warm}</span>
      <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#5ec8ff', boxShadow: '0 0 8px rgba(94,200,255,.7)' }} />{cold}</span>
    </div>
  );
}
