import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await page.goto('http://localhost:3000/cases/kuroshio', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const imgs = await page.evaluate(() =>
  [...document.querySelectorAll('img[src*="/images/"]')].map((i) => ({ ok: i.complete && i.naturalWidth > 40, src: i.getAttribute('src') }))
);
console.log('local images:', JSON.stringify(imgs));
console.log('errors:', errs.length ? errs.join(' || ') : 'none');
await browser.close();
