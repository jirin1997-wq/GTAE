// Vykreslení reálných dat okolí do Three.js scény.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Textura fasády: mřížka oken. Jedna dlaždice ~ 6 m. */
export function makeFacadeTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#e6e0d6';
  g.fillRect(0, 0, size, size);
  const cols = 4;
  const rows = 4;
  const cw = size / cols;
  const ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (r * 7 + c * 3) % 5 === 0;
      g.fillStyle = lit ? '#ffd9a0' : '#3b4a5c';
      g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.2, cw * 0.56, ch * 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 6, 1 / 6);
  tex.anisotropy = 8;
  return tex;
}

/** Plochá stuha podél lomené čáry (silnice, řeka). */
export function ribbonGeometry(points, width, y = 0.02) {
  const positions = [];
  const indices = [];
  const half = width / 2;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    // Směr v bodě = průměr sousedních segmentů
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // kolmice v rovině xz
    const nx = -dz * half;
    const nz = dx * half;
    positions.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    // Pořadí vrcholů tak, aby normála mířila nahoru (jinak by byl pás odvrácen od kamery)
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // stejné atributy jako ShapeGeometry (jinak mergeGeometries vrátí null)
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Postaví budovy (sloučené do jedné sítě), silnice, řeku a vodu.
 * Vrací skupinu se všemi meshi.
 */
export function buildDistrict(scene, district) {
  const group = new THREE.Group();
  group.name = 'district';

  // Budovy: extruze polygonu, sloučení do jedné geometrie.
  const facade = makeFacadeTexture();
  const buildingGeoms = district.buildings.map((b) => {
    // Tvar v rovině (x, -z) a extruze do výšky; rotace -90° ji postaví do světa.
    const shape = new THREE.Shape(b.ring.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geom = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    // UV v metrech, aby okna seděla na každé budově stejně
    const uv = geom.attributes.uv;
    const pos = geom.attributes.position;
    // u svislých stěn je vodorovná souřadnice x+z, svislá je výška y
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, pos.getX(i) + pos.getZ(i), pos.getY(i));
    }
    return geom;
  });
  if (buildingGeoms.length) {
    const merged = mergeGeometries(buildingGeoms, false);
    merged.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map: facade,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Silnice
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.92 });
  const roadGeoms = district.roads.map((r) => ribbonGeometry(r.points, r.width, 0.04));
  if (roadGeoms.length) {
    const mesh = new THREE.Mesh(mergeGeometries(roadGeoms, false), roadMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Vodní plochy (polygony) a řeky (čáry)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2f6f94,
    roughness: 0.15,
    metalness: 0.1,
  });
  const waterGeoms = [];
  for (const w of district.water) {
    const shape = new THREE.Shape(w.ring.map((p) => new THREE.Vector2(p.x, -p.z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    waterGeoms.push(g);
  }
  for (const w of district.waterways) {
    waterGeoms.push(ribbonGeometry(w.points, w.width, 0.01));
  }
  const waterMerged = waterGeoms.length ? mergeGeometries(waterGeoms, false) : null;
  if (waterMerged) {
    const mesh = new THREE.Mesh(waterMerged, waterMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Zem
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(district.radius * 4, district.radius * 4),
    new THREE.MeshStandardMaterial({ color: 0x6b6f6a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  group.add(ground);

  scene.add(group);
  return group;
}
