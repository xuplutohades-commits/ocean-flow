import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'public/data/case-images.json');
const meta = JSON.parse(readFileSync(jsonPath, 'utf8'));
mkdirSync(join(root, 'public/images'), { recursive: true });
const Agent = 'OceanFlow-Edu/1.0 (teaching)';
let ok = 0, fail = 0;
for (const [k, v] of Object.entries(meta)) {
  const ext = v.url.match(/\.(jpe?g|png|webp)(\?|$)/i)?.[1]?.toLowerCase() ?? 'jpg';
  const out = join(root, 'public/images', `${k}.${ext === 'jpeg' ? 'jpg' : ext}`);
  try {
    const res = await fetch(v.url, { headers: { 'User-Agent': Agent } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(out, buf);
    v.url = `/images/${k}.${ext === 'jpeg' ? 'jpg' : ext}`;
    v.local = true;
    ok++;
    console.log('OK', k, (buf.length / 1024).toFixed(0) + 'KB');
  } catch (e) {
    fail++;
    console.log('FAIL', k, String(e).slice(0, 80));
  }
}
writeFileSync(jsonPath, JSON.stringify(meta, null, 2));
console.log(`\nbundled ${ok}, failed ${fail}`);
