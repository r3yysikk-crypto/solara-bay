// The player on foot: a quick walker who runs with Shift, steered relative
// to the camera, and who can take any car nearby with E — parked, traffic or
// police — and step back out of it with E again.
import { CAR, PLAYER } from './config.js';

export function createPlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6fd8 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.32), new THREE.MeshLambertMaterial({ color: 0x22242a }));
  legs.position.y = 0.42;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), jacket);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.75;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0xd83a2e }));
  cap.position.y = 1.95;
  group.add(cap);
  // Arms at her sides, and a pistol that only shows when she is armed.
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.16);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.4, 1.15, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.4, 1.15, 0);
  group.add(armR);
  const pistol = new THREE.Group();
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x1a1c20 }));
  pistol.add(gunBody);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), new THREE.MeshLambertMaterial({ color: 0x2c2f36 }));
  grip.position.set(0, -0.12, -0.12);
  pistol.add(grip);
  pistol.position.set(0.4, 0.85, 0.22);
  pistol.visible = false;
  group.add(pistol);
  group.userData.pistol = pistol;
  group.userData.armR = armR;
  group.userData.torso = torso;
  // A soft blob shadow grounds her too.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);
  return group;
}

export function createPlayer(world) {
  const mesh = createPlayerMesh();
  world.scene.add(mesh);
  const state = {
    x: 0,
    z: 20,
    heading: 0,
    health: PLAYER.maxHealth,
    inCar: null, // the vehicle controller when driving, else null
    moving: false,
    armed: false, // pistol drawn
    punchTimer: 0, // seconds of punch swing left
  };
  mesh.position.set(state.x, 0, state.z);

  function updateOnFoot(dt, input, cameraYaw) {
    const axis = input.axis();
    const speed = axis.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Movement is camera-relative: up always walks away from the camera.
    // Forward is (sin yaw, cos yaw); right is forward rotated -90° about Y.
    const forwardX = Math.sin(cameraYaw);
    const forwardZ = Math.cos(cameraYaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const mx = forwardX * axis.throttle + rightX * -axis.steer;
    const mz = forwardZ * axis.throttle + rightZ * -axis.steer;
    const len = Math.hypot(mx, mz);
    state.moving = len > 0.1;
    if (state.moving) {
      const nx = state.x + (mx / len) * speed * dt;
      const nz = state.z + (mz / len) * speed * dt;
      const clamped = world.clampToCity(nx, nz, 1);
      const push = { x: 0, z: 0 };
      if (!world.resolveCircleCollision(clamped.x, clamped.z, PLAYER.radius, push)) {
        state.x = clamped.x;
        state.z = clamped.z;
      } else {
        state.x = clamped.x + push.x;
        state.z = clamped.z + push.z;
      }
      state.heading = Math.atan2(mx, mz);
    }
    mesh.position.set(state.x, Math.abs(Math.sin(performance.now() / 120)) * (state.moving ? 0.08 : 0), state.z);
    mesh.rotation.y = state.heading;
    // A punch swings the right arm forward for a beat.
    if (state.punchTimer > 0) {
      state.punchTimer -= dt;
      const swing = Math.sin((state.punchTimer / 0.28) * Math.PI);
      mesh.userData.armR.rotation.x = -1.4 * swing;
      mesh.userData.torso.rotation.x = 0.18 * swing;
    } else {
      mesh.userData.armR.rotation.x = 0;
      mesh.userData.torso.rotation.x = 0;
    }
  }

  function setArmed(armed) {
    state.armed = armed;
    mesh.userData.pistol.visible = armed;
  }

  function punch() {
    state.punchTimer = 0.28;
  }

  function enterCar(vehicle) {
    state.inCar = vehicle;
    mesh.visible = false;
  }

  function exitCar() {
    const vehicle = state.inCar;
    if (!vehicle) return null;
    state.inCar = null;
    // Step out to the driver's side, clear of the car and of walls.
    const side = { x: Math.cos(vehicle.state.heading), z: -Math.sin(vehicle.state.heading) };
    let px = vehicle.state.x + side.x * 2.6;
    let pz = vehicle.state.z + side.z * 2.6;
    const push = { x: 0, z: 0 };
    if (world.resolveCircleCollision(px, pz, PLAYER.radius, push)) {
      px += push.x;
      pz += push.z;
    }
    const clamped = world.clampToCity(px, pz, 1);
    state.x = clamped.x;
    state.z = clamped.z;
    state.heading = vehicle.state.heading;
    mesh.visible = true;
    mesh.position.set(state.x, 0, state.z);
    return vehicle;
  }

  function hurt(amount) {
    state.health = Math.max(0, state.health - amount);
    return state.health;
  }

  function heal(amount) {
    state.health = Math.min(PLAYER.maxHealth, state.health + amount);
  }

  return {
    state,
    mesh,
    updateOnFoot,
    enterCar,
    exitCar,
    hurt,
    heal,
    setArmed,
    punch,
  };
}

// The nearest car the player could take: parked cars, traffic and police
// alike, inside CAR.enterDistance.
export function nearestStealableCar(player, candidates) {
  let best = null;
  let bestDist = CAR.enterDistance;
  for (const candidate of candidates) {
    const d = Math.hypot(candidate.state.x - player.state.x, candidate.state.z - player.state.z);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}
