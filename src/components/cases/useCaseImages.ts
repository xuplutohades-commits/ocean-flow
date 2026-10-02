'use client';
import { useEffect, useState } from 'react';
import type { CaseImage } from '@/types';

let cache: Record<string, CaseImage> | null = null;
let pending: Promise<Record<string, CaseImage> | null> | null = null;

export function useCaseImages(): Record<string, CaseImage> | null {
  const [imgs, setImgs] = useState<Record<string, CaseImage> | null>(cache);
  useEffect(() => {
    if (cache) { setImgs(cache); return; }
    if (!pending) {
      pending = fetch('/data/case-images.json')
        .then((r) => r.json())
        .then((j) => {
          // 统一 https
          const out: Record<string, CaseImage> = {};
          for (const [k, v] of Object.entries(j)) {
            out[k] = { ...(v as CaseImage), url: (v as CaseImage).url.replace(/^http:/, 'https:') };
          }
          cache = out;
          return out;
        })
        .catch(() => null);
    }
    pending?.then((j) => { if (j) setImgs(j); });
  }, []);
  return imgs;
}
