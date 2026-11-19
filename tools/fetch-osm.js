// Stáhne REÁLNÁ data OpenStreetMap pro oblast Prahy (Staré Město, Malá Strana, Vltava)
// a uloží je jako data/praha.geojson. Spouštět na počítači s přístupem na internet:
//   npm run fetch-osm
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import osmtogeojson from 'osmtogeojson';

export const BBOX = '50.0790,14.4000,50.0960,14.4330'; // jih, západ, sever, východ

export function overpassQuery(bbox = BBOX) {
  return `[out:json][timeout:90];
(
  way["building"](${bbox});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|pedestrian)$"](${bbox});
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
  'https://overpass.openstreetmap.ru/api/interpreter',
];
const ATTEMPTS_PER_ENDPOINT = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass(query) {
  let lastError;
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_ENDPOINT; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // Overpass může vrátit 200 s chybou v poli remark (např. timeout)
        if (json.remark && !json.elements?.length) throw new Error(`Overpass: ${json.remark}`);
        return json;
      } catch (err) {
        lastError = err;
        console.warn(`${url} (pokus ${attempt}/${ATTEMPTS_PER_ENDPOINT}): ${err.message}`);
        await sleep(5000 * attempt);
      }
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
