// Chodci a cyklisté: pohyb po silnicích (s odsazením na chodník / kraj vozovky).
import * as THREE from 'three';
import { pointAlongPolyline, roadLength } from './geo.js';
import { circlesOverlap } from './logic.js';

/** Posune bod kolmo doprava vzhledem k yaw (yaw 0 = směr -z, doprava = +x). */
export function offsetRight(pos, yaw, offset) {
  return { x: pos.x + Math.cos(yaw) * offset, z: pos.z - Math.sin(yaw) * offset, yaw };
}

/** Jednoduché kolo pro cyklistu (rám + dvě kola). */
export function makeBicycle() {
  const bike = new THREE.Group();
  const wheelGeom = new THREE.TorusGeometry(0.34, 0.04, 6, 16);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const front = new THREE.Mesh(wheelGeom, tireMat);
  const rear = new THREE.Mesh(wheelGeom, tireMat);
  front.rotation.y = Math.PI / 2;
  rear.rotation.y = Math.PI / 2;
  front.position.set(0, 0.34, -0.55);
  rear.position.set(0, 0.34, 0.55);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x2f6ea6, metalness: 0.4, roughness: 0.4 }),
  );
  frame.position.set(0, 0.45, 0);
  bike.add(front, rear, frame);
  bike.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return bike;
}

/**
 * Vytvoří účastníky: pěší (na chodníku) a cyklisty (u pravého kraje silnice).
 * humanTemplate = Mesh/Group s modelem člověka; animace chůze se přehraje přes AnimationMixer.
 */
export function createCrowd({ scene, district, human, rand, pedestrians = 10, cyclists = 4, SkeletonUtils }) {
  const roads = district.roads.filter((r) => r.width >= 5 && r.points.length >= 2);
  const actors = [];
  if (!human || roads.length === 0) return actors;

  const spawn = (kind) => {
    const road = roads[Math.floor(rand() * roads.length)];
    const total = roadLength(road.points);
    const isCyclist = kind === 'cyclist';
    const offset = isCyclist ? road.width / 2 - 1 : road.width / 2 + 1.5;
    const clone = SkeletonUtils.clone(human);
    const group = new THREE.Group();
    group.add(clone);
    if (isCyclist) {
      const bike = makeBicycle();
      group.add(bike);
    }
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(group);
    const mixer = new THREE.AnimationMixer(clone);
    if (human.userData.clip) {
      mixer.clipAction(human.userData.clip).play();
    }
    actors.push({
      kind,
      points: road.points,
      total,
      s: rand() * total,
      dir: rand() < 0.5 ? 1 : -1,
      speed: isCyclist ? 4 + rand() * 2 : 1.2 + rand() * 0.5,
      offset,
      mixer,
      group,
      cooldown: 0,
    });
  };

  for (let i = 0; i < pedestrians; i++) spawn('pedestrian');
  for (let i = 0; i < cyclists; i++) spawn('cyclist');
  return actors;
}

/** Posune všechny účastníky a vrátí jejich aktuální pozice (pro kolize). */
export function stepCrowd(actors, dt) {
  for (const a of actors) {
    a.s += a.dir * a.speed * dt;
    a.mixer.update(dt);
    const pos = pointAlongPolyline(a.points, a.s);
    const yaw = pos.yaw + (a.dir < 0 ? Math.PI : 0);
    const side = offsetRight(pos, pos.yaw, a.offset);
    a.group.position.set(side.x, 0, side.z);
    a.group.rotation.y = yaw;
    a.x = side.x;
    a.z = side.z;
    if (a.cooldown > 0) a.cooldown -= dt;
  }
}

/** Srážka auta s chodcem nebo cyklistou: vrací počet zásahů. */
export function collideCrowd(car, actors, radius = 1.6) {
  let hits = 0;
  for (const a of actors) {
    if (a.cooldown > 0) continue;
    if (circlesOverlap(car, a, radius, 0.8)) {
      hits++;
      a.cooldown = 3;
    }
  }
  return hits;
}
