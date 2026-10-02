// Fetch real-world imagery for the case archive from NASA Image Library (public API).
import { writeFileSync, mkdirSync } from 'node:fs';

const API = 'https://images-api.nasa.gov';
const ASSETS = 'https://images-assets.nasa.gov';
const UA = 'OceanFlow-Edu-Site/1.0 (geography teaching)';

const TOPICS = {
  globalCurrents: ['ocean surface currents', 'currents oceans'],
  kuroshio: ['kuroshio', 'kuroshio current japan'],
  nwPacificSST: ['sea surface temperature pacific', 'pacific sea surface temperature'],
  peruUpwelling: ['peru upwelling', 'upwelling peru'],
  peruCoast: ['peru coast pacific', 'litoral peru'],
  namib: ['namib desert', 'skeleton coast'],
  gulfStream: ['gulf stream', 'gulf stream sea surface temperature'],
  northAtlanticSST: ['north atlantic sea surface temperature', 'atlantic sea surface temperature'],
  iceberg: ['iceberg atlantic', 'iceberg north atlantic'],
  deepwater: ['deepwater horizon oil spill', 'gulf oil spill'],
  garbagePatch: ['pacific garbage patch', 'marine debris ocean'],
  arabianMonsoon: ['arabian sea monsoon', 'indian ocean monsoon'],
  atlanticSST: ['sea surface temperature global', 'aqua sea surface temperature'],
  oceanColor: ['ocean color plankton', 'phytoplankton bloom'],
};

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function search(q) {
  const url = `${API}/search?q=${encodeURIComponent(q)}&media_type=image`;
  const data = await getJson(url);
  return (data.collection?.items ?? []).map((it) => it.href).filter(Boolean);
}

// get the best direct image URL for a NASA asset collection
async function assetUrl(href) {
  try {
    if (!href.includes('images-assets.nasa.gov')) return null;
    const coll = await getJson(href);
    let items = coll;
    if (coll && Array.isArray(coll)) items = coll;
    else if (coll?.collection && Array.isArray(coll.collection.items)) items = coll.collection.items;
    if (!Array.isArray(items)) return null;
    const pick = (re) => items.find((u) => typeof u === 'string' && re.test(u));
    const url = pick(/~large\.(jpe?g|png|webp)/i)
      ?? pick(/~medium\.(jpe?g|png|webp)/i)
      ?? pick(/~orig\.(jpe?g|png|webp)/i);
    return url ?? null;
  } catch { return null; }
}

const out = {};
for (const [key, queries] of Object.entries(TOPICS)) {
  let best = null;
  for (const q of queries) {
    try {
      const hrefs = (await search(q)).slice(0, 6);
      for (const href of hrefs) {
        const url = await assetUrl(href);
        if (!url) continue;
        const id = href.split('/').filter(Boolean).pop();
        best = {
          title: key,
          url,
          source: 'NASA Image and Video Library',
          pageUrl: `https://images.nasa.gov/details/${id.replace(/\.json$/, '')}`,
          license: 'NASA 影像（公有领域，标注来源即可使用）',
        };
        break;
      }
    } catch (e) { /* try next query */ }
    if (best) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  out[key] = best;
  console.log(`${best ? 'OK' : 'MISS'} ${key}: ${best?.url ?? 'none'}`);
  await new Promise((r) => setTimeout(r, 500));
}
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/case-images.json', JSON.stringify(out, null, 2));
console.log('\nsaved public/data/case-images.json');
