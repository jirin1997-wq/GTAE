// Vytvoří UKÁZKOVOU mapu (syntetická mřížka ulic, budov a řeka). NENÍ to reálná Praha.
// Použití: node tools/make-sample.js
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN, project } from '../src/geo.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sample-district.geojson');
const features = [];
const toLL = (x, z) => {
  // inverzní projekce k ORIGIN
  const mPerDegLon = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
  return [ORIGIN.lon + x / mPerDegLon, ORIGIN.lat - z / 110574];
};

// Ulice v mřížce 120 m
for (let i = -6; i <= 6; i++) {
  const c = i * 120;
  features.push({ type: 'Feature', properties: { highway: i % 2 ? 'primary' : 'residential' },
    geometry: { type: 'LineString', coordinates: [toLL(-900, c), toLL(900, c)] } });
  features.push({ type: 'Feature', properties: { highway: 'residential' },
    geometry: { type: 'LineString', coordinates: [toLL(c, -900), toLL(c, 900)] } });
}
// Budovy v blocích, s prázdnou řekou uprostřed (x ≈ 0)
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let bx = -6; bx < 6; bx++) {
  for (let bz = -6; bz < 6; bz++) {
    const cx = bx * 120 + 60;
    const cz = bz * 120 + 60;
    if (Math.abs(cx) < 80) continue; // řeka a břehy
    const w = 40 + rand() * 20;
    const d = 40 + rand() * 20;
    const h = 12 + Math.floor(rand() * 6) * 4;
    const x0 = cx - w / 2;
    const z0 = cz - d / 2;
    features.push({ type: 'Feature', properties: { building: 'yes', height: String(h) },
      geometry: { type: 'Polygon', coordinates: [[toLL(x0, z0), toLL(x0 + w, z0), toLL(x0 + w, z0 + d), toLL(x0, z0 + d), toLL(x0, z0)]] } });
  }
}
// Řeka (osa x ≈ 0)
features.push({ type: 'Feature', properties: { waterway: 'river' },
  geometry: { type: 'LineString', coordinates: [toLL(0, -1000), toLL(0, 1000)] } });

writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', name: 'UKAZKA-NENI-PRAHA', features }, null, 1));
console.log(`Zapsáno ${features.length} prvků do ${out}`);
