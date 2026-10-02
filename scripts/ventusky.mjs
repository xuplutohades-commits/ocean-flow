import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const consoleMsgs = [];
page.on('console', (m) => { const t = m.text(); if (/error|failed/i.test(t) && t.length < 300) consoleMsgs.push(t.slice(0, 200)); });
await page.goto('https://www.ventusky.com/?p=4;88;1&l=temperature-2m', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(12000);
const info = await page.evaluate(() => {
  const scripts = [...document.querySelectorAll('script[src]')].map((s) => {
    const u = s.src;
    const m = u.match(/\.([a-z0-9]+)\.js$/);
    return { name: m ? m[0] : u.split('/').pop().slice(0, 60), len: u.length > 120 ? '(long)' : u };
  });
  return {
    title: document.title,
    canvases: [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height })),
    scripts: scripts.slice(0, 25),
    globals: {
      ol: typeof window.ol,
      L: typeof window.L,
      mapboxgl: typeof window.mapboxgl,
      THREE: typeof window.THREE,
      d3: typeof window.d3,
    },
    bodyText: document.body.innerText.slice(0, 200).replace(/\n/g, ' | '),
  };
});
console.log(JSON.stringify(info, null, 1).slice(0, 3500));
await page.screenshot({ path: '/tmp/ventusky.png' });
await browser.close();
