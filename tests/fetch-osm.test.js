import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overpassQuery, overpassToGeoJSON } from '../tools/fetch-osm.js';
import { parseDistrict } from '../src/geo.js';

test('dotaz obsahuje budovy, silnice, řeku a vodu v bbox', () => {
  const q = overpassQuery('1,2,3,4');
  assert.match(q, /way\["building"\]\(1,2,3,4\)/);
  assert.match(q, /waterway"="river"\]\(1,2,3,4\)/);
  assert.match(q, /out geom/);
});

test('Overpass JSON se převede na GeoJSON a projde parserem', () => {
  const overpass = {
    version: 0.6,
    elements: [
      { type: 'node', id: 1, lat: 50.0875, lon: 14.4208 },
      {
        type: 'way', id: 10, tags: { building: 'yes', height: '18' },
        nodes: [1, 2, 3, 4, 1],
        geometry: [
          { lat: 50.0874, lon: 14.4200 }, { lat: 50.0874, lon: 14.4204 },
          { lat: 50.0878, lon: 14.4204 }, { lat: 50.0878, lon: 14.4200 }, { lat: 50.0874, lon: 14.4200 },
        ],
      },
      {
        type: 'way', id: 11, tags: { highway: 'primary' }, nodes: [5, 6],
        geometry: [{ lat: 50.0870, lon: 14.4180 }, { lat: 50.0870, lon: 14.4230 }],
      },
    ],
  };
  const gj = overpassToGeoJSON(overpass);
  assert.equal(gj.type, 'FeatureCollection');
  assert.equal(gj.features.length, 2);
  const d = parseDistrict(gj, { radius: 900 });
  assert.equal(d.buildings.length, 1);
  assert.equal(d.buildings[0].height, 18);
  assert.equal(d.roads.length, 1);
});
