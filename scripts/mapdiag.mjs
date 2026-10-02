import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
for (const route of ['/currents', '/cases/kuroshio']) {
  await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  const rect = await page.evaluate(() => {
    const c = document.querySelector('.map-shell canvas') || document.querySelector('canvas');
    const r = c ? c.getBoundingClientRect() : null;
    return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
  });
  await page.screenshot({ path: `/tmp/mapdiag-${route.replace('/', '_').replace(/[\/]/g, '')}.png` });
  const png = PNG.sync.read(fs.readFileSync(`/tmp/mapdiag-${route.replace('/', '_').replace(/[\/]/g, '')}.png`));
  if (rect) {
    let sum = 0, n = 0, bright = 0, warmPx = 0, coldPx = 0;
    for (let y = rect.y; y < Math.min(rect.y + rect.h, png.height); y += 3) {
      for (let x = rect.x; x < Math.min(rect.x + rect.w, png.width); x += 3) {
        const i = (y * png.width + x) * 4;
        const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        sum += lum; n++;
        if (lum > 70) bright++;
        if (r > 150 && r - b > 40 && r - g > 25) warmPx++;
        if (b > 150 && b - r > 45 && g > r + 10) coldPx++;
      }
    }
    console.log(`${route}: avgLum=${(sum / n).toFixed(1)} bright>70=${((bright / n) * 100).toFixed(1)}% warm=${warmPx} cold=${coldPx} rect=${JSON.stringify(rect)}`);
  }
  if (errs.length) { console.log('errors:', errs.join(' || ')); break; }
}
await browser.close();
