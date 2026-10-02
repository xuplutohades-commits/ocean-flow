import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(7000);
const res = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { ctx: 'none' };
  const w = c.width, h = c.height;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let warm = 0, cold = 0, warmPure = 0, coldPure = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    if (r > 170 && r - b > 50 && r - g > 20 && g > 90 && b < 160) warm++;
    if (b > 165 && b - r > 55 && g > r + 15 && g < b) cold++;
    if (r > 230 && g > 150 && g < 195 && b > 90 && b < 140) warmPure++;
    if (b > 235 && b - r > 110 && g > 180 && g < 230) coldPure++;
  }
  return { warm, cold, warmPure, coldPure, w, h };
});
console.log(JSON.stringify(res));
console.log('pageerrors:', errs.length ? errs.join(' || ') : 'none');
await browser.close();
