// Spojí více GeoJSON souborů (např. čtyři čtvrtiny oblasti) do jednoho data/praha.geojson.
// Duplicity (prvek na hranici dvou čtvrtí) odstraní podle OSM @id.
// Použití: node tools/merge-geojson.js soubor1.geojson soubor2.geojson ... [--out data/praha.geojson]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function mergeCollections(collections) {
  const seen = new Set();
  const features = [];
  for (const c of collections) {
    for (const f of c.features ?? []) {
      const key = f.properties?.['@id'] ?? f.id ?? JSON.stringify(f.geometry);
      if (seen.has(key)) continue;
      seen.add(key);
      features.push(f);
    }
  }
  return { type: 'FeatureCollection', features };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'praha.geojson');
  const inputs = args.filter((a, i) => a !== '--out' && (outIdx < 0 || i !== outIdx + 1));
  if (inputs.length === 0) {
    console.error('Zadej vstupní soubory.');
    process.exitCode = 1;
  } else {
    const merged = mergeCollections(inputs.map((f) => JSON.parse(readFileSync(f, 'utf8'))));
    writeFileSync(out, JSON.stringify(merged));
    console.log(`Spojeno ${inputs.length} souborů → ${merged.features.length} prvků v ${out}`);
  }
}
