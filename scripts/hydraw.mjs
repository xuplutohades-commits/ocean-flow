import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const all = [];
page.on('console', (m) => all.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => all.push(`[PAGEERROR] ${e}`));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
for (const line of all) {
  if (/hydrat|mismatch|server|client|attribute|expected|received|React/i.test(line)) console.log(line.slice(0, 1000));
}
await browser.close();
