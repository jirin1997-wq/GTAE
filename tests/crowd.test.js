import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offsetRight, collideCrowd } from '../src/crowd.js';

test('offsetRight: při yaw 0 (směr -z) je pravá strana +x', () => {
  const p = offsetRight({ x: 0, z: 0 }, 0, 2);
  assert.ok(Math.abs(p.x - 2) < 1e-9 && Math.abs(p.z) < 1e-9);
});

test('offsetRight: při yaw π/2 (směr -x, na západ) je pravá strana na sever (-z)', () => {
  const p = offsetRight({ x: 0, z: 0 }, Math.PI / 2, 2);
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.z + 2) < 1e-9, `${p.x},${p.z}`);
});

test('srážka s chodcem zvedne počet zásahů a dá cooldown', () => {
  const car = { x: 0, z: 0 };
  const actors = [{ x: 1, z: 0, cooldown: 0 }, { x: 50, z: 0, cooldown: 0 }];
  assert.equal(collideCrowd(car, actors), 1);
  assert.equal(collideCrowd(car, actors), 0); // cooldown
  assert.ok(actors[0].cooldown > 0);
});
