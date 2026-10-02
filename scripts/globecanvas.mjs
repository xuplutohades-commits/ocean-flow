import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const w = c.width, h = c.height;
  let used = 0, total = 0;
  if (gl) {
    // 用 readPixels 采样画布中心区域
    try {
      const half = 48;
      const buf = new Uint8Array(half * half * 4);
      gl.readPixels(Math.floor(w/2) - 24, Math.floor(h/2) - 24, 48, 48, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      for (let i = 0; i < buf.length; i += 4) {
        total++;
        const lum = (buf[i] + buf[i+1] + buf[i+2]) / 3;
        if (lum > 30) used++;
      }
    } catch (e) { return { err: String(e) }; }
    return { w, h, gl: true, centerUsed: used, centerTotal: total, centerRatio: +(used / total).toFixed(2) };
  }
  return { w, h, gl: false };
});
console.log('globe canvas info:', JSON.stringify(info));
// 面板溢出详情
const ov = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.glass')) {
    const d = el.scrollWidth - el.clientWidth;
    if (d > 30) out.push({ cls: String(el.className).slice(0, 40), d });
  }
  return out;
});
console.log('big panel overflows:', JSON.stringify(ov));
await browser.close();
