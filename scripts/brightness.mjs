import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
const rect = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
});
await page.screenshot({ path: '/tmp/home.png' });
const png = PNG.sync.read(fs.readFileSync('/tmp/home.png'));
const { x, y, w, h } = rect;
let sum = 0, n = 0, bright = 0, p95 = 0;
const vals = [];
for (let yy = y; yy < Math.min(y + h, png.height); yy++) {
  for (let xx = x; xx < Math.min(x + w, png.width); xx++) {
    const idx = (yy * png.width + xx) * 4;
    const lum = 0.299 * png.data[idx] + 0.587 * png.data[idx + 1] + 0.114 * png.data[idx + 2];
    sum += lum; n++;
    if (lum > 90) bright++;
    vals.push(lum);
  }
}
vals.sort((a, b) => a - b);
p95 = vals[Math.floor(vals.length * 0.95)];
console.log(JSON.stringify({ globeRect: rect, avgLum: +(sum / n).toFixed(1), brightPct: +((bright / n) * 100).toFixed(1), p95: +p95.toFixed(0) }));
await browser.close();
