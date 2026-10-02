import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const route of ['/currents', '/cases', '/cases/kuroshio']) {
  await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const shells = [...document.querySelectorAll('.map-shell')];
    return shells.slice(0, 8).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const cv = el.querySelector('canvas');
      return { h: Math.round(r.height), cssH: cs.height, canvasH: cv ? Math.round(cv.getBoundingClientRect().height) : -1 };
    });
  });
  console.log(route, JSON.stringify(info));
}
await browser.close();
