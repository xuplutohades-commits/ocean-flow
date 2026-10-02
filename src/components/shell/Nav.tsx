'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/store/app';
import type { Mode } from '@/types';

const NAV = [
  { href: '/currents', label: '全球洋流', en: 'CURRENTS' },
  { href: '/formation', label: '洋流如何形成', en: 'FORMATION' },
  { href: '/atmosphere', label: '洋流 × 大气', en: 'ATMOSPHERE' },
  { href: '/impacts', label: '洋流带来什么', en: 'IMPACTS' },
  { href: '/cases', label: '洋流档案馆', en: 'ARCHIVE' },
  { href: '/lab', label: '地理实验室', en: 'LAB' },
];

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'explore', label: '探索', hint: '自由浏览' },
  { id: 'teach', label: '教学', hint: '按教材逻辑分步讲解' },
  { id: 'lab', label: '实验', hint: '修改参数观察结果' },
];

export default function Nav() {
  const pathname = usePathname();
  const { mode, setMode } = useApp();
  const [open, setOpen] = useState(false);

  const modeDesc = MODES.find((m) => m.id === mode);

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="glass-strong" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
        <div className="mx-auto max-w-[1500px] px-4 lg:px-8 h-[60px] flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 group flex-none" onClick={() => setOpen(false)}>
            <span className="relative w-8 h-8 rounded-[10px] flex items-center justify-center overflow-hidden"
              style={{ background: 'linear-gradient(140deg, #0b2c4e, #06203c)', border: '1px solid rgba(111,227,224,.35)' }}>
              <span className="absolute inset-x-1 top-1/2 h-[2px] rounded bg-[#5ec8ff] opacity-80" style={{ transform: 'rotate(-8deg)', boxShadow: '0 4px 0 rgba(94,200,255,.25), 0 -4px 0 rgba(94,200,255,.25)' }} />
              <span className="text-[13px] mt-[3px] tracking-tight">洋</span>
            </span>
            <span className="leading-none">
              <span className="block text-[15px] font-bold tracking-wide">OCEAN FLOW</span>
              <span className="block text-[10px] tracking-[0.32em] text-[#7fa3c4] mt-[3px]">洋流互动实验室</span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1 ml-6 flex-1">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className={`px-3 py-2 rounded-[10px] text-[13.5px] font-medium transition-colors relative ${
                    active ? 'text-[#dffcfb]' : 'text-[#8ba7c6] hover:text-[#e6f2ff]'
                  }`}
                  style={active ? { background: 'rgba(111,227,224,0.1)' } : undefined}>
                  {n.label}
                  {active && <span className="absolute left-3 right-3 -bottom-[1px] h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, #6fe3e0, transparent)' }} />}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1 lg:flex-none flex items-center justify-end gap-3">
            <div className="hidden md:flex items-center gap-2">
              <span className="kicker-dim !text-[9px]">模式</span>
              <div className="seg" role="tablist" aria-label="使用模式">
                {MODES.map((m) => (
                  <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}
                    title={m.hint} role="tab" aria-selected={mode === m.id}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <button className="lg:hidden w-9 h-9 rounded-[10px] flex items-center justify-center border border-[rgba(126,190,255,0.2)] bg-[rgba(10,26,46,.6)]"
              onClick={() => setOpen(!open)} aria-label="菜单">
              <span className="text-[16px] leading-none">{open ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {modeDesc && (
          <div className="hidden md:flex items-center gap-2 px-4 lg:px-8 py-1.5 border-t border-[rgba(126,190,255,0.08)]"
            style={{ background: 'rgba(3, 10, 22, 0.5)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: mode === 'explore' ? '#5ec8ff' : mode === 'teach' ? '#f2c66d' : '#6fe3e0' }} />
            <span className="text-[11.5px] text-[#8ba7c6]">
              当前模式：<b className="text-[#dfeaff]">{modeDesc.label}</b>
              <span className="ml-2 text-[#5f7b99]">{modeDesc.hint} —— 切换模式不影响页面内容，只改变讲解节奏与可调参数</span>
            </span>
          </div>
        )}

        {open && (
          <div className="lg:hidden glass-strong px-4 py-3 space-y-1" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={`block px-3 py-2.5 rounded-[10px] text-[14px] ${pathname.startsWith(n.href) ? 'text-[#dffcfb] bg-[rgba(111,227,224,0.1)]' : 'text-[#8ba7c6]'}`}
                onClick={() => setOpen(false)}>
                {n.label} <span className="float-right text-[10px] tracking-[0.2em] text-[#5f7b99]">{n.en}</span>
              </Link>
            ))}
            <div className="px-3 pt-3 flex items-center gap-2">
              <span className="text-[10px] tracking-[0.25em] text-[#5f7b99]">模式</span>
              <div className="seg">
                {MODES.map((m) => (
                  <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
