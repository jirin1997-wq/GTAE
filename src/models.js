// Načtení 3D modelu auta (GLB, komprese Draco) z assets/models.
// Model se zploští do jediné sítě (podle materiálu), aby šlo vykreslit desítky aut rychle.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Sloučí všechny meshe modelu do jedné sítě s více materiály (jeden materiál = jedno vykreslení). */
export function flattenModel(root, exclude = []) {
  root.updateMatrixWorld(true);
  const byMaterial = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (exclude.includes(o.name)) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const flat = g.index ? g.toNonIndexed() : g;
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    byMaterial.get(mat).push(flat);
  });

  const materials = [];
  const parts = [];
  for (const [mat, list] of byMaterial) {
    const merged = mergeGeometries(list, false);
    merged.clearGroups();
    merged.addGroup(0, merged.attributes.position.count, materials.length);
    materials.push(mat);
    parts.push(merged);
  }
  const geometry = mergeGeometries(parts, true);
  return new THREE.Mesh(geometry, materials);
}

/**
 * Vrátí Mesh s modelem auta: délka ~targetLength metrů (osa -z = směr jízdy),
 * spodní hrana na y=0, střed v počátku. Další auta vznikají jako sdílené kopie.
 */
export async function loadCarModel(url, { targetLength = 4.6, frontIsPlusZ = false, exclude = [] } = {}) {
  const draco = new DRACOLoader();
  draco.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);

  const mesh = flattenModel(gltf.scene, exclude);
  const probe = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  if (probe.x > probe.z) mesh.rotation.y = Math.PI / 2;
  // Většina GLB modelů má přední část na +z; hra počítá s přední částí na -z.
  if (frontIsPlusZ) mesh.rotation.y += Math.PI;

  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  mesh.scale.setScalar(targetLength / Math.max(size.x, size.z));

  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  mesh.position.set(-center.x, -box.min.y, -center.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
