document.body.dataset.app = 'running';

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createCar,
  stepCar,
  circlesOverlap,
  collectPickups,
  policeInput,
  wantedLevel,
  mulberry32,
  clampToWorld,
} from './logic.js';
import {
  parseDistrict,
  isBlockedByBuilding,
  isBlockedByWater,
  findSpawn,
  pointAlongPolyline,
  pickupsOnRoads,
} from './geo.js';
import { buildDistrict } from './district.js';

const CAR_RADIUS = 1.6;
const MAX_HEALTH = 100;
const TRAFFIC_COUNT = 14;
const DEFAULT_DATA = 'data/praha.geojson';
const FALLBACK_DATA = 'data/sample-district.geojson';

// ---------- Renderer a scéna ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const SKY = 0xf2b8a2; // večerní nebe, zlaté hodiny
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 250, 1400);

// Odrazy světla z okolí (PBR materiály tak vypadají přirozeněji)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

const sun = new THREE.DirectionalLight(0xffd7a8, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 1, far: 800 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xfde8d8, 0x4a4256, 0.6));

// ---------- Data ----------
const params = new URLSearchParams(location.search);
const radius = Number(params.get('radius')) || 1200;

async function loadDistrict() {
  const url = params.get('data') || DEFAULT_DATA;
  let res = await fetch(url);
  let source = 'real';
  if (!res.ok) {
    res = await fetch(FALLBACK_DATA);
    source = 'sample';
  }
  if (!res.ok) throw new Error('Nelze načíst žádná data mapy');
  return { district: parseDistrict(await res.json(), { radius }), source };
}

// ---------- Herní stav ----------
let district = null;
let state = null;
let traffic = [];
const coinMeshes = new Map();
const policeMeshes = [];
const keys = new Set();

const playerMesh = makeCarMesh(0xff7b54);
scene.add(playerMesh);
const coinGeom = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 14);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9, roughness: 0.3, emissive: 0x332200 });

function makeCarMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.9, 4.4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 }),
  );
  body.position.y = 0.9;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.8, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1d2330, roughness: 0.2, metalness: 0.5 }),
  );
  cabin.position.set(0, 1.6, -0.2);
  group.add(cabin);
  return group;
}

function newState(spawn) {
  const rand = mulberry32(2024);
  const pickups = pickupsOnRoads(district, 30, rand);
  // Doprava: auta jedou po reálných silnicích
  const drivable = district.roads.filter((r) => r.width >= 6);
  traffic = [];
  for (let i = 0; i < TRAFFIC_COUNT && drivable.length; i++) {
    const road = drivable[Math.floor(rand() * drivable.length)];
    traffic.push({
      points: road.points,
      s: rand() * 500,
      dir: rand() < 0.5 ? 1 : -1,
      speed: 6 + rand() * 6,
      mesh: makeCarMesh([0xe9edf2, 0x2b59c3, 0xc0392b, 0x2ecc71][i % 4]),
    });
  }
  return {
    car: createCar(spawn.x, spawn.z, 0),
    police: [],
    pickups,
    crime: 0,
    health: MAX_HEALTH,
    coins: 0,
    status: 'playing',
    wanted: 0,
    speed: 0,
    elapsed: 0,
  };
}

// ---------- Synchronizace meshů ----------
function syncMeshes() {
  playerMesh.position.set(state.car.x, 0, state.car.z);
  playerMesh.rotation.y = state.car.yaw;

  for (const t of traffic) {
    if (!t.mesh.parent) scene.add(t.mesh);
    const pos = pointAlongPolyline(t.points, t.s);
    t.mesh.position.set(pos.x, 0, pos.z);
    t.mesh.rotation.y = pos.yaw + (t.dir < 0 ? Math.PI : 0);
  }

  while (policeMeshes.length < state.police.length) {
    const m = makeCarMesh(0x1e3a8a);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.25, 0.25, 4.5),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    stripe.position.y = 1.2;
    m.add(stripe);
    scene.add(m);
    policeMeshes.push(m);
  }
  policeMeshes.forEach((m, i) => {
    const p = state.police[i];
    m.visible = Boolean(p);
    if (p) {
      m.position.set(p.x, 0, p.z);
      m.rotation.y = p.yaw;
    }
  });

  state.pickups.forEach((p, i) => {
    let mesh = coinMeshes.get(i);
    if (!mesh) {
      mesh = new THREE.Mesh(coinGeom, coinMat);
      mesh.position.set(p.x, 1.6, p.z);
      mesh.rotation.x = Math.PI / 2;
      scene.add(mesh);
      coinMeshes.set(i, mesh);
    }
    mesh.visible = !p.taken;
    mesh.rotation.z += 0.03;
  });
}

// ---------- Logika ----------
function readInput() {
  const up = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
  const down = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
  const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
  const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
  return { throttle: (up ? 1 : 0) - (down ? 1 : 0), steer: (right ? 1 : 0) - (left ? 1 : 0) };
}

function updateTraffic(dt) {
  for (const t of traffic) {
    t.s += t.dir * t.speed * dt;
    const pos = pointAlongPolyline(t.points, t.s);
    if (circlesOverlap(state.car, pos, CAR_RADIUS, CAR_RADIUS)) {
      state.health -= 8;
      state.crime += 5;
      state.car.speed *= -0.3;
      t.s -= t.dir * 3;
    }
  }
}

