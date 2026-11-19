import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ORIGIN,
  project,
  ringToLocal,
  isPointInPolygon,
  distanceToPolyline,
  buildingHeight,
  roadWidth,
  parseDistrict,
  isBlockedByWater,
  isBlockedByBuilding,
  findSpawn,
  pointAlongPolyline,
  pickupsOnRoads,
} from '../src/geo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(path.join(here, 'fixtures', 'sample-district.geojson'), 'utf8'));

test('origin se promítá do (0,0)', () => {
  const p = project(ORIGIN.lon, ORIGIN.lat);
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.z) < 1e-9);
});

test('sever je -z, východ je +x', () => {
  const north = project(ORIGIN.lon, ORIGIN.lat + 0.001);
  const east = project(ORIGIN.lon + 0.001, ORIGIN.lat);
  assert.ok(north.z < 0);
  assert.ok(east.x > 0);
  // 0.001° zeměpisné šířky je zhruba 111 m
  assert.ok(Math.abs(-north.z - 110.6) < 1, `délka ${-north.z}`);
});

test('uzavírací bod polygonu se odstraní', () => {
  const ring = ringToLocal([[14.42, 50.08], [14.43, 50.08], [14.43, 50.09], [14.42, 50.08]]);
  assert.equal(ring.length, 3);
});

test('point-in-polygon', () => {
  const sq = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
  assert.equal(isPointInPolygon({ x: 5, z: 5 }, sq), true);
  assert.equal(isPointInPolygon({ x: 15, z: 5 }, sq), false);
  assert.equal(isPointInPolygon({ x: -1, z: -1 }, sq), false);
});

test('vzdálenost od lomené čáry', () => {
  const line = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
  assert.ok(Math.abs(distanceToPolyline({ x: 5, z: 3 }, line) - 3) < 1e-9);
  assert.ok(Math.abs(distanceToPolyline({ x: 13, z: 4 }, line) - 5) < 1e-9);
});

test('výška budovy z tagů', () => {
  assert.equal(buildingHeight({ height: '25 m' }), 25);
  assert.equal(buildingHeight({ 'building:levels': '5' }), 5 * 3.2 + 2);
  assert.equal(buildingHeight({}), 12);
});

test('šířka silnic podle kategorie', () => {
  assert.equal(roadWidth('primary'), 12);
  assert.equal(roadWidth('neznámé'), 6);
});

test('parseDistrict vybere budovy, silnice, řeku a převede souřadnice', () => {
  const d = parseDistrict(sample);
  assert.equal(d.buildings.length, 2);
  assert.equal(d.buildings[0].height, 20);
  assert.equal(d.buildings[1].height, 5 * 3.2 + 2);
  assert.equal(d.roads.length, 2);
  assert.equal(d.waterways.length, 1);
});

test('parseDistrict zahodí objekty mimo poloměr', () => {
  const small = parseDistrict(sample, { radius: 20 });
  assert.equal(small.buildings.length, 0); // budovy jsou dál než 20 m
  assert.equal(small.roads.length, 1); // residential prochází středem
  assert.equal(small.roads[0].highway, 'residential');
  assert.equal(small.waterways.length, 0); // řeka je ~415 m západně

  const big = parseDistrict(sample, { radius: 900 });
  assert.equal(big.waterways.length, 1);
});

test('řeka blokuje auto, most (silnice přes řeku) je průjezdný', () => {
  const d = parseDistrict(sample);
  // řeka je na lon 14.4150 → x ≈ -0.0058*... bod přímo na ní
  const riverPoint = project(14.4150, 50.0860);
  assert.equal(isBlockedByWater(riverPoint, d), true);
  // primární silnice je na lat 50.0860 a protíná řeku → průjezdný bod
  const roadOverRiver = { x: riverPoint.x, z: riverPoint.z };
  const withRoad = { ...d, roads: [...d.roads, { points: [project(14.4140, 50.0860), project(14.4160, 50.0860)], width: 12 }] };
  assert.equal(isBlockedByWater(roadOverRiver, withRoad), false);
  assert.equal(isBlockedByWater(project(ORIGIN.lon, ORIGIN.lat), d), false);
});

test('budovy blokují auto s okrajem', () => {
  const d = parseDistrict(sample);
  const inside = project(14.4202, 50.0872);
  assert.equal(isBlockedByBuilding(inside, d), true);
  assert.equal(isBlockedByBuilding(project(14.4215, 50.0872), d), false);
});

test('spawn je na hlavní silnici', () => {
  const d = parseDistrict(sample);
  const s = findSpawn(d);
  assert.ok(d.roads.some((r) => distanceToPolyline(s, r.points) < 0.01));
  assert.equal(isBlockedByBuilding(s, d, 4), false);
  assert.equal(isBlockedByWater(s, d, 4), false);
  assert.ok(d.waterways.every((w) => distanceToPolyline(s, w.points) >= w.width / 2 + 4), 'start není nad řekou');
});

test('pointAlongPolyline jde po čáře a smyčkuje', () => {
  const line = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }];
  const a = pointAlongPolyline(line, 5);
  assert.ok(Math.abs(a.x - 5) < 1e-9 && Math.abs(a.z) < 1e-9);
  const b = pointAlongPolyline(line, 15);
  assert.ok(Math.abs(b.x - 10) < 1e-9 && Math.abs(b.z - 5) < 1e-9);
  const wrapped = pointAlongPolyline(line, 25); // délka 20 → zpět na začátek + 5
  assert.ok(Math.abs(wrapped.x - 5) < 1e-9);
});

test('mince leží na silnicích a jsou v okruhu', () => {
  const d = parseDistrict(sample);
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pickups = pickupsOnRoads(d, 20, rand);
  assert.equal(pickups.length, 20);
  for (const p of pickups) {
    assert.ok(d.roads.some((r) => distanceToPolyline(p, r.points) < 0.01));
  }
});
