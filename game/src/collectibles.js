// Hidden packages: ten glowing crates stashed around Solara Bay — on the
// pier, on the beach, in the alleys and on the rooftops' doorsteps. Each
// one found is cash in hand, and the count lives in the save.
import { CITY, COLLECTIBLES } from './config.js';

// Hand-placed so a player can actually find them: landmarks, not random.
const SPOTS = [
  { x: 0, z: CITY.half + CITY.beachDepth + 52, label: 'the end of the pier' },
  { x: -140, z: CITY.half + 20, label: 'the west beach' },
  { x: 150, z: CITY.half + 24, label: 'the east beach' },
  { x: -120, z: -120, label: 'the north-west corner' },
  { x: 130, z: -130, label: 'the north-east corner' },
  { x: -60, z: 60, label: 'the market alley' },
  { x: 60, z: -60, label: 'the old garage lane' },
  { x: -180, z: 40, label: 'the west marina' },
  { x: 180, z: -40, label: 'the east depot' },
  { x: 20, z: -160, label: 'the north park' },
];

export function createCollectibles(world) {
  const items = SPOTS.map((spot, i) => {
    const group = new THREE.Group();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa7a00, emissiveIntensity: 0.8 }),
    );
    crate.position.y = 0.9;
    group.add(crate);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42),
      new THREE.MeshLambertMaterial({ color: 0x7dff9b, emissive: 0x2fae6e, emissiveIntensity: 0.9 }),
    );
    gem.position.y = 1.9;
    group.add(gem);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.25, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    group.position.set(spot.x, 0, spot.z);
    world.scene.add(group);
    return { index: i, x: spot.x, z: spot.z, label: spot.label, group, gem, found: false };
  });

  function update(dt, time, playerPos, onPickup) {
    for (const item of items) {
      if (item.found) continue;
      item.gem.rotation.y += dt * 2.4;
      item.gem.position.y = 1.9 + Math.sin(time * 2 + item.index) * 0.18;
      const d = Math.hypot(playerPos.x - item.x, playerPos.z - item.z);
      if (d < COLLECTIBLES.pickupRadius && onPickup) onPickup(item);
    }
  }

  function markFound(index) {
    const item = items[index];
    if (!item || item.found) return;
    item.found = true;
    world.scene.remove(item.group);
  }

  // Fresh career: every package is back on the street.
  function reset() {
    for (const item of items) {
      if (item.found) {
        item.found = false;
        world.scene.add(item.group);
      }
    }
  }

  function foundCount() {
    return items.filter((i) => i.found).length;
  }

  return { items, update, markFound, reset, foundCount, total: SPOTS.length };
}
