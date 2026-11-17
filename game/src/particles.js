// Particles: one pooled THREE.Points cloud for dust, smoke, sparks and
// muzzle flashes. Spawning only writes into the pool — no new objects per
// frame — so the effects cost almost nothing.
export function createParticles(scene) {
  const MAX = 420;
  const positions = new Float32Array(MAX * 3);
  const colours = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.55,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({ life: 0, maxLife: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
    positions[i * 3 + 1] = -99;
  }
  let cursor = 0;

  function spawnOne(x, y, z, vx, vy, vz, life, r, g, b) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.r = r;
    p.g = g;
    p.b = b;
  }

  function burst(x, y, z, count, opts) {
    const speed = opts.speed ?? 4;
    const up = opts.up ?? 2;
    const life = opts.life ?? 0.7;
    const colour = opts.colour ?? [1, 0.85, 0.4];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      spawnOne(
        x, y, z,
        Math.cos(a) * s, up * (0.3 + Math.random() * 0.9), Math.sin(a) * s,
        life * (0.6 + Math.random() * 0.7),
        colour[0], colour[1], colour[2],
      );
    }
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= (p.vy > 0 ? 2 : 0) * dt;
      if (p.y < 0.05) p.y = 0.05;
      const fade = Math.max(0, p.life / p.maxLife);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.life > 0 ? p.y : -99;
      positions[i * 3 + 2] = p.z;
      colours[i * 3] = p.r * fade;
      colours[i * 3 + 1] = p.g * fade;
      colours[i * 3 + 2] = p.b * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return {
    burst,
    // Drift dust kicked up behind the rear wheels.
    dust(x, z) {
      burst(x, 0.3, z, 3, { speed: 1.6, up: 0.8, life: 0.55, colour: [0.72, 0.66, 0.55] });
    },
    // Grey smoke from a wrecked or shot-up car.
    smoke(x, z) {
      burst(x, 1.1, z, 2, { speed: 0.7, up: 2.4, life: 1.1, colour: [0.32, 0.32, 0.34] });
    },
    // Gold sparkle when something good is picked up.
    sparkle(x, z) {
      burst(x, 1, z, 16, { speed: 2.6, up: 3.2, life: 0.8, colour: [1, 0.85, 0.3] });
    },
    // Bright flash at a gun barrel.
    muzzle(x, y, z) {
      burst(x, y, z, 6, { speed: 5, up: 0.4, life: 0.12, colour: [1, 0.8, 0.35] });
    },
    update,
  };
}
