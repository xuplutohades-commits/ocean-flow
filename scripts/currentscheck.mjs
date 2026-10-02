import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
await page.goto('http://localhost:3000/currents', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const res = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const d = ctx.getImageData(0, 0, w, h).data;
  let warm = 0, cold = 0;
  for (let i = 0; i < d.length; i += 8) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 140 && r - b > 30 && r - g > 15) warm++;
    if (b > 140 && b - r > 40 && g > r) cold++;
  }
  return { warm, cold };
});
console.log('currents map px (2d canvas direct):', JSON.stringify(res));
console.log('errors:', errs.length ? errs.join(' || ') : 'none');
await browser.close();