function updatePolice(dt) {
  const want = wantedLevel(state.crime);
  state.wanted = want;
  const count = Math.min(want, 4);
  while (state.police.length < count) {
    const angle = Math.random() * Math.PI * 2;
    state.police.push({ x: state.car.x + Math.cos(angle) * 90, z: state.car.z + Math.sin(angle) * 90, yaw: 0, speed: 0 });
  }
  state.police = state.police.slice(0, count);

  for (const p of state.police) {
    const input = policeInput(p, state.car);
    p.yaw += input.steer * 1.4 * dt;
    p.speed = Math.min(22, p.speed + 14 * input.throttle * dt);
    if (input.throttle === 0) p.speed = Math.max(0, p.speed - 10 * dt);
    p.x += -Math.sin(p.yaw) * p.speed * dt;
    p.z += -Math.cos(p.yaw) * p.speed * dt;
    if (circlesOverlap(state.car, p, CAR_RADIUS, CAR_RADIUS)) state.health -= 12 * dt;
  }
}

function update(dt) {
  if (state.status !== 'playing') return;
  state.elapsed += dt;

  const prev = { x: state.car.x, z: state.car.z };
  stepCar(state.car, readInput(), dt);
  clampToWorld(state.car);

  // Budovy a řeka (mimo most a silnici) auto zastaví
  if (isBlockedByBuilding(state.car, district, CAR_RADIUS) || isBlockedByWater(state.car, district, CAR_RADIUS)) {
    state.car.x = prev.x;
    state.car.z = prev.z;
    const impact = Math.abs(state.car.speed);
    state.car.speed = 0;
    state.health -= impact * 0.8;
    state.crime += impact > 5 ? 3 : 0;
  }

  state.coins += collectPickups(state.car, state.pickups, 2.5);
  updateTraffic(dt);
  updatePolice(dt);

  if (state.police.length === 0 && state.crime > 0) {
    state.crime = Math.max(0, state.crime - 2 * dt);
  }
  state.speed = Math.abs(state.car.speed) * 3.6;
  if (state.health <= 0) {
    state.health = 0;
    state.status = 'wrecked';
  }
}

// ---------- HUD ----------
const el = {
  coins: document.getElementById('coins'),
  wanted: document.getElementById('wanted'),
  health: document.getElementById('health'),
  speed: document.getElementById('speed'),
  message: document.getElementById('message'),
  source: document.getElementById('source'),
};

function updateHud() {
  el.coins.textContent = String(state.coins);
  el.wanted.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  el.health.style.width = `${(state.health / MAX_HEALTH) * 100}%`;
  el.speed.textContent = String(Math.round(state.speed));
  const messages = {
    playing: state.wanted > 0 ? 'Policie tě hledá! Uteč jim.' : 'Sbírej koruny po Praze.',
    wrecked: 'Auto je v troskách. Stiskni R pro novou hru.',
  };
  el.message.textContent = messages[state.status] ?? '';
  document.body.dataset.status = state.status;
  document.body.dataset.coins = String(state.coins);
  document.body.dataset.wanted = String(state.wanted);
  document.body.dataset.health = String(Math.round(state.health));
  document.body.dataset.source = district ? district.source : 'loading';
}

// ---------- Kamera, světlo, smyčka ----------
const camTarget = new THREE.Vector3();
function updateCamera() {
  const dist = 11;
  const height = 5.5;
  camTarget.set(
    state.car.x + Math.sin(state.car.yaw) * dist,
    height,
    state.car.z + Math.cos(state.car.yaw) * dist,
  );
  camera.position.lerp(camTarget, 0.12);
  camera.lookAt(state.car.x, 1.2, state.car.z);
  // Slunce a jeho stín se drží nad autem, aby byl stín vždy v kvalitě
  sun.target.position.set(state.car.x, 0, state.car.z);
  sun.position.set(state.car.x + 120, 160, state.car.z + 90);
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state) {
    update(dt);
    syncMeshes();
    updateCamera();
    updateHud();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function restart() {
  if (!state || state.status !== 'wrecked') return;
  for (const m of policeMeshes) m.visible = false;
  for (const t of traffic) scene.remove(t.mesh);
  coinMeshes.forEach((m) => scene.remove(m));
  coinMeshes.clear();
  state = newState(findSpawn(district));
}

window.addEventListener('keydown', (e) => {
  const controlKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'];
  if (controlKeys.includes(e.key)) {
    e.preventDefault();
    keys.add(e.key);
  }
  if (e.key === 'r' || e.key === 'R') restart();
});
window.addEventListener('keyup', (e) => keys.delete(e.key));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resize);

document.querySelectorAll('[data-key]').forEach((btn) => {
  const key = btn.dataset.key;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    keys.add(key);
  });
  const off = () => keys.delete(key);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
});

// ---------- Start ----------
resize();
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});

loadDistrict()
  .then(({ district: d, source }) => {
    district = d;
    district.source = source;
    buildDistrict(scene, district);
    state = newState(findSpawn(district));
    if (source === 'sample') {
      el.source.hidden = false;
    }
  })
  .catch((err) => {
    console.error(err);
    el.message.textContent = 'Nepodařilo se načíst mapu.';
  });

// Pro testy a ladění
window.__praha = {
  get state() {
    return state;
  },
  get district() {
    return district;
  },
};
