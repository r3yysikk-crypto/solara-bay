// Solara Bay: boot and the one loop. The game moves between four screens —
// title, playing, paused and busted — and every frame reads the input, steps
// the world in fixed 1/60 s slices, and paints what is there.
//
// ?seed=N fixes the city. ?shot=city|drive|chase stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { CAR, PLAYER, WANTED } from './config.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_ENTER_EXIT, ACTION_HORN, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createCarMesh, createVehicle } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPlayer, nearestStealableCar } from './player.js';
import { createWantedSystem } from './wanted.js';
import { createPolice } from './police.js';
import { createHud } from './hud.js';
import { createCamera } from './camera.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const random = createRandom(seed);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const world = createWorld(random);
const chaseCamera = createCamera(camera);
const input = createInput(window);
const audio = createAudio();
const traffic = createTraffic(world, random);
const player = createPlayer(world);
const wanted = createWantedSystem();
const police = createPolice(world, random);
const hud = createHud();

// Parked cars line the avenues: free to take, and taking one is a crime.
const drivableCars = [];
function spawnParkedCars() {
  const spots = [
    { x: -34, z: 10, heading: 0 },
    { x: 42, z: -34, heading: Math.PI / 2 },
    { x: -110, z: 42, heading: 0 },
    { x: 118, z: 114, heading: Math.PI },
    { x: -38, z: -110, heading: -Math.PI / 2 },
    { x: 190 - 14, z: 186, heading: Math.PI / 2 },
  ];
  for (const spot of spots) {
    const mesh = createCarMesh(random.pick([0xd83a2e, 0x2e6fd8, 0xf2c230, 0xe8e8e8, 0x3aa7a3]));
    world.scene.add(mesh);
    const vehicle = createVehicle(mesh, spot);
    drivableCars.push({ vehicle, kind: 'parked' });
  }
}
spawnParkedCars();

let screen = 'title';
let cash = 250;
let nearMissCooldown = 0;
let trafficHitCooldown = 0;

hud.setWanted(0);
hud.setHealth(PLAYER.maxHealth);
hud.setCash(cash);

function announceCrime(reason) {
  const messages = {
    steal: 'You stole a car! The police are on their way.',
    stealPolice: 'You stole a police cruiser! Every unit in the bay is coming.',
    pedestrian: 'You hit a pedestrian! Witnesses called it in.',
    traffic: 'You smashed into traffic!',
    nearMiss: 'Reckless driving! Someone reported you.',
  };
  if (messages[reason]) hud.showMessage(messages[reason]);
}

wanted.onLevelChange((level) => {
  hud.setWanted(level);
  if (level > 0) {
    hud.showMessage(`Wanted level ${level} — lose the cops!`);
    audio.sirenBlip();
  } else {
    hud.showMessage('You lost the cops. Lay low.');
  }
});

function stealCarFromTraffic(trafficCar) {
  traffic.removeCar(trafficCar);
  const vehicle = createVehicle(trafficCar.mesh, {
    x: trafficCar.mesh.position.x,
    z: trafficCar.mesh.position.z,
    heading: trafficCar.heading,
  });
  drivableCars.push({ vehicle, kind: 'traffic' });
  return vehicle;
}

function tryEnterCar() {
  const playerState = player.state;
  // A parked or already-stolen car nearby is the easy take.
  const car = nearestStealableCar(player, drivableCars.map((c) => c.vehicle));
  if (car) {
    player.enterCar(car);
    audio.door();
    const entry = drivableCars.find((c) => c.vehicle === car);
    if (entry && entry.kind === 'parked') {
      wanted.addHeat(WANTED.stealCar, 'steal');
      announceCrime('steal');
    }
    return;
  }
  // A slow traffic car can be yanked too — its driver bails and runs.
  let bestTraffic = null;
  let bestDist = CAR.enterDistance;
  for (const t of traffic.cars) {
    const d = Math.hypot(t.mesh.position.x - playerState.x, t.mesh.position.z - playerState.z);
    if (d < bestDist) {
      bestDist = d;
      bestTraffic = t;
    }
  }
  if (bestTraffic) {
    const vehicle = stealCarFromTraffic(bestTraffic);
    player.enterCar(vehicle);
    audio.door();
    wanted.addHeat(WANTED.stealCar, 'steal');
    announceCrime('steal');
    return;
  }
  // Even a stopped police cruiser is not safe from a bold thief.
  let bestUnit = null;
  bestDist = CAR.enterDistance;
  for (const unit of police.units) {
    const v = unit.vehicle.state;
    if (Math.abs(v.speed) > 3) continue;
    const d = Math.hypot(v.x - playerState.x, v.z - playerState.z);
    if (d < bestDist) {
      bestDist = d;
      bestUnit = unit;
    }
  }
  if (bestUnit) {
    const vehicle = police.takeUnit(bestUnit);
    drivableCars.push({ vehicle, kind: 'police' });
    player.enterCar(vehicle);
    audio.door();
    wanted.addHeat(WANTED.stealCar + 25, 'stealPolice');
    announceCrime('stealPolice');
  }
}

