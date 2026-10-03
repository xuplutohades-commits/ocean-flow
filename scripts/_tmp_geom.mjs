import { chromium } from 'playwright-core';
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-angle=metal', '--force-device-scale-factor=1'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/atmosphere', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const audit = await page.evaluate(() => {
  const svg = [...document.querySelectorAll('svg')].find((s) => (s.getAttribute('aria-label') || '').includes('三圈环流'));
  const vb = svg.viewBox.baseVal;
  const scaleX = vb.width / svg.getBoundingClientRect().width;
  const scaleY = vb.height / svg.getBoundingClientRect().height;
  const info = (t) => {
    const b = t.getBBox();
    return { cx: Math.round((b.x + b.width / 2) / scaleX), cy: Math.round((b.y + b.height / 2) / scaleY), w: Math.round(b.width / scaleX), text: t.textContent.slice(0, 10) };
  };
  const out = { scaleX, scaleY, title: null, nodes: [], winds: [], cells: [], pressures: [] };
  for (const t of svg.querySelectorAll('text')) {
    const c = t.textContent;
    const i = info(t);
    if (c === '三圈环流与全球风带') out.title = i;
    if (c.includes('赤道受热') || c === '30° 下沉' || c === '60° 上升' || c === '极地下沉') out.nodes.push(i);
    if (c.includes('风带') || c === '赤道无风带') out.winds.push(i);
    if (c === '极地环流' || c === '中纬环流' || c === '哈德莱环流') out.cells.push(i);
    if (['极地高压', '副热带高压', '赤道低压', '副极地低压'].includes(c)) out.pressures.push(i);
  }
  const overlaps = [];
  const all = [...svg.querySelectorAll('text')].map(info);
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
    const A = all[a], B = all[b];
    if (Math.abs(A.cx - B.cx) < (A.w + B.w) / 2 - 2 && Math.abs(A.cy - B.cy) < 14) overlaps.push(`${A.text}×${B.text}`);
  }
  return { out, overlaps: overlaps.slice(0, 12) };
});
console.log('标题中心(期望450):', JSON.stringify(audit.out.title));
console.log('气压带文本 x(期望 60/190/320/450/580/710/840):', audit.out.pressures.map((p) => p.cx).join(','));
console.log('节点标签 (期望 x: 450赤道,320/580下沉,190/710上升,60/840极地):', audit.out.nodes.sort((a, b) => a.cx - b.cx).map((n) => `${n.cx}`).join(','));
console.log('环流名 x (期望 125/255/385/515/645/775):', audit.out.cells.sort((a, b) => a.cx - b.cx).map((c) => c.cx).join(','));
console.log('风带文本 x:', audit.out.winds.map((w) => w.cx).join(','));
console.log('文本重叠对:', audit.out.overlaps.length ? audit.out.overlaps.join(' | ') : '无');
await browser.close();
