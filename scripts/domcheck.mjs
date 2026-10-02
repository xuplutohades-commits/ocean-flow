import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;

async function check(view, vp, routes) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  for (const route of routes) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(1800);
      const r = await page.evaluate(() => {
        const out = { hOverflow: false, canvases: [], imgs: [], webgl: null, panelCards: [] };
        const de = document.documentElement;
        out.hOverflow = de.scrollWidth > de.clientWidth + 2;
        out.hOverflowAmt = de.scrollWidth - de.clientWidth;
        // canvas 统计
        document.querySelectorAll('canvas').forEach((c, i) => {
          const ctx2 = c.getContext('2d');
          let used = 0;
          if (ctx2 && c.width > 0 && c.height > 0) {
            try {
              const d = ctx2.getImageData(0, 0, Math.min(60, c.width), Math.min(60, c.height)).data;
              for (let j = 3; j < d.length; j += 4) if (d[j] > 8) used++;
            } catch {}
          }
          out.canvases.push({ i, w: c.width, h: c.height, used });
        });
        // 远程图片
        document.querySelectorAll('img').forEach((im, i) => {
          out.imgs.push({ i, ok: im.complete && im.naturalWidth > 50, src: (im.src || '').slice(0, 70) });
        });
        // WebGL（首页地球）
        try {
          const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
          out.webgl = !!gl;
        } catch { out.webgl = false; }
        // 面板溢出
        for (const el of document.querySelectorAll('.glass, .map-shell')) {
          if (el.scrollWidth > el.clientWidth + 8) {
            out.panelCards.push(String(el.className).split(' ').slice(0,3).join('.') + ' overflow-x ' + (el.scrollWidth - el.clientWidth));
          }
        }
        return out;
      });
      const cvIssues = r.canvases.filter((c) => c.w > 0 && c.used <= 3 && c.w > 200);
      const imgIssues = r.imgs.filter((i) => !i.ok);
      let log = `[${view}] ${route} horizOverflow=${r.hOverflow ? r.hOverflowAmt + 'px' : 'no'} canvases=${r.canvases.length} `;
      if (cvIssues.length) { log += `EMPTY_CANVAS=[${cvIssues.map((c) => c.i).join(',')}] `; fails++; }
      if (imgIssues.length) { log += `IMG_FAIL=[${imgIssues.map((i) => i.src).join(',')}] `; fails++; }
      if (r.panelCards.length) { log += `PANEL_OVERFLOW=${r.panelCards.length} `; }
      console.log(log.trim());
      if (route === '/') console.log(`    webgl support: ${r.webgl}`);
    } catch (e) {
      fails++;
      console.log(`[${view}] ${route} FAIL ${String(e).slice(0, 150)}`);
    }
  }
  await ctx.close();
}

function clampStr(s) { return s.split(' ').slice(0, 3).join('.'); }

await check('desktop', { width: 1440, height: 900 }, ['/', '/currents', '/formation', '/atmosphere', '/impacts', '/cases', '/cases/kuroshio', '/cases/peru', '/cases/monsoon', '/lab']);
await check('tablet', { width: 834, height: 1112 }, ['/', '/currents', '/cases', '/lab']);
await browser.close();
console.log(fails === 0 ? 'DOM CHECKS PASSED' : `${fails} issue(s)`);
process.exit(fails === 0 ? 0 : 1);
