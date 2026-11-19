// Převod reálných geodat (GeoJSON z OpenStreetMap) do lokálních metrů.
// Osa x = východ, osa z = jih (sever je -z, takže dopředu při yaw 0 jede auto na sever).

// Střed Staroměstského náměstí – výchozí bod světa.
export const ORIGIN = { lon: 14.4208, lat: 50.0875 };

const M_PER_DEG_LAT = 110574;

export function project(lon, lat, origin = ORIGIN) {
  const mPerDegLon = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (lon - origin.lon) * mPerDegLon,
    z: -(lat - origin.lat) * M_PER_DEG_LAT,
  };
}

/** Převede kruh [[lon,lat],...] na lokální body a odstraní uzavírací bod. */
export function ringToLocal(coords, origin = ORIGIN) {
  const pts = coords.map(([lon, lat]) => project(lon, lat, origin));
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (a.x === b.x && a.z === b.z) pts.pop();
  }
  return pts;
}

/** Ray-casting: leží bod uvnitř polygonu (pole {x,z})? */
export function isPointInPolygon(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const crosses = a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Nejmenší vzdálenost bodu od lomené čáry. */
export function distanceToPolyline(p, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    let t = len2 === 0 ? 0 : ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2;
    t = Math.max(0, Math.min(1, t));
    const dx = a.x + vx * t - p.x;
    const dz = a.z + vz * t - p.z;
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

/** Výška budovy v metrech z OSM tagů. */
export function buildingHeight(tags = {}) {
  const h = parseFloat(String(tags.height ?? '').replace(/[^\d.]/g, ''));
  if (Number.isFinite(h) && h > 0) return h;
  const levels = parseFloat(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0) return levels * 3.2 + 2;
  return 12;
}

/** Šířka silnice v metrech podle OSM kategorie highway. */
export function roadWidth(highway = '') {
  const widths = {
    motorway: 16,
    trunk: 14,
    primary: 12,
    secondary: 10,
    tertiary: 8,
    residential: 6,
    unclassified: 6,
    living_street: 5,
    service: 4,
    pedestrian: 5,
    footway: 2.5,
    path: 2,
    cycleway: 2.5,
    steps: 2,
  };
  return widths[highway] ?? 6;
}

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function withinRadius(points, radius) {
  return points.some((p) => Math.hypot(p.x, p.z) <= radius);
}

/**
 * Z GeoJSON FeatureCollection vybere budovy, silnice, vodu a mosty
 * v kruhu o poloměru `radius` kolem `origin`.
 */
export function parseDistrict(geojson, { origin = ORIGIN, radius = 900 } = {}) {
  const district = { origin, radius, buildings: [], roads: [], water: [], waterways: [] };

  for (const f of geojson.features ?? []) {
    const tags = f.properties ?? {};
    const g = f.geometry;
    if (!g) continue;

    if (tags.building && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
      for (const poly of polygonsOf(g)) {
        const ring = ringToLocal(poly[0], origin);
        if (ring.length < 3 || !withinRadius(ring, radius)) continue;
        district.buildings.push({ ring, height: buildingHeight(tags) });
      }
    } else if (tags.highway && g.type === 'LineString') {
      const points = ringToLocal(g.coordinates, origin);
      if (points.length >= 2 && distanceToPolyline({ x: 0, z: 0 }, points) <= radius) {
        district.roads.push({ points, width: roadWidth(tags.highway), highway: tags.highway });
      }
    } else if ((tags.natural === 'water' || tags.water) && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
      for (const poly of polygonsOf(g)) {
        const ring = ringToLocal(poly[0], origin);
        if (ring.length >= 3 && withinRadius(ring, radius)) district.water.push({ ring });
      }
    } else if (tags.waterway && g.type === 'LineString') {
      const points = ringToLocal(g.coordinates, origin);
      const width = tags.waterway === 'river' ? 60 : 8;
      if (points.length >= 2 && distanceToPolyline({ x: 0, z: 0 }, points) <= radius) {
        district.waterways.push({ points, width });
      }
    }
  }
  return district;
}

/**
 * Je bod v řece a zároveň mimo silnici/most? Auto tam nesmí.
 */
export function isBlockedByWater(p, district, margin = 0) {
  const inWater =
    district.water.some((w) => isPointInPolygon(p, w.ring)) ||
    district.waterways.some((w) => distanceToPolyline(p, w.points) < w.width / 2 + margin);
  if (!inWater) return false;
  const onRoad = district.roads.some((r) => distanceToPolyline(p, r.points) < r.width / 2);
  return !onRoad;
}

/** Je bod (s okrajem margin) uvnitř některé budovy? */
export function isBlockedByBuilding(p, district, margin = 0) {
  const probes = [
    p,
    { x: p.x + margin, z: p.z },
    { x: p.x - margin, z: p.z },
    { x: p.x, z: p.z + margin },
    { x: p.x, z: p.z - margin },
  ];
  return district.buildings.some((b) => probes.some((q) => isPointInPolygon(q, b.ring)));
}

/**
 * Startovní bod auta: nejbližší bod na hlavní silnici od počátku,
 * který není uvnitř budovy ani nad vodou. Body se vzorkují podél silnic.
 */
export function findSpawn(district, step = 5, clearance = 4) {
  let best = null;
  for (const r of district.roads) {
    if (r.width < 6) continue;
    const total = roadLength(r.points);
    for (let s = 0; s <= total; s += step) {
      const p = pointAlongPolyline(r.points, s);
      const d = Math.hypot(p.x, p.z);
      if (best && d >= best.d) continue;
      if (isBlockedByBuilding(p, district, clearance)) continue;
      if (isBlockedByWater(p, district, clearance)) continue;
      // Start raději na suchu: ani most přes řeku není vhodný
      const overWater =
        district.water.some((w) => isPointInPolygon(p, w.ring)) ||
        district.waterways.some((w) => distanceToPolyline(p, w.points) < w.width / 2 + clearance);
      if (overWater) continue;
      best = { x: p.x, z: p.z, d };
    }
  }
  return best ? { x: best.x, z: best.z } : { x: 0, z: 0 };
}

/** Bod a směr ve vzdálenosti s (metrů) podél lomené čáry; smyčka se opakuje. */
export function pointAlongPolyline(points, s) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len === 0) continue;
    segs.push({ a, b, len, start: total });
    total += len;
  }
  if (total === 0) return { x: points[0].x, z: points[0].z, yaw: 0, length: 0 };
  let d = ((s % total) + total) % total;
  for (const seg of segs) {
    if (d <= seg.start + seg.len) {
      const t = (d - seg.start) / seg.len;
      const dx = seg.b.x - seg.a.x;
      const dz = seg.b.z - seg.a.z;
      return {
        x: seg.a.x + dx * t,
        z: seg.a.z + dz * t,
        yaw: Math.atan2(-dx, -dz), // stejná konvence jako u auta
        length: total,
      };
    }
  }
  const last = segs[segs.length - 1];
  return { x: last.b.x, z: last.b.z, yaw: 0, length: total };
}

/** Náhodné body na silnicích (mince). Deterministické díky seedu. */
export function pickupsOnRoads(district, count, rand) {
  const roads = district.roads.filter((r) => r.width >= 5);
  const pickups = [];
  if (roads.length === 0) return pickups;
  for (let i = 0; i < count; i++) {
    const road = roads[Math.floor(rand() * roads.length)];
    const pos = pointAlongPolyline(road.points, rand() * roadLength(road.points));
    pickups.push({ x: pos.x, z: pos.z, taken: false });
  }
  return pickups;
}

export function roadLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return total;
}
