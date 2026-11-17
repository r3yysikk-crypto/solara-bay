// Traffic and the crowd: cars that cruise the road grid and pedestrians who
// stroll the sidewalks and run when a car bears down on them. Traffic cars
// brake for the car ahead; pedestrians are the reason reckless driving costs
// wanted heat.
import { CAR_COLOURS, PLAYER, TRAFFIC } from './config.js';
import { createCarMesh } from './vehicles.js';

function makePedestrianMesh(random) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({
    color: random.pick([0xd83a2e, 0x2e6fd8, 0xf2c230, 0x2fae6e, 0xe8e8e8, 0x8a5fd0]),
  });
  const skin = new THREE.MeshLambertMaterial({ color: random.pick([0xe8b88a, 0xc98d64, 0x8a5a3b]) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.28), new THREE.MeshLambertMaterial({ color: 0x2c3a4a }));
  legs.position.y = 0.4;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirt);
  torso.position.y = 1.1;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.65;
  group.add(head);
  return group;
}

export function createTraffic(world, random) {
  const cars = [];
  const pedestrians = [];

  // Headings follow the car controller's convention: heading 0 faces +z,
  // PI/2 faces +x. A car on an 'x' road travels along x, one on a 'z'
  // road along z — never sideways across its own lane.
  function roadHeading(axis, lane) {
    if (axis === 'x') return lane > 0 ? Math.PI / 2 : -Math.PI / 2;
    return lane > 0 ? 0 : Math.PI;
  }

  function spawnTrafficCar() {
    const line = random.pick(world.roadCentrelines());
    const lane = random.pick([-3.4, 3.4]);
    const along = random.range(-180, 180);
    const spot = line.axis === 'x'
      ? { x: along, z: line.at + lane }
      : { x: line.at + lane, z: along };
    const mesh = createCarMesh(random.pick(CAR_COLOURS));
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = roadHeading(line.axis, lane);
    world.scene.add(mesh);
    return {
      mesh,
      axis: line.axis,
      lane,
      lineAt: line.at,
      pos: line.axis === 'x' ? spot.x : spot.z,
      heading: roadHeading(line.axis, lane),
      speed: TRAFFIC.carSpeed + random.range(-TRAFFIC.carSpeedVariance, TRAFFIC.carSpeedVariance),
      targetSpeed: TRAFFIC.carSpeed,
      health: 60, // shot up enough and the car gives up
      stuck: 0,
      stunTimer: 0,
      // A hard shunt stops the car for a while: it sits, hazards on, driver stunned.
      stun(seconds) {
        this.stunTimer = Math.max(this.stunTimer, seconds);
        this.speed = 0;
      },
    };
  }

  function spawnPedestrian() {
    const line = random.pick(world.roadCentrelines());
    const along = random.range(-150, 150);
    const side = random.pick([-1, 1]);
    const spot = line.axis === 'x'
      ? { x: along, z: line.at + side * 8.5 }
      : { x: line.at + side * 8.5, z: along };
    const mesh = makePedestrianMesh(random);
    mesh.position.set(spot.x, 0, spot.z);
    world.scene.add(mesh);
    return {
      mesh,
      x: spot.x,
      z: spot.z,
      heading: random.range(0, Math.PI * 2),
      speed: TRAFFIC.walkSpeed * random.range(0.7, 1.3),
      axis: line.axis,
      lineAt: line.at,
      side,
      along,
      down: false,
      downTimer: 0,
      fleeing: 0,
    };
  }

  for (let i = 0; i < TRAFFIC.carCount; i++) cars.push(spawnTrafficCar());
  for (let i = 0; i < TRAFFIC.pedestrianCount; i++) pedestrians.push(spawnPedestrian());

  // A traffic car is "ahead of" another when it shares the lane and sits in
  // front of it; the follower then brakes instead of rear-ending it.
  function carAhead(car) {
    let nearest = null;
    let nearestGap = Infinity;
    for (const other of cars) {
      if (other === car || other.axis !== car.axis || other.lane !== car.lane || Math.abs(other.lineAt - car.lineAt) > 0.5) continue;
      const gap = other.pos - car.pos;
      // Signed gap along the direction of travel: sin(heading) on x roads,
      // cos(heading) on z roads.
      const signed = car.axis === 'x' ? gap * Math.sin(car.heading) : gap * Math.cos(car.heading);
      if (signed > 0 && signed < nearestGap) {
        nearestGap = signed;
        nearest = other;
      }
    }
    return { car: nearest, gap: nearestGap };
  }

  function stepCar(car, dt, playerCar) {
    const ahead = carAhead(car);
    let target = car.targetSpeed;
    if (car.stunTimer > 0) {
      car.stunTimer -= dt;
      target = 0;
    }
    if (ahead.car && ahead.gap < 14) target = 0;
    // The player is a slower car too: brake for them instead of piling in.
    if (playerCar) {
      const dx = playerCar.state.x - car.mesh.position.x;
      const dz = playerCar.state.z - car.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 12) {
        const forwardX = Math.sin(car.heading);
        const forwardZ = Math.cos(car.heading);
        if (dx * forwardX + dz * forwardZ > 0) target = 0;
      }
    }
    car.speed += Math.max(-14 * dt, Math.min(8 * dt, target - car.speed));
    // Move along the road in the heading's direction, keeping pos in sync
    // so the car-ahead check always measures along the same axis.
    if (car.axis === 'x') car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
    else car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
    car.pos = car.axis === 'x' ? car.mesh.position.x : car.mesh.position.z;

    // At an intersection, sometimes turn onto the crossing road. Roads sit
    // 76 m apart starting at -190, so the modulo distance to the nearest
    // grid line tells us when we are crossing one.
    const along = car.axis === 'x' ? car.mesh.position.x : car.mesh.position.z;
    const mod = (((along + 190) % 76) + 76) % 76;
    const nearGrid = Math.min(mod, 76 - mod) < 1.5;
    if (nearGrid && Math.abs(car.speed) > 2 && random.chance(0.006)) {
      const oldAxis = car.axis;
      car.axis = oldAxis === 'x' ? 'z' : 'x';
      const nearest = world.nearestRoadPoint(car.mesh.position.x, car.mesh.position.z);
      if (car.axis === 'x') {
        car.mesh.position.z = nearest.z + car.lane;
        car.heading = car.lane > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.mesh.position.x = nearest.x + car.lane;
        car.heading = car.lane > 0 ? 0 : Math.PI;
      }
      car.lineAt = nearest[car.axis === 'x' ? 'z' : 'x'];
    }
    // Wrap around the far edge so the streets never empty out.
    if (car.mesh.position.x > 200) car.mesh.position.x = -200;
    if (car.mesh.position.x < -200) car.mesh.position.x = 200;
    if (car.mesh.position.z > 230) car.mesh.position.z = -200;
    if (car.mesh.position.z < -200) car.mesh.position.z = 230;
    car.mesh.rotation.y = car.heading;
  }

  function stepPedestrian(ped, dt, playerCar, playerOnFoot, onHit) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.down = false;
        ped.mesh.rotation.z = 0;
        ped.mesh.position.y = 0;
      }
      return;
    }
    // Flee a fast car coming close: run away from it for a couple of seconds.
    const threats = [];
    if (playerCar) threats.push({ x: playerCar.state.x, z: playerCar.state.z, speed: Math.abs(playerCar.state.speed) });
    for (const t of threats) {
      const d = Math.hypot(t.x - ped.x, t.z - ped.z);
      if (d < 14 && t.speed > 8) {
        ped.fleeing = 2;
        ped.heading = Math.atan2(ped.x - t.x, ped.z - t.z);
      }
    }
    if (ped.fleeing > 0) ped.fleeing -= dt;
    const speed = ped.fleeing > 0 ? ped.speed * 3.2 : ped.speed;
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    // Pedestrians keep to their sidewalk strip and turn at the block ends.
    if (ped.axis === 'x') {
      if (Math.abs(ped.x) > 185) ped.heading += Math.PI;
      ped.z = ped.lineAt + ped.side * 8.5;
    } else {
      if (Math.abs(ped.z) > 185) ped.heading += Math.PI;
      ped.x = ped.lineAt + ped.side * 8.5;
    }
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    const bob = Math.sin(performance.now() / 140 + ped.x) * 0.08;
    ped.mesh.position.y = Math.abs(bob) * 0.4;

    // Hit by the player's car: knocked down, and the law notices.
    if (playerCar && Math.abs(playerCar.state.speed) > 2) {
      const d = Math.hypot(playerCar.state.x - ped.x, playerCar.state.z - ped.z);
      if (d < 2.4) {
        ped.down = true;
        ped.downTimer = 6;
        ped.mesh.rotation.z = Math.PI / 2;
        ped.mesh.position.y = 0.3;
        if (onHit) onHit(ped);
      }
    }
    // Bumped on foot: just shoved aside, no crime.
    if (playerOnFoot) {
      const d = Math.hypot(playerOnFoot.x - ped.x, playerOnFoot.z - ped.z);
      if (d < 1.1) {
        ped.x += (ped.x - playerOnFoot.x) * 0.5;
        ped.z += (ped.z - playerOnFoot.z) * 0.5;
      }
    }
  }

  // Take a traffic car out of circulation: its driver bails and the car is
  // now the player's to drive.
  function removeCar(car) {
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  function update(dt, playerCar, playerOnFoot, onPedestrianHit) {
    for (const car of cars) stepCar(car, dt, playerCar);
    for (const ped of pedestrians) stepPedestrian(ped, dt, playerCar, playerOnFoot, onPedestrianHit);
  }

  return {
    cars,
    pedestrians,
    update,
    removeCar,
    spawnTrafficCar,
  };
}
