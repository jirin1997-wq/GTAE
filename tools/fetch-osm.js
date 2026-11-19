// Stáhne REÁLNÁ data OpenStreetMap pro oblast Prahy (Staré Město, Malá Strana, Vltava)
// a uloží je jako data/praha.geojson. Spouštět na počítači s přístupem na internet:
//   npm run fetch-osm
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import osmtogeojson from 'osmtogeojson';

export const BBOX = '50.0790,14.4000,50.0960,14.4330'; // jih, západ, sever, východ

export function overpassQuery(bbox = BBOX) {
  return `[out:json][timeout:180];
(
  way["building"](${bbox});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|pedestrian|footway|cycleway|path|steps)$"](${bbox});
  way["waterway"="river"](${bbox});
  way["natural"="water"](${bbox});
  relation["building"]["type"="multipolygon"](${bbox});
  relation["natural"="water"]["type"="multipolygon"](${bbox});
);
out geom;`;
}

/** Převod odpovědi Overpass JSON na GeoJSON FeatureCollection. */
export function overpassToGeoJSON(overpassJson) {
  return osmtogeojson(overpassJson);
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchOverpass(query) {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      console.warn(`Selhalo: ${err.message}, zkouším další server…`);
    }
  }
  throw lastError;
}

async function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = path.join(root, 'data', 'praha.geojson');
  console.log('Stahuji data OpenStreetMap pro bbox', BBOX);
  const raw = await fetchOverpass(overpassQuery());
  const geojson = overpassToGeoJSON(raw);
  const count = geojson.features.length;
  if (count === 0) throw new Error('Overpass nevrátil žádné prvky');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(geojson));
  console.log(`Uloženo ${count} prvků (© přispěvatelé OpenStreetMap, ODbL) do ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
