import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCar,
  stepCar,
  circlesOverlap,
  collectPickups,
  policeInput,
  wantedLevel,
  WORLD,
  mulberry32,
} from '../src/logic.js';

test('auto stojí bez vstupu', () => {
  const c = createCar(0, 0, 0);
  stepCar(c, { throttle: 0, steer: 0 }, 1);
  assert.equal(c.speed, 0);
  assert.equal(c.x, 0);
  assert.equal(c.z, 0);
});

test('plyn zrychluje a auto jede dopředu (směr -z při yaw 0)', () => {
  const c = createCar(0, 0, 0);
  for (let i = 0; i < 60; i++) stepCar(c, { throttle: 1, steer: 0 }, 1 / 60);
  assert.ok(c.speed > 5, `rychlost ${c.speed}`);
  assert.ok(c.z < -1, `z ${c.z}`);
  assert.ok(Math.abs(c.x) < 1e-9);
});

test('rychlost je omezena maximem', () => {
  const c = createCar(0, 0, 0);
  for (let i = 0; i < 1000; i++) stepCar(c, { throttle: 1, steer: 0 }, 1 / 60);
  assert.ok(c.speed <= 28 + 1e-9);
});

test('zatáčení změní yaw jen při pohybu', () => {
  const still = createCar(0, 0, 0);
  stepCar(still, { throttle: 0, steer: 1 }, 1);
  assert.equal(still.yaw, 0);

  const moving = createCar(0, 0, 0);
  moving.speed = 15;
  stepCar(moving, { throttle: 0, steer: 1 }, 0.5);
  assert.ok(moving.yaw > 0);
});

test('auto zůstane uvnitř světa', () => {
  const c = createCar(0, 0, 0);
  c.x = 10000;
  c.z = -10000;
  stepCar(c, { throttle: 0, steer: 0 }, 0.016);
  const half = WORLD.size / 2;
  assert.ok(Math.abs(c.x) <= half);
  assert.ok(Math.abs(c.z) <= half);
});

test('kolize kruhů', () => {
  assert.equal(circlesOverlap({ x: 0, z: 0 }, { x: 1, z: 0 }, 1, 1), true);
  assert.equal(circlesOverlap({ x: 0, z: 0 }, { x: 3, z: 0 }, 1, 1), false);
});

test('sbírání mincí: každou minci lze sebrat jen jednou', () => {
  const player = { x: 0, z: 0 };
  const pickups = [{ x: 1, z: 0, taken: false }, { x: 100, z: 0, taken: false }];
  assert.equal(collectPickups(player, pickups), 1);
  assert.equal(collectPickups(player, pickups), 0);
  assert.equal(pickups[1].taken, false);
});

test('policie jede k hráči a zatáčí správným směrem', () => {
  // Hráč je na záporné ose z od policie – správný yaw je 0 (směr -z)
  const police = { x: 0, z: 50, yaw: 0 };
  const input = policeInput(police, { x: 0, z: 0 });
  assert.ok(input.throttle > 0);
  assert.ok(Math.abs(input.steer) < 0.01);

  // Hráč vpravo (+x): policie musí zatáčet
  const p2 = { x: 0, z: 50, yaw: 0 };
  const i2 = policeInput(p2, { x: 40, z: 50 });
  assert.notEqual(Math.sign(i2.steer), 0);
});

test('policie mimo dosah se nehýbe', () => {
  const input = policeInput({ x: 0, z: 0, yaw: 0 }, { x: 500, z: 0 });
  assert.deepEqual(input, { throttle: 0, steer: 0 });
});

test('hladina hledání roste s trestným skóre a je omezena na 5', () => {
  assert.equal(wantedLevel(0), 0);
  assert.equal(wantedLevel(1), 1);
  assert.equal(wantedLevel(20), 2);
  assert.equal(wantedLevel(40), 3);
  assert.equal(wantedLevel(70), 4);
  assert.equal(wantedLevel(500), 5);
});

test('mulberry32 je deterministický', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

