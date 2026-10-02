import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${String(e).slice(0, 400)}`));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
const canvasState = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const rect = c.getBoundingClientRect();
  // 截取 canvas 区域为 dataURL（利用浏览器合成，不受 preserveDrawingBuffer 限制）
  const dc = document.createElement('canvas');
  dc.width = 300; dc.height = 300;
  const dctx = dc.getContext('2d');
  dctx.fillStyle = 'rgba(0,0,0,1)';
  dctx.fillRect(0, 0, 300, 300);
  const sx = Math.floor(rect.width / 2) - 120;
  const sy = Math.floor(rect.height / 2) - 120;
  try {
    dctx.drawImage(c, sx, sy, 240, 240, 0, 0, 300, 300);
  } catch (e) { return { drawErr: String(e), rect: { w: rect.width, h: rect.height } }; }
  const data = dctx.getImageData(0, 0, 300, 300).data;
  let lumSum = 0, bright = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i+1] + data[i+2]) / 3;
    lumSum += lum;
    if (lum > 60) bright++;
  }
  return { rectW: rect.width, rectH: rect.height, avgLum: +(lumSum / (300*300)).toFixed(1), brightPct: +(bright / 90000 * 100).toFixed(1) };
});
console.log('canvas state:', JSON.stringify(canvasState));
console.log('--- logs (first 20) ---');
console.log(logs.slice(0, 20).join('\n') || '(no logs)');
await browser.close();
