import { chromium } from 'playwright-core';

const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = 'http://localhost:3000';
const VIEWS = ['desktop', 'tablet'];
const ROUTES = ['/', '/currents', '/formation', '/atmosphere', '/impacts', '/cases', '/cases/kuroshio', '/cases/peru', '/cases/monsoon', '/lab'];

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});

let failures = 0;
for (const view of VIEWS) {
  const vp = view === 'desktop' ? { width: 1440, height: 900 } : { width: 834, height: 1112 };
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));

  for (const route of ROUTES) {
    errors.length = 0;
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: `/tmp/shots/${view}-${route.replaceAll('/', '_') || 'home'}.png`, fullPage: false });
      const text = await page.evaluate(() => document.body.innerText.slice(0, 120).replace(/\n/g, ' | '));
      console.log(`[${view}] ${route} OK :: ${text}`);
      if (errors.length) {
        failures++;
        console.log(`  ⚠ errors:\n    ${errors.slice(0, 5).join('\n    ')}`);
      }
    } catch (e) {
      failures++;
      console.log(`[${view}] ${route} FAIL: ${String(e).slice(0, 200)}`);
    }
  }
  await ctx.close();
}

// 交互测试（desktop）
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/currents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // 点击“日本暖流”目录 chip → 右侧面板应出现详情
  const chip = page.getByRole('button', { name: /日本暖流/ }).first();
  if (await chip.isVisible().catch(() => false)) {
    await chip.click();
    await page.waitForTimeout(700);
    const hasFormation = (await page.locator('body').innerText()).includes('形成原因');
    console.log('interact currents: chip→panel', hasFormation ? 'OK' : 'FAIL');
    if (!hasFormation) failures++;
  } else {
    console.log('interact currents: chip not visible — FAIL');
    failures++;
  }

  // formation: 打开“盛行风”开关
  await page.goto(BASE + '/formation', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const toggle = page.getByRole('switch').filter({ hasText: '盛行风' }).first();
  if (await toggle.isVisible().catch(() => false)) {
    const on = await toggle.getAttribute('aria-checked');
    if (on === 'false') await toggle.click();
    await page.waitForTimeout(400);
    const checked = await toggle.getAttribute('aria-checked');
    console.log('interact formation: toggle', checked);
  }

  // lab: 打开厄尔尼诺模拟并拖动滑杆
  await page.goto(BASE + '/lab', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /厄尔尼诺模拟/ }).click();
  await page.waitForTimeout(900);
  const slider = page.locator('input[type=range]').first();
  if (await slider.isVisible().catch(() => false)) {
    await slider.evaluate((el) => { el.value = '2.5'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(500);
    const txt = await page.locator('body').innerText();
    console.log('interact enso: slider→', txt.includes('东太平洋') ? 'OK' : 'check', '|', txt.includes('厄尔尼诺') ? 'has-elNino' : 'no-elNino');
  }
  await page.screenshot({ path: '/tmp/shots/interact-enso.png' });
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} issue(s) found`);
process.exit(failures === 0 ? 0 : 1);