function exitCar() {
  const vehicle = player.exitCar();
  if (vehicle) audio.door();
}

function stepPlayerCar(dt, axis) {
  const car = player.state.inCar;
  car.update(dt, axis, world, (impactSpeed) => {
    audio.crash(impactSpeed / 40);
    chaseCamera.addShake(0.4);
    if (impactSpeed > 14) {
      const health = player.hurt(Math.round((impactSpeed - 14) * 0.5));
      hud.setHealth(health);
      if (health <= 0) bust('Your car is wrecked. The police haul you out.');
    }
  });
  // Smash into a traffic car: shove it, slow it, and the law notices.
  for (const t of traffic.cars) {
    const dx = car.state.x - t.mesh.position.x;
    const dz = car.state.z - t.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && Math.abs(car.state.speed) > 1) {
      const push = 3.4 - d;
      const len = d || 1;
      t.mesh.position.x -= (dx / len) * push;
      t.mesh.position.z -= (dz / len) * push;
      t.stun(2.5);
      car.state.speed *= 0.72;
      audio.crash(0.4);
      chaseCamera.addShake(0.35);
      if (trafficHitCooldown <= 0) {
        trafficHitCooldown = 2;
        wanted.addHeat(WANTED.hitTrafficCar, 'traffic');
        announceCrime('traffic');
      }
    }
  }
  // A parked car is a solid obstacle too.
  for (const entry of drivableCars) {
    if (entry.vehicle === car) continue;
    const other = entry.vehicle.state;
    const d = Math.hypot(car.state.x - other.x, car.state.z - other.z);
    if (d < 3.6 && Math.abs(car.state.speed) > 1) {
      car.state.speed *= 0.6;
      audio.crash(0.3);
    }
  }
}

function step(dt) {
  const axis = input.axis();
  const actions = input.takeActions();

  if (actions & ACTION_PAUSE) {
    if (screen === 'playing') {
      screen = 'paused';
      hud.screens.showPause();
    } else if (screen === 'paused') {
      screen = 'playing';
      hud.screens.hidePause();
    }
  }
  if (screen !== 'playing') return;

  if (actions & ACTION_ENTER_EXIT) {
    if (player.state.inCar) exitCar();
    else tryEnterCar();
  }
  if (actions & ACTION_HORN) audio.horn();

  nearMissCooldown = Math.max(0, nearMissCooldown - dt);
  trafficHitCooldown = Math.max(0, trafficHitCooldown - dt);

  const driving = !!player.state.inCar;
  if (driving) stepPlayerCar(dt, axis);
  else player.updateOnFoot(dt, input, chaseCamera.getYaw());

  // Near misses: screaming past a pedestrian at speed is reckless driving.
  if (driving && nearMissCooldown <= 0) {
    const car = player.state.inCar;
    for (const ped of traffic.pedestrians) {
      if (ped.down) continue;
      const d = Math.hypot(car.state.x - ped.x, car.state.z - ped.z);
      if (d > 2.4 && d < 4.5 && Math.abs(car.state.speed) > 15) {
        nearMissCooldown = 2.5;
        wanted.addHeat(WANTED.recklessNearMiss, 'nearMiss');
        announceCrime('nearMiss');
        break;
      }
    }
  }

  traffic.update(dt, player.state.inCar, driving ? null : player.state, (ped) => {
    wanted.addHeat(WANTED.hitPedestrian, 'pedestrian');
    announceCrime('pedestrian');
    audio.crash(0.5);
  });

  const playerPos = driving
    ? { x: player.state.inCar.state.x, z: player.state.inCar.state.z }
    : { x: player.state.x, z: player.state.z };
  wanted.update(dt, police.nearestDistance(playerPos));
  police.update(
    dt,
    wanted.level,
    player,
    (damage) => {
      const health = player.hurt(damage);
      hud.setHealth(health);
      audio.crash(0.5);
      chaseCamera.addShake(0.5);
      if (health <= 0) bust('Your car is wrecked. The police haul you out.');
    },
    () => bust('Busted! The police caught you on foot.'),
  );

  // Slow health recovery while the heat is off.
  if (wanted.level === 0 && player.state.health < PLAYER.maxHealth) {
    player.heal(2 * dt);
    hud.setHealth(player.state.health);
  }

  // The hint line: what E does right now.
  if (!driving) {
    const near = nearestStealableCar(player, drivableCars.map((c) => c.vehicle));
    hud.setHint(near ? 'Press E to take the car' : 'WASD to walk — find a car and press E');
  } else {
    hud.setHint('E to get out — P to pause');
  }

  hud.setSpeed(driving ? player.state.inCar.state.speed * 3.6 : 0, driving);
  hud.setHealth(player.state.health);
  audio.setEngine(driving ? Math.abs(player.state.inCar.state.speed) / CAR.maxSpeed : 0, driving);
  audio.setSiren(wanted.level > 0, dt);
}

