// 模拟浏览器扩展在 React 水合前向 <body> 注入 data-atm-ext-installed，验证 suppressHydrationWarning
import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// 在页面任何脚本执行前注入：body 一出现就立刻塞扩展属性
await page.addInitScript(() => {
  const t = setInterval(() => {
    if (document.body && !document.body.hasAttribute('data-atm-ext-installed')) {
      document.body.setAttribute('data-atm-ext-installed', '1.30.02');
    }
  }, 0);
});
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const bodyAttr = await page.evaluate(() => document.body.getAttribute('data-atm-ext-installed'));
console.log('extension attr present on body:', bodyAttr);
console.log('hydration errors:', errs.filter((e) => /hydrat|mismatch/i.test(e)).length);
await browser.close();
