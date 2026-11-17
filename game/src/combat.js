// Combat: fists and a pistol on foot, the Bay Rats who shoot back, and
// the police opening fire from wanted level 2 up. Hits are tested with a
// ray against spheres (cars, people), so no physics engine is needed.
import { COMBAT, POLICE, WANTED } from './config.js';

function makeHostileMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.82, 0.3), new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
  legs.position.y = 0.41;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.34), shirt);
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.68;
  group.add(head);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  band.position.y = 1.86;
  group.add(band);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.4), new THREE.MeshLambertMaterial({ color: 0x1a1c20 }));
  gun.position.set(0.32, 1.05, 0.2);
  group.add(gun);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);
  return group;
}

// Ray against a sphere: returns the distance along the ray, or Infinity.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const t = lx * dx + ly * dy + lz * dz;
  if (t < 0) return Infinity;
  const px = ox + dx * t;
  const py = oy + dy * t;
  const pz = oz + dz * t;
  const dist = Math.hypot(cx - px, cy - py, cz - pz);
  return dist <= radius ? t : Infinity;
}

export function createCombat(ctx) {
  const { world, player, traffic, police, wanted, particles, audio, hud, camera } = ctx;
  const scene = world.scene;
  let weapon = 'fists';
  let ammo = COMBAT.pistolAmmo;
  let reloadTimer = 0;
  const hostiles = [];

  // One reusable flash light at the muzzle, and a pool of tracer streaks.
  const flash = new THREE.PointLight(0xffc860, 0, 14);
  scene.add(flash);
  let flashTimer = 0;
  const tracers = [];
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, timer: 0 });
  }
  let tracerCursor = 0;

  function spawnTracer(from, to) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    const dx = to.x - from.x;
    const dy = (to.y ?? 1) - (from.y ?? 1);
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    t.mesh.position.set((from.x + to.x) / 2, ((from.y ?? 1) + (to.y ?? 1)) / 2, (from.z + to.z) / 2);
    t.mesh.lookAt(to.x, to.y ?? 1, to.z);
    t.mesh.scale.set(1, 1, len);
    t.mesh.visible = true;
    t.timer = 0.09;
  }

  function muzzleAt(x, y, z) {
    flash.position.set(x, y, z);
    flash.intensity = 3.2;
    flashTimer = 0.07;
    particles.muzzle(x, y, z);
  }

  function switchWeapon() {
    if (player.state.inCar) return;
    weapon = weapon === 'fists' ? 'pistol' : 'fists';
    player.setArmed(weapon === 'pistol');
    hud.setWeapon(weapon, ammo);
    audio.click();
  }

  function reload() {
    if (weapon !== 'pistol' || reloadTimer > 0 || ammo === COMBAT.pistolAmmo) return;
    reloadTimer = COMBAT.reloadSeconds;
    audio.reload();
    hud.showMessage('Reloading…', 1.2);
  }

  function tryShoot() {
    if (player.state.inCar || weapon !== 'pistol') return;
    if (reloadTimer > 0) return;
    if (ammo <= 0) {
      audio.click();
      hud.showMessage('Out of ammo — press R to reload', 1.5);
      reload();
      return;
    }
    ammo -= 1;
    ctx.onShotFired?.();
    const origin = { x: player.state.x, y: 1.55, z: player.state.z };
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const from = { x: origin.x + dir.x * 0.6, y: 1.25, z: origin.z + dir.z * 0.6 };
    muzzleAt(from.x, from.y, from.z);
    audio.shoot();

    // Find the closest thing the shot hits: cruisers, traffic, people.
    let bestT = COMBAT.pistolRange;
    let best = null;
    for (const unit of police.units) {
      const v = unit.vehicle.state;
      const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, v.x, 1, v.z, 2.4);
      if (t < bestT) {
        bestT = t;
        best = { kind: 'police', unit };
      }
    }
    for (const car of traffic.cars) {
      const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, car.mesh.position.x, 1, car.mesh.position.z, 2.4);
      if (t < bestT) {
        bestT = t;
        best = { kind: 'traffic', car };
      }
    }
    for (const ped of traffic.pedestrians) {
      if (ped.down) continue;
      const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, ped.x, 1, ped.z, 0.9);
      if (t < bestT) {
        bestT = t;
        best = { kind: 'ped', ped };
      }
    }
    for (const hostile of hostiles) {
      if (!hostile.alive) continue;
      const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, hostile.x, 1.2, hostile.z, 0.9);
      if (t < bestT) {
        bestT = t;
        best = { kind: 'hostile', hostile };
      }
    }

    const end = {
      x: origin.x + dir.x * bestT,
      y: origin.y + dir.y * bestT,
      z: origin.z + dir.z * bestT,
    };
    spawnTracer(from, end);
    if (!best) {
      hud.setWeapon(weapon, ammo);
      return;
    }
    hud.showHitmarker();
    ctx.onShotHit?.();
    if (best.kind === 'police') {
      const disabled = police.damageUnit(best.unit, COMBAT.pistolDamage);
      hud.showDamage(best.unit.vehicle.state, camera, `-${COMBAT.pistolDamage}`);
      particles.smoke(best.unit.vehicle.state.x, best.unit.vehicle.state.z);
      if (disabled) {
        wanted.addHeat(15, 'disabledCruiser');
        hud.showMessage('Cruiser disabled! The department is furious.', 3);
      }
    } else if (best.kind === 'traffic') {
      best.car.health = (best.car.health ?? 60) - COMBAT.pistolDamage;
      hud.showDamage(best.car.mesh.position, camera, `-${COMBAT.pistolDamage}`);
      if (best.car.health <= 0) {
        best.car.stun(999);
        particles.smoke(best.car.mesh.position.x, best.car.mesh.position.z);
      }
    } else if (best.kind === 'ped') {
      best.ped.down = true;
      best.ped.downTimer = 6;
      best.ped.mesh.rotation.z = Math.PI / 2;
      best.ped.mesh.position.y = 0.3;
      wanted.addHeat(WANTED.hitPedestrian, 'pedestrian');
      hud.showMessage('You shot a pedestrian! Witnesses called it in.', 3);
    } else if (best.kind === 'hostile') {
      best.hostile.health -= COMBAT.pistolDamage;
      hud.showDamage({ x: best.hostile.x, z: best.hostile.z }, camera, `-${COMBAT.pistolDamage}`);
      if (best.hostile.health <= 0) killHostile(best.hostile);
    }
    hud.setWeapon(weapon, ammo);
  }

  function tryMelee() {
    if (player.state.inCar) return;
    player.punch();
    audio.punch();
    const px = player.state.x;
    const pz = player.state.z;
    const heading = player.state.heading;
    let hitAny = false;
    const inArc = (x, z) => {
      const dx = x - px;
      const dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d > COMBAT.meleeRange) return false;
      const ang = Math.atan2(dx, dz);
      let diff = ang - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return Math.abs(diff) < COMBAT.meleeArc;
    };
    for (const ped of traffic.pedestrians) {
      if (ped.down || !inArc(ped.x, ped.z)) continue;
      ped.down = true;
      ped.downTimer = 6;
      ped.mesh.rotation.z = Math.PI / 2;
      ped.mesh.position.y = 0.3;
      wanted.addHeat(WANTED.hitPedestrian, 'pedestrian');
      hud.showMessage('You knocked a pedestrian down!', 2.5);
      hitAny = true;
    }
    for (const hostile of hostiles) {
      if (!hostile.alive || !inArc(hostile.x, hostile.z)) continue;
      hostile.health -= COMBAT.meleeDamage;
      hud.showDamage({ x: hostile.x, z: hostile.z }, camera, `-${COMBAT.meleeDamage}`);
      if (hostile.health <= 0) killHostile(hostile);
      hitAny = true;
    }
    if (hitAny) hud.showHitmarker();
  }

  function killHostile(hostile) {
    hostile.alive = false;
    hostile.mesh.rotation.z = Math.PI / 2;
    hostile.mesh.position.y = 0.3;
    particles.sparkle(hostile.x, hostile.z);
    ctx.onHostileDown?.(hostile);
  }

  function spawnHostiles(spots) {
    for (const spot of spots) {
      const mesh = makeHostileMesh();
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      hostiles.push({
        mesh,
        x: spot.x,
        z: spot.z,
        heading: 0,
        health: COMBAT.hostileHealth,
        shootCooldown: 1 + Math.random(),
        alive: true,
      });
    }
  }

  function clearHostiles() {
    for (const hostile of [...hostiles]) {
      scene.remove(hostile.mesh);
      hostiles.splice(hostiles.indexOf(hostile), 1);
    }
  }

  // A police unit opens fire: tracer, bang, and a hit chance that falls
  // off with distance. The damage itself goes through the main loop.
  function policeShot(unit) {
    const v = unit.vehicle.state;
    const target = player.state.inCar
      ? { x: player.state.inCar.state.x, y: 1, z: player.state.inCar.state.z }
      : { x: player.state.x, y: 1.3, z: player.state.z };
    const from = { x: v.x, y: 1.3, z: v.z };
    muzzleAt(from.x, from.y, from.z);
    audio.shotFar();
    const dist = Math.hypot(target.x - v.x, target.z - v.z);
    const chance = POLICE.shootHitChance * Math.max(0.25, 1 - dist / (POLICE.shootRange * 1.6));
    if (Math.random() < chance) {
      spawnTracer(from, target);
      ctx.onPlayerShot?.(POLICE.shootDamage);
    } else {
      // A miss still kicks up dust near the player.
      spawnTracer(from, { x: target.x + (Math.random() - 0.5) * 4, y: 0.3, z: target.z + (Math.random() - 0.5) * 4 });
      particles.dust(target.x + (Math.random() - 0.5) * 3, target.z + (Math.random() - 0.5) * 3);
    }
  }

  function update(dt) {
    if (reloadTimer > 0) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        ammo = COMBAT.pistolAmmo;
        hud.setWeapon(weapon, ammo);
        hud.showMessage('Reloaded', 1);
      }
    }
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) flash.intensity = 0;
    }
    for (const t of tracers) {
      if (t.timer > 0) {
        t.timer -= dt;
        if (t.timer <= 0) t.mesh.visible = false;
      }
    }
    // Bay Rats: close in on foot, shoot when in range.
    for (const hostile of hostiles) {
      if (!hostile.alive) continue;
      const dx = player.state.x - hostile.x;
      const dz = player.state.z - hostile.z;
      const dist = Math.hypot(dx, dz);
      hostile.heading = Math.atan2(dx, dz);
      hostile.mesh.rotation.y = hostile.heading;
      if (dist > 14 && !player.state.inCar) {
        hostile.x += (dx / dist) * 4.5 * dt;
        hostile.z += (dz / dist) * 4.5 * dt;
        hostile.mesh.position.set(hostile.x, Math.abs(Math.sin(performance.now() / 130)) * 0.06, hostile.z);
      } else {
        hostile.mesh.position.set(hostile.x, 0, hostile.z);
      }
      hostile.shootCooldown -= dt;
      if (!player.state.inCar && dist < COMBAT.hostileShootRange && hostile.shootCooldown <= 0) {
        hostile.shootCooldown = 1.8 + Math.random() * 0.8;
        const from = { x: hostile.x, y: 1.3, z: hostile.z };
        const target = { x: player.state.x, y: 1.3, z: player.state.z };
        muzzleAt(from.x, from.y, from.z);
        audio.shotFar();
        if (Math.random() < 0.42) {
          spawnTracer(from, target);
          ctx.onPlayerShot?.(COMBAT.hostileShootDamage);
        } else {
          spawnTracer(from, { x: target.x + (Math.random() - 0.5) * 4, y: 0.3, z: target.z + (Math.random() - 0.5) * 4 });
        }
      }
    }
  }

  function reset() {
    weapon = 'fists';
    ammo = COMBAT.pistolAmmo;
    reloadTimer = 0;
    player.setArmed(false);
    clearHostiles();
    hud.setWeapon(weapon, ammo);
  }

  return {
    get weapon() {
      return weapon;
    },
    get ammo() {
      return ammo;
    },
    switchWeapon,
    reload,
    tryShoot,
    tryMelee,
    spawnHostiles,
    clearHostiles,
    policeShot,
    hostiles,
    update,
    reset,
  };
}
