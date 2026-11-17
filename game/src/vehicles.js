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
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    wheels.push(wheel);
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
