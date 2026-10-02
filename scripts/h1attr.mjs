import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let early = null;
page.on('console', async (m) => {
  if (m.text().includes('hydrated but some attributes')) {
    early = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? { html: h1.outerHTML.slice(0, 300), attrs: [...h1.attributes].map(a => [a.name, a.value]) } : null;
    });
  }
});
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
console.log(JSON.stringify(early, null, 1));
await browser.close();
