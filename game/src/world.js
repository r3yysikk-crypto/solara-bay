// Solara Bay, the city: a sunny coastal grid of roads, stucco and glass
// buildings, sidewalks, palm trees and a beach that drops into the bay. The
// module also owns the road network the traffic and the police drive on, and
// the building footprints every car and pedestrian collides with.
import { BUILDING_PALETTE, CITY, COLOURS } from './config.js';

function makeWindowTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 120; y += 14) {
    for (let x = 6; x < 58; x += 14) {
      ctx.fillStyle = random.chance(0.4) ? '#2c4a66' : '#9fc6e8';
      ctx.fillRect(x, y, 9, 9);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#f5d76e';
  ctx.fillRect(62, 0, 4, 40);
  ctx.fillRect(62, 88, 4, 40);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(4, 0, 3, 128);
  ctx.fillRect(121, 0, 3, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Road centrelines, one per grid line, in both directions. A road is the
// stretch of asphalt between two neighbouring intersections.
export function roadCentrelines() {
  const lines = [];
  const half = CITY.half;
  const pitch = CITY.blockSize + CITY.roadWidth;
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = -half + CITY.roadWidth / 2 + i * pitch;
    lines.push({ axis: 'x', at: c, from: -half, to: half });
    lines.push({ axis: 'z', at: c, from: -half, to: half });
  }
  return lines;
}

export function createWorld(random) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOURS.sky);
  scene.fog = new THREE.Fog(COLOURS.fog, 260, 620);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a9a6a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLOURS.sun, 1.7);
  sun.position.set(120, 180, 60);
  scene.add(sun);

  // Grass ground under the whole city, sand and water past the south edge.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.span + 400, CITY.span + 400),
    new THREE.MeshLambertMaterial({ color: COLOURS.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  scene.add(ground);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.span + 400, CITY.beachDepth),
    new THREE.MeshLambertMaterial({ color: COLOURS.sand }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0, CITY.half + CITY.beachDepth / 2);
  scene.add(beach);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.span + 400, CITY.waterDepth),
    new THREE.MeshLambertMaterial({ color: COLOURS.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, CITY.half + CITY.beachDepth + CITY.waterDepth / 2);
  scene.add(water);

  // Roads: one long plane per centreline, with a dashed centre line texture.
  const roadTexture = makeRoadTexture();
  const colliders = [];
  for (const line of roadCentrelines()) {
    const length = line.to - line.from;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.roadWidth, length),
      new THREE.MeshLambertMaterial({ map: roadTexture }),
    );
    plane.rotation.x = -Math.PI / 2;
    if (line.axis === 'x') plane.rotation.z = Math.PI / 2;
    plane.position.set(
      line.axis === 'z' ? line.at : 0,
      0.02,
      line.axis === 'x' ? line.at : 0,
    );
    const repeats = Math.max(1, Math.round(length / CITY.roadWidth));
    roadTexture.repeat.set(1, repeats);
    // Each road gets its own texture clone so the repeat does not leak.
    plane.material = new THREE.MeshLambertMaterial({ map: roadTexture.clone() });
    plane.material.map.repeat.set(1, repeats);
    plane.material.map.needsUpdate = true;
    scene.add(plane);
  }

  // Buildings: one or two per block, pushed back from the road by the sidewalk.
  const windowTexture = makeWindowTexture(random);
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const pitch = CITY.blockSize + CITY.roadWidth;
  for (let bx = 0; bx < CITY.blocks; bx++) {
    for (let bz = 0; bz < CITY.blocks; bz++) {
      const blockX = -CITY.half + CITY.roadWidth + bx * pitch;
      const blockZ = -CITY.half + CITY.roadWidth + bz * pitch;
      const towers = random.chance(0.35) ? 2 : 1;
      for (let t = 0; t < towers; t++) {
        const w = random.range(16, 30);
        const d = random.range(16, 30);
        const h = random.range(10, towers === 2 ? 55 : 34);
        const cx = blockX + (towers === 2 ? (t === 0 ? 14 : CITY.blockSize - 14) : CITY.blockSize / 2);
        const cz = blockZ + (towers === 2 ? CITY.blockSize / 2 : CITY.blockSize / 2);
        const colour = random.pick(BUILDING_PALETTE);
        const mats = [
          new THREE.MeshLambertMaterial({ map: windowTexture, color: colour }),
          new THREE.MeshLambertMaterial({ map: windowTexture, color: colour }),
          new THREE.MeshLambertMaterial({ color: 0xc98f5f }),
          new THREE.MeshLambertMaterial({ color: 0x8a7a66 }),
          new THREE.MeshLambertMaterial({ map: windowTexture, color: colour }),
          new THREE.MeshLambertMaterial({ map: windowTexture, color: colour }),
        ];
        const tower = new THREE.Mesh(buildingGeo, mats);
        tower.scale.set(w, h, d);
        tower.position.set(cx, h / 2, cz);
        scene.add(tower);
        // A slightly larger flat roof cap, terracotta like the old town.
        const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0xb0703f }));
        roof.scale.set(w + 1, 1.2, d + 1);
        roof.position.set(cx, h + 0.6, cz);
        scene.add(roof);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      }
      // Sidewalk slabs frame each block.
      const walk = new THREE.Mesh(
        new THREE.BoxGeometry(CITY.blockSize, 0.24, CITY.blockSize),
        new THREE.MeshLambertMaterial({ color: COLOURS.sidewalk }),
      );
      walk.position.set(blockX + CITY.blockSize / 2, 0.1, blockZ + CITY.blockSize / 2);
      scene.add(walk);
    }
  }

  // Palm trees along the beachfront and a few on the avenues.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  const crownGeo = new THREE.ConeGeometry(2.6, 3.4, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  for (let i = 0; i < 26; i++) {
    const x = random.range(-CITY.half, CITY.half);
    const z = random.chance(0.6)
      ? CITY.half + random.range(4, CITY.beachDepth - 6)
      : random.pick(roadCentrelines().filter((l) => l.axis === 'x')).at + random.range(-30, 30);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 3.5, z);
    scene.add(trunk);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(x, 8.2, z);
    scene.add(crown);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }

  // The pier reaching into the bay, a Solara Bay landmark.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.8, 60),
    new THREE.MeshLambertMaterial({ color: 0x9a7b52 }),
  );
  pier.position.set(0, 0.4, CITY.half + CITY.beachDepth + 28);
  scene.add(pier);

  function clampToCity(x, z, margin) {
    const limit = CITY.half + CITY.beachDepth - margin;
    return {
      x: Math.max(-CITY.half + margin, Math.min(CITY.half - margin, x)),
      z: Math.max(-CITY.half + margin, Math.min(limit, z)),
    };
  }

  // Push a circle (a car or a walker) out of every building it overlaps.
  // Returns true when a push happened, and the push vector in out.
  function resolveCircleCollision(x, z, radius, out) {
    let hit = false;
    for (const box of colliders) {
      const cx = Math.max(box.minX, Math.min(x, box.maxX));
      const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      hit = true;
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        out.x += (dx / dist) * push;
        out.z += (dz / dist) * push;
      } else {
        out.x += radius;
      }
    }
    return hit;
  }

  function randomRoadPoint() {
    const line = random.pick(roadCentrelines());
    const along = random.range(line.from + 12, line.to - 12);
    const lane = random.pick([-3.4, 3.4]);
    return line.axis === 'x'
      ? { x: along, z: line.at + lane, heading: lane > 0 ? 0 : Math.PI }
      : { x: line.at + lane, z: along, heading: lane > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }

  function nearestRoadPoint(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const line of roadCentrelines()) {
      if (line.axis === 'x') {
        const d = Math.abs(z - line.at);
        if (d < bestDist) {
          bestDist = d;
          best = { x, z: line.at, axis: 'x' };
        }
      } else {
        const d = Math.abs(x - line.at);
        if (d < bestDist) {
          bestDist = d;
          best = { x: line.at, z, axis: 'z' };
        }
      }
    }
    return best;
  }

  return {
    scene,
    colliders,
    clampToCity,
    resolveCircleCollision,
    randomRoadPoint,
    nearestRoadPoint,
    roadCentrelines,
  };
}
