// The Solara Bay Police Department: patrol sedans and faster interceptors
// that hunt the player while the wanted level is up. They steer toward the
// player with the same arcade car physics, ram to slow them down, and at
// wanted level 3 they throw a roadblock across the road ahead. They are
// fair: a unit that gets stuck reverses out, and one left far behind gives up.
import { POLICE } from './config.js';
import { createCarMesh, createVehicle } from './vehicles.js';

export function createPolice(world, random) {
  const units = [];
  let roadblock = null;
  let roadblockTimer = 0;

  function spawnUnit(kind, near) {
    return spawnUnitAt(
      kind,
      near.x + random.range(-30, 30),
      near.z + random.range(-30, 30),
      random.range(0, Math.PI * 2),
    );
  }

  // Place a unit exactly where the staging or a mission wants it.
  function spawnUnitAt(kind, x, z, heading) {
    const spec = kind === 'interceptor' ? POLICE.interceptor : POLICE.patrol;
    const lightBar = new THREE.MeshLambertMaterial({
      color: 0x2266ff,
      emissive: 0x2244ff,
      emissiveIntensity: 0.9,
    });
    const mesh = createCarMesh(spec.colour, { lightBar, stripe: spec.livery });
    world.scene.add(mesh);
    const vehicle = createVehicle(mesh, { x, z, heading });
    vehicle.state.maxSpeed = spec.maxSpeed;
    vehicle.state.accel = spec.accel;
    const unit = {
      kind,
      vehicle,
      mesh,
      stuckTimer: 0,
      lastX: vehicle.state.x,
      lastZ: vehicle.state.z,
      ramCooldown: 0,
      shootCooldown: 1 + Math.random(),
      sirenPhase: random.range(0, 1),
      health: POLICE.unitHealth,
      disabled: false,
      disabledTimer: 0,
    };
    units.push(unit);
    return unit;
  }

  // Shoot a cruiser up: it takes damage, smokes, and at zero it is done.
  // Returns true when the unit was just disabled.
  function damageUnit(unit, amount) {
    if (unit.disabled) return false;
    unit.health -= amount;
    unit.vehicle.state.damage = Math.min(100, unit.vehicle.state.damage + amount);
    if (unit.health <= 0) {
      unit.disabled = true;
      unit.disabledTimer = 4;
      return true;
    }
    return false;
  }

  function removeUnit(unit) {
    world.scene.remove(unit.mesh);
    const i = units.indexOf(unit);
    if (i >= 0) units.splice(i, 1);
  }

  function syncUnits(wantedLevel, playerPos) {
    const want = POLICE.unitsPerLevel[wantedLevel] ?? 0;
    while (units.length < want) {
      const kind = wantedLevel >= 2 && units.filter((u) => u.kind === 'interceptor').length < wantedLevel - 1
        ? 'interceptor'
        : 'patrol';
      spawnUnit(kind, playerPos);
    }
    while (units.length > want) removeUnit(units[units.length - 1]);
  }

  function nearestDistance(playerPos) {
    let best = Infinity;
    for (const unit of units) {
      const d = Math.hypot(unit.vehicle.state.x - playerPos.x, unit.vehicle.state.z - playerPos.z);
      if (d < best) best = d;
    }
    return best;
  }

  // Steer toward the player: aim at a point a little ahead of them, and
  // when the direct line is blocked by a building, slide along it — the car
  // controller's collision push-out does the sliding for us.
  function chaseInput(unit, playerPos, playerSpeed, dt) {
    const v = unit.vehicle.state;
    const ahead = 0.6;
    const tx = playerPos.x + Math.sin(playerPos.heading ?? 0) * playerSpeed * ahead;
    const tz = playerPos.z + Math.cos(playerPos.heading ?? 0) * playerSpeed * ahead;
    const dx = tx - v.x;
    const dz = tz - v.z;
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - v.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const dist = Math.hypot(dx, dz);
    // Stuck against a wall: back up and turn away for a moment.
    unit.stuckTimer += dt;
    const moved = Math.hypot(v.x - unit.lastX, v.z - unit.lastZ);
    if (moved > 0.5) {
      unit.stuckTimer = 0;
      unit.lastX = v.x;
      unit.lastZ = v.z;
    }
    if (unit.stuckTimer > 1.6 && dist > 8) {
      return { throttle: -1, steer: diff > 0 ? -1 : 1, handbrake: false };
    }
    return {
      throttle: dist > 4 ? 1 : 0.4,
      steer: Math.max(-1, Math.min(1, diff * 2.2)),
      handbrake: false,
    };
  }

  function placeRoadblock(playerPos, playerHeading) {
    if (roadblock) return;
    const ahead = world.nearestRoadPoint(
      playerPos.x + Math.sin(playerHeading) * 55,
      playerPos.z + Math.cos(playerHeading) * 55,
    );
    const cars = [];
    for (const offset of [-4, 4]) {
      const mesh = createCarMesh(POLICE.patrol.colour, { stripe: POLICE.patrol.livery });
      const x = ahead.axis === 'x' ? ahead.x + offset : ahead.x;
      const z = ahead.axis === 'z' ? ahead.z + offset : ahead.z;
      mesh.position.set(x, 0, z);
      mesh.rotation.y = ahead.axis === 'x' ? Math.PI / 2 : 0;
      world.scene.add(mesh);
      cars.push(mesh);
    }
    roadblock = { meshes: cars, x: ahead.x, z: ahead.z, timer: 14 };
  }

  function clearRoadblock() {
    if (!roadblock) return;
    for (const mesh of roadblock.meshes) world.scene.remove(mesh);
    roadblock = null;
  }

  function update(dt, wantedLevel, player, onRam, onBust, onShoot) {
    syncUnits(wantedLevel, player);
    const playerCar = player.state.inCar;
    const playerPos = playerCar
      ? { x: playerCar.state.x, z: playerCar.state.z, heading: playerCar.state.heading }
      : { x: player.state.x, z: player.state.z, heading: player.state.heading };

    // Level 3 calls a roadblock ahead of the player, refreshed while it lasts.
    if (wantedLevel >= POLICE.roadblockAtLevel) {
      roadblockTimer -= dt;
      if (!roadblock && roadblockTimer <= 0) {
        placeRoadblock(playerPos, playerPos.heading);
        roadblockTimer = 10;
      }
    } else {
      clearRoadblock();
    }
    if (roadblock) {
      roadblock.timer -= dt;
      if (roadblock.timer <= 0) clearRoadblock();
    }

    stepUnits(dt, wantedLevel, player, onRam, onBust, onShoot);
  }

  // Step the units already on the road, without syncing the count — the
  // screenshot staging uses this so the chase is exactly the units placed.
  function stepUnits(dt, wantedLevel, player, onRam, onBust, onShoot) {
    const playerCar = player.state.inCar;
    const playerPos = playerCar
      ? { x: playerCar.state.x, z: playerCar.state.z, heading: playerCar.state.heading }
      : { x: player.state.x, z: player.state.z, heading: player.state.heading };
    const playerSpeed = playerCar ? playerCar.state.speed : 0;

    for (const unit of [...units]) {
      const v = unit.vehicle.state;
      // A unit left far behind gives up and despawns.
      const distToPlayer = Math.hypot(v.x - playerPos.x, v.z - playerPos.z);
      if (distToPlayer > POLICE.despawnDistance) {
        removeUnit(unit);
        continue;
      }
      // A disabled cruiser sits smoking until the tow truck takes it.
      if (unit.disabled) {
        unit.disabledTimer -= dt;
        if (unit.disabledTimer <= 0) removeUnit(unit);
        continue;
      }
      unit.ramCooldown = Math.max(0, unit.ramCooldown - dt);
      unit.shootCooldown = Math.max(0, unit.shootCooldown - dt);
      // From wanted level 2 up, a unit close enough opens fire.
      if (onShoot && wantedLevel >= POLICE.shootAtLevel && distToPlayer < POLICE.shootRange && unit.shootCooldown <= 0) {
        unit.shootCooldown = POLICE.shootCooldown + Math.random() * 0.8;
        onShoot(unit);
      }
      const input = chaseInput(unit, playerPos, playerSpeed, dt);
      unit.vehicle.update(dt, input, world, null);

      // Ramming the player's car: a shove, a shake and a little damage.
      if (playerCar) {
        const d = Math.hypot(v.x - playerCar.state.x, v.z - playerCar.state.z);
        const closing = Math.abs(v.speed) + Math.abs(playerCar.state.speed);
        if (d < 4.4 && closing > 8 && unit.ramCooldown <= 0) {
          unit.ramCooldown = POLICE.ramCooldown;
          const pushX = playerCar.state.x - v.x;
          const pushZ = playerCar.state.z - v.z;
          const len = Math.hypot(pushX, pushZ) || 1;
          playerCar.state.x += (pushX / len) * 1.6;
          playerCar.state.z += (pushZ / len) * 1.6;
          playerCar.state.speed *= 0.82;
          if (onRam) onRam(POLICE.ramDamage);
        }
      } else {
        // On foot and cornered: a unit that stays close starts a bust.
        const d = Math.hypot(v.x - player.state.x, v.z - player.state.z);
        if (d < POLICE.bustDistance) {
          unit.bustTimer = (unit.bustTimer ?? 0) + dt;
          if (unit.bustTimer > POLICE.bustSeconds && onBust) onBust();
        } else {
          unit.bustTimer = 0;
        }
      }

      // Flashing light bar: the two halves alternate red and blue.
      unit.sirenPhase += dt * 6;
      const bar = unit.mesh.userData.lightBar;
      if (bar) {
        const on = Math.sin(unit.sirenPhase) > 0;
        bar.material.color.setHex(on ? 0xff2a2a : 0x2266ff);
        bar.material.emissive.setHex(on ? 0xff2222 : 0x2244ff);
      }
    }
  }

  // A bold thief can take a stopped cruiser: the unit is gone from the
  // chase and its car becomes an ordinary drivable car.
  function takeUnit(unit) {
    const vehicle = unit.vehicle;
    removeUnit(unit);
    return vehicle;
  }

  // Clear the whole department: every unit and the roadblock go away.
  function reset() {
    for (const unit of [...units]) removeUnit(unit);
    clearRoadblock();
  }

  return {
    units,
    update,
    stepUnits,
    nearestDistance,
    clearRoadblock,
    takeUnit,
    reset,
    spawnUnitAt,
    damageUnit,
  };
}
