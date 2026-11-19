// Čistá herní logika (bez Three.js a DOM), testovatelná v Node.js.

export const WORLD = { size: 2400 }; // hranice pohybu: čtverec kolem středu (metry)

/** Auto: pozice x,z, úhel yaw (0 = směr -z), rychlost. */
export function createCar(x = 0, z = 0, yaw = 0) {
  return { x, z, yaw, speed: 0, health: 100 };
}

/**
 * Jeden krok fyziky auta.
 * input: { throttle: -1..1, steer: -1..1 }, dt v sekundách.
 */
export function stepCar(car, input, dt) {
  const maxSpeed = 28;
  const accel = 18;
  const brake = 30;
  const friction = 6;

  if (input.throttle > 0) car.speed += accel * input.throttle * dt;
  else if (input.throttle < 0) car.speed += brake * input.throttle * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), friction * dt);

  car.speed = Math.max(-maxSpeed / 2, Math.min(maxSpeed, car.speed));

  // Zatáčení je silnější při vyšší rychlosti a obrací se při couvání.
  const turnRate = 1.8 * Math.min(1, Math.abs(car.speed) / 8);
  car.yaw += input.steer * turnRate * Math.sign(car.speed || 1) * dt;

  car.x += -Math.sin(car.yaw) * car.speed * dt;
  car.z += -Math.cos(car.yaw) * car.speed * dt;
  clampToWorld(car);
  return car;
}

export function clampToWorld(entity) {
  const half = WORLD.size / 2 - 1;
  entity.x = Math.max(-half, Math.min(half, entity.x));
  entity.z = Math.max(-half, Math.min(half, entity.z));
}

/** Kolize dvou kruhů (auto a objekt). */
export function circlesOverlap(a, b, ra, rb) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const r = ra + rb;
  return dx * dx + dz * dz < r * r;
}

/** Vrátí index prvního bodu, který je v dosahu hráče, nebo -1. */
export function collectPickups(player, pickups, radius = 3) {
  let collected = 0;
  for (const p of pickups) {
    if (!p.taken && circlesOverlap(player, p, 1.2, radius * 0.5)) {
      p.taken = true;
      collected++;
    }
  }
  return collected;
}

/**
 * Policejní auto jede za hráčem. Vrací nový yaw směřující k hráči.
 * Pokud je hráč mimo dosah pronásledování, policie se zastaví.
 */
export function policeInput(police, target, chaseRadius = 160) {
  const dx = target.x - police.x;
  const dz = target.z - police.z;
  const dist = Math.hypot(dx, dz);
  if (dist > chaseRadius) return { throttle: 0, steer: 0 };

  // Úhel směru k cíli a rozdíl od aktuálního yaw
  const desiredYaw = Math.atan2(-dx, -dz);
  let diff = desiredYaw - police.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const steer = Math.max(-1, Math.min(1, diff * 2));
  const throttle = dist > 6 ? 0.9 : 0.2;
  return { throttle, steer };
}

/** Hladina hledání policií 0–5 podle "trestného" skóre (srážky s auty). */
export function wantedLevel(crimeScore) {
  if (crimeScore >= 100) return 5;
  if (crimeScore >= 60) return 4;
  if (crimeScore >= 35) return 3;
  if (crimeScore >= 15) return 2;
  if (crimeScore >= 1) return 1;
  return 0;
}

// Deterministický generátor pseudonáhodných čísel (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
