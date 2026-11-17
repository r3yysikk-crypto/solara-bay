// Cars: a low-poly body built from boxes, and the arcade controller that
// drives one. The same mesh factory dresses traffic, parked cars and the
// police; the same controller moves the player's car and the police units,
// so every car in Solara Bay handles the same way.
import { CAR } from './config.js';

export function createCarMesh(colour, options = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colour });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2f42 });
  const trimMat = new THREE.MeshLambertMaterial({ color: options.trim ?? 0x22242a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), bodyMat);
  body.position.y = 0.65;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.25, -0.2);
  group.add(cabin);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.0), trimMat);
  hood.position.set(0, 0.95, 1.8);
  group.add(hood);

  // Headlights that glow at the front, red taillights at the back, and a
  // dark grille — the details that make a car read as a car at a glance.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
  for (const hx of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), headMat);
    head.position.set(hx, 0.72, 2.21);
    group.add(head);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xc81e1e, emissive: 0x881111, emissiveIntensity: 0.6 });
  for (const tx of [-0.62, 0.62]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), tailMat);
    tail.position.set(tx, 0.72, -2.21);
    group.add(tail);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.06), trimMat);
  grille.position.set(0, 0.62, 2.21);
  group.add(grille);

  // A soft blob shadow grounds the car — cheap, and it sells the 3D.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(1.5, 2.6, 1);
  blob.position.y = 0.03;
  group.add(blob);

  // A light bar marks police units; a roof stripe marks taxis and the like.
  if (options.lightBar) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), options.lightBar);
    bar.position.set(0, 1.65, -0.2);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  if (options.stripe) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.1, 4.42),
      new THREE.MeshLambertMaterial({ color: options.stripe }),
    );
    stripe.position.y = 1.02;
    group.add(stripe);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c8 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.38, wz);
    group.add(hub);
    wheels.push(wheel);
    wheels.push(hub);
  }
  group.userData.wheels = wheels;
  return group;
}

// Arcade car physics on a flat city: forward speed plus a sideways slide
// that the grip bleeds off, so a hard turn at speed kicks the tail out a
// little and the car straightens itself again.
export function createVehicle(mesh, start) {
  const state = {
    mesh,
    x: start.x,
    z: start.z,
    heading: start.heading ?? 0,
    speed: 0,
    steer: 0,
    slide: 0, // sideways velocity, m/s
    crashed: 0, // seconds of crash shake left
    damage: 0, // 0-100: shot up or smashed, smokes when high
    maxSpeed: CAR.maxSpeed,
    accel: CAR.engineAccel,
  };

  function forward() {
    return { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  }

  function update(dt, input, world, onCrash) {
    const fwd = forward();
    // Steering: the wheel turns toward the input and straightens with speed.
    const steerTarget = input.steer * CAR.steerMax * Math.max(0.25, 1 - Math.abs(state.speed) / 60);
    const steerRate = CAR.steerSpeed * dt;
    state.steer += Math.max(-steerRate, Math.min(steerRate, steerTarget - state.steer));
    state.heading += (state.steer * state.speed * dt) / 3.2;

    // Throttle, brake and reverse.
    if (input.throttle > 0) {
      state.speed += state.accel * dt;
      if (state.speed < 0) state.speed += CAR.brakeAccel * dt;
    } else if (input.throttle < 0) {
      if (state.speed > 0.5) state.speed -= CAR.brakeAccel * dt;
      else state.speed -= CAR.reverseAccel * dt;
    } else {
      state.speed -= state.speed * CAR.drag * 0.6 * dt;
    }
    // Drag and the handbrake's extra slide.
    state.speed -= state.speed * CAR.drag * dt;
    if (input.handbrake) {
      state.speed -= state.speed * 1.6 * dt;
      state.slide += state.steer * 6 * dt;
    }
    state.speed = Math.max(-CAR.maxReverseSpeed, Math.min(state.maxSpeed, state.speed));

    // The tail slides out on a hard turn, then the grip pulls it back.
    state.slide += -state.steer * state.speed * 0.9 * dt;
    state.slide -= state.slide * CAR.grip * dt;

    const f2 = forward();
    const right = { x: f2.z, z: -f2.x };
    let nx = state.x + (f2.x * state.speed + right.x * state.slide) * dt;
    let nz = state.z + (f2.z * state.speed + right.z * state.slide) * dt;

    const clamped = world.clampToCity(nx, nz, 2.5);
    nx = clamped.x;
    nz = clamped.z;

    // Buildings: push out of the footprint and lose speed with a thud.
    const push = { x: 0, z: 0 };
    if (world.resolveCircleCollision(nx, nz, CAR.radius, push)) {
      const before = Math.abs(state.speed);
      nx += push.x;
      nz += push.z;
      state.speed *= 0.55;
      state.slide *= 0.4;
      if (before > 6 && onCrash) onCrash(before);
      state.crashed = Math.min(0.35, before / 60);
    }

    state.x = nx;
    state.z = nz;
    state.crashed = Math.max(0, state.crashed - dt);

    mesh.position.set(state.x, 0, state.z);
    mesh.rotation.y = state.heading;
    // Body roll into the turn and a little shake after a crash.
    mesh.rotation.z = -state.steer * 0.35 + (state.crashed > 0 ? (Math.random() - 0.5) * 0.06 : 0);
    mesh.rotation.x = Math.min(0.06, Math.max(-0.06, state.speed * 0.0006));
    const spin = (state.speed * dt) / 0.38;
    for (const wheel of mesh.userData.wheels) wheel.rotation.x += spin;
  }

  function teleport(x, z, heading) {
    state.x = x;
    state.z = z;
    state.heading = heading;
    state.speed = 0;
    state.slide = 0;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
  }

  return { state, update, teleport, forward };
}
