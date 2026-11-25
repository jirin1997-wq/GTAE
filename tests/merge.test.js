import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCollections } from '../tools/merge-geojson.js';

test('spojení čtvrtí odstraní duplicity podle @id', () => {
  const a = { type: 'FeatureCollection', features: [{ properties: { '@id': 'way/1' } }, { properties: { '@id': 'way/2' } }] };
  const b = { type: 'FeatureCollection', features: [{ properties: { '@id': 'way/2' } }, { properties: { '@id': 'way/3' } }] };
  const m = mergeCollections([a, b]);
  assert.equal(m.features.length, 3);
  assert.equal(m.type, 'FeatureCollection');
});
