import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 1200)); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);
await page.screenshot({ path: '/tmp/home-final.png' });
const title = await page.evaluate(() => {
  const h1 = document.querySelector('h1');
  return h1 ? h1.innerText.trim().replace(/\s+/g, ' ') : 'none';
});
console.log('h1:', title);
console.log('errors:', errs.length ? errs.slice(0,6).join(' || ') : 'none');
await browser.close();