function bust(text) {
  if (screen !== 'playing') return;
  screen = 'busted';
  audio.busted();
  audio.setEngine(0, false);
  audio.setSiren(false, 0);
  hud.screens.showBusted(text);
}

function resetGame() {
  wanted.clear();
  police.reset();
  player.state.health = PLAYER.maxHealth;
  if (player.state.inCar) player.exitCar();
  player.state.x = 0;
  player.state.z = 20;
  player.state.heading = 0;
  player.mesh.position.set(0, 0, 20);
  hud.setHealth(PLAYER.maxHealth);
  hud.setWanted(0);
  hud.screens.hideBusted();
  hud.screens.hideTitle();
  chaseCamera.snap({ x: 0, z: 20, heading: 0 }, false);
  screen = 'playing';
}

function startGame() {
  audio.unlock();
  audio.click();
  hud.screens.hideTitle();
  screen = 'playing';
  const target = player.state.inCar
    ? { x: player.state.inCar.state.x, z: player.state.inCar.state.z, heading: player.state.inCar.state.heading }
    : { x: player.state.x, z: player.state.z, heading: player.state.heading };
  chaseCamera.snap(target, !!player.state.inCar);
}

hud.buttons.startButton.addEventListener('click', startGame);
hud.buttons.resumeButton.addEventListener('click', () => {
  screen = 'playing';
  hud.screens.hidePause();
});
hud.buttons.restartButton.addEventListener('click', resetGame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function paint() {
  const target = player.state.inCar
    ? { x: player.state.inCar.state.x, z: player.state.inCar.state.z, heading: player.state.inCar.state.heading }
    : { x: player.state.x, z: player.state.z, heading: player.state.heading };
  chaseCamera.update(1 / 60, target, !!player.state.inCar);
  hud.update(1 / 60, {
    player: { x: target.x, z: target.z, heading: target.heading },
    police: police.units,
    traffic: traffic.cars,
  });
  renderer.render(world.scene, camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - (frame.last ?? now)) / 1000, MAX_FRAME);
  frame.last = now;
  if (screen === 'title') {
    // The title screen shows the city alive behind it: traffic keeps moving.
    traffic.update(dt, null, null, null);
    paint();
    return;
  }
  let acc = dt;
  let guard = 0;
  while (acc >= STEP && guard < 5) {
    step(STEP);
    acc -= STEP;
    guard += 1;
  }
  paint();
}

// Screenshot staging: put the game in a photogenic state, settle it for a
// couple of seconds, then paint twice and signal readiness.
function stageShot(name) {
  screen = 'playing';
  hud.screens.hideTitle();
  if (name === 'drive') {
    const spot = world.randomRoadPoint();
    const entry = drivableCars[0];
    entry.vehicle.teleport(spot.x, spot.z, spot.heading);
    player.enterCar(entry.vehicle);
    entry.vehicle.state.speed = 18;
  } else if (name === 'chase') {
    const spot = world.randomRoadPoint();
    const entry = drivableCars[1];
    entry.vehicle.teleport(spot.x, spot.z, spot.heading);
    player.enterCar(entry.vehicle);
    entry.vehicle.state.speed = 24;
    wanted.addHeat(70, 'steal');
    for (let i = 0; i < 90; i++) {
      police.update(STEP, wanted.level, player, null, null);
      entry.vehicle.update(STEP, { throttle: 1, steer: 0, handbrake: false }, world, null);
    }
  }
  // Settle the scene for two seconds of simulation.
  for (let i = 0; i < 120; i++) {
    traffic.update(STEP, player.state.inCar, player.state.inCar ? null : player.state, null);
    if (player.state.inCar) {
      player.state.inCar.update(STEP, { throttle: 0.4, steer: 0.1, handbrake: false }, world, null);
    }
  }
  const target = player.state.inCar
    ? { x: player.state.inCar.state.x, z: player.state.inCar.state.z, heading: player.state.inCar.state.heading }
    : { x: player.state.x, z: player.state.z, heading: player.state.heading };
  chaseCamera.snap(target, !!player.state.inCar);
  hud.setWanted(wanted.level);
  hud.setSpeed(player.state.inCar ? player.state.inCar.state.speed * 3.6 : 0, !!player.state.inCar);
  let painted = 0;
  function paintShot() {
    paint();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintShot);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintShot);
}

if (shot) stageShot(shot);
else {
  hud.screens.showTitle();
  requestAnimationFrame(frame);
}
