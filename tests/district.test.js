import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ribbonGeometry } from '../src/district.js';

test('vodní plochy (polygon) a řeka (pás) jdou sloučit do jedné geometrie', () => {
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(10, 0), new THREE.Vector2(10, 10)]);
  const poly = new THREE.ShapeGeometry(shape);
  poly.rotateX(-Math.PI / 2);
  const ribbon = ribbonGeometry([{ x: 0, z: 0 }, { x: 0, z: 50 }], 60, 0.01);
  const merged = mergeGeometries([poly, ribbon], false);
  assert.ok(merged, 'sloučení nesmí vrátit null');
  assert.ok(merged.attributes.position.count > 0);
});
