// Solara Bay: boot and the one loop. The game moves between four screens —
// title, playing, paused and busted — and every frame reads the input, steps
// the world in fixed 1/60 s slices, and paints what is there. Missions,
// combat, collectibles, the garage and the save all plug in here.
//
// ?seed=N fixes the city. ?shot=city|drive|chase|mission stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { CAR, CITY, COLLECTIBLES, COMBAT, GARAGE, PLAYER, WANTED } from './config.js';
import { createRandom } from './random.js';
import {
  ACTION_ENTER_EXIT,
  ACTION_HORN,
  ACTION_MELEE,
  ACTION_MISSION,
  ACTION_PAUSE,
  ACTION_RELOAD,
  ACTION_SHOOT,
  ACTION_WEAPON,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createCarMesh, createVehicle } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPlayer, nearestStealableCar } from './player.js';
import { createWantedSystem } from './wanted.js';
import { createPolice } from './police.js';
import { createHud } from './hud.js';
import { createCamera } from './camera.js';
import { createParticles } from './particles.js';
import { createSave } from './save.js';
import { createCollectibles } from './collectibles.js';
import { createCombat } from './combat.js';
import { createMissionManager } from './missions.js';

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
const particles = createParticles(world.scene);
const collectibles = createCollectibles(world);
const store = createSave();

// The career: cash, finished jobs, owned cars, found packages, stats and
// where Mara stood — loaded from localStorage when there is one.
let saveData = store.load();
const hasSave = !!saveData;
if (!saveData) saveData = store.blank();
let cash = saveData.cash;
const stats = saveData.stats;

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

// Sunset Motors: three cars for sale on the lot by the beach. A bought car
// is yours — no heat for taking it, and it waits for you here.
for (const spec of GARAGE.cars) {
  const mesh = createCarMesh(spec.colour);
  world.scene.add(mesh);
  const vehicle = createVehicle(mesh, { x: spec.x, z: spec.z, heading: spec.heading });
  drivableCars.push({
    vehicle,
    kind: saveData.ownedCars.includes(spec.id) ? 'owned' : 'sale',
    price: spec.price,
    name: spec.name,
    id: spec.id,
  });
}

function isPoliceCar(vehicle) {
  return drivableCars.some((e) => e.vehicle === vehicle && e.kind === 'police');
}

function nextMissionIndex() {
  for (let i = 0; i < 5; i++) {
    if (!saveData.missionsCompleted.includes(i)) return i;
  }
  return -1;
}

function saveGame() {
  saveData.cash = cash;
  saveData.stats = stats;
  const pos = player.state.inCar
    ? { x: player.state.inCar.state.x, z: player.state.inCar.state.z, heading: player.state.inCar.state.heading }
    : { x: player.state.x, z: player.state.z, heading: player.state.heading };
  saveData.player = pos;
  store.save(saveData);
}

const combat = createCombat({
  world,
  player,
  traffic,
  police,
  wanted,
  particles,
  audio,
  hud,
  camera,
  onShotFired: () => {
    stats.shotsFired += 1;
  },
  onShotHit: () => {
    stats.shotsHit += 1;
  },
  onHostileDown: () => {
    cash += COMBAT.hostileCashDrop;
    hud.setCash(cash);
    hud.showMessage(`Bay Rat down — +$${COMBAT.hostileCashDrop}`, 2.5);
    saveGame();
  },
  onPlayerShot: (damage) => {
    const health = player.hurt(damage);
    hud.setHealth(health);
    hud.flashDamage();
    chaseCamera.addShake(0.4);
    if (health <= 0) bust('Shot down in the street.');
  },
});

const missions = createMissionManager({
  world,
  player,
  police,
  wanted,
  hud,
  audio,
  combat,
  isPoliceCar,
  onMissionComplete: (index, reward) => {
    cash += reward;
    if (!saveData.missionsCompleted.includes(index)) saveData.missionsCompleted.push(index);
    saveData.currentMission = nextMissionIndex();
    stats.missionsDone += 1;
    hud.setCash(cash);
    hud.setStats(stats);
    saveGame();
  },
  onMissionFailed: () => saveGame(),
});

// Apply the loaded career: where Mara stood, what she found, what she owns.
if (hasSave) {
  player.state.x = saveData.player.x;
  player.state.z = saveData.player.z;
  player.state.heading = saveData.player.heading;
  player.mesh.position.set(saveData.player.x, 0, saveData.player.z);
  player.mesh.rotation.y = saveData.player.heading;
  for (const index of saveData.packages) collectibles.markFound(index);
}

let screen = 'title';
let elapsed = 0;
let nearMissCooldown = 0;
let trafficHitCooldown = 0;
let escapeTime = 0;
let autosaveTimer = 0;
let dustTimer = 0;
let smokeTimer = 0;

hud.setWanted(0);
hud.setHealth(PLAYER.maxHealth);
hud.setCash(cash);
hud.setPackages(collectibles.foundCount(), collectibles.total);
hud.setWeapon('fists', COMBAT.pistolAmmo);
hud.setStats(stats);
if (hasSave) hud.buttons.continueButton.style.display = '';
player.mesh.visible = false;

function announceCrime(reason) {
  const messages = {
    steal: 'You stole a car! The police are on their way.',
    stealPolice: 'You stole a police cruiser! Every unit in the bay is coming.',
    pedestrian: 'You hit a pedestrian! Witnesses called it in.',
    traffic: 'You smashed into traffic!',
    nearMiss: 'Reckless driving! Someone reported you.',
    disabledCruiser: 'Cruiser disabled! The department is furious.',
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

function nearestSaleCar() {
  let best = null;
  let bestDist = CAR.enterDistance;
  for (const entry of drivableCars) {
    if (entry.kind !== 'sale' && entry.kind !== 'owned') continue;
    const d = Math.hypot(entry.vehicle.state.x - player.state.x, entry.vehicle.state.z - player.state.z);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best;
}

function tryEnterCar() {
  const playerState = player.state;
  // Sunset Motors first: E buys the car on the lot, it does not steal it.
  const sale = nearestSaleCar();
  if (sale) {
    if (sale.kind === 'owned') {
      player.enterCar(sale.vehicle);
      audio.door();
      return;
    }
    if (cash >= sale.price) {
      cash -= sale.price;
      sale.kind = 'owned';
      saveData.ownedCars.push(sale.id);
      hud.showMessage(`You bought the ${sale.name} for $${sale.price.toLocaleString('en-US')}! It's yours now.`, 4);
      audio.pickup();
      player.enterCar(sale.vehicle);
      audio.door();
      hud.setCash(cash);
      saveGame();
    } else {
      hud.showMessage(`The ${sale.name} costs $${sale.price.toLocaleString('en-US')} — you have $${cash.toLocaleString('en-US')}.`, 3);
    }
    return;
  }
  // A parked or already-stolen car nearby is the easy take.
  const candidates = drivableCars.filter((c) => c.kind !== 'sale').map((c) => c.vehicle);
  const car = nearestStealableCar(player, candidates);
  if (car) {
    player.enterCar(car);
    audio.door();
    const entry = drivableCars.find((c) => c.vehicle === car);
    if (entry && entry.kind === 'parked') {
      wanted.addHeat(WANTED.stealCar, 'steal');
      announceCrime('steal');
      stats.carsStolen += 1;
    } else if (entry && entry.kind === 'traffic') {
      stats.carsStolen += 1;
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
    stats.carsStolen += 1;
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
    stats.carsStolen += 1;
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
    car.state.damage = Math.min(100, car.state.damage + impactSpeed * 0.7);
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

function startNextMission() {
  if (missions.active) return;
  const index = nextMissionIndex();
  missions.start(index === -1 ? 0 : index);
}

function step(dt) {
  const axis = input.axis();
  const actions = input.takeActions();

  if (actions & ACTION_PAUSE) {
    if (screen === 'playing') {
      screen = 'paused';
      hud.setMissionList(
        { DEFS: missions.DEFS, completed: saveData.missionsCompleted },
        (i) => {
          screen = 'playing';
          hud.screens.hidePause();
          if (!missions.active) missions.start(i);
        },
      );
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
  if (actions & ACTION_MELEE) combat.tryMelee();
  if (actions & ACTION_WEAPON) combat.switchWeapon();
  if (actions & ACTION_RELOAD) combat.reload();
  if (actions & ACTION_SHOOT) combat.tryShoot();
  if (actions & ACTION_MISSION) startNextMission();

  nearMissCooldown = Math.max(0, nearMissCooldown - dt);
  trafficHitCooldown = Math.max(0, trafficHitCooldown - dt);
  dustTimer = Math.max(0, dustTimer - dt);
  smokeTimer = Math.max(0, smokeTimer - dt);

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
    (unit) => combat.policeShot(unit),
  );

  combat.update(dt);
  missions.update(dt);
  collectibles.update(dt, elapsed, playerPos, (item) => {
    collectibles.markFound(item.index);
    cash += COLLECTIBLES.reward;
    saveData.packages.push(item.index);
    stats.packagesFound += 1;
    hud.setCash(cash);
    hud.setPackages(collectibles.foundCount(), collectibles.total);
    hud.showMessage(`Package found at ${item.label} — +$${COLLECTIBLES.reward}`, 3);
    audio.pickup();
    particles.sparkle(item.x, item.z);
    saveGame();
  });

  // Drift dust behind the rear wheels; smoke from shot-up or smashed cars.
  if (driving && dustTimer <= 0) {
    const car = player.state.inCar;
    if (Math.abs(car.state.slide) > 3 && Math.abs(car.state.speed) > 10) {
      dustTimer = 0.07;
      particles.dust(
        car.state.x - Math.sin(car.state.heading) * 1.8,
        car.state.z - Math.cos(car.state.heading) * 1.8,
      );
    }
  }
  if (smokeTimer <= 0) {
    smokeTimer = 0.18;
    if (driving && player.state.inCar.state.damage > 50) {
      particles.smoke(player.state.inCar.state.x, player.state.inCar.state.z);
    }
    for (const unit of police.units) {
      if (unit.vehicle.state.damage > 50 && !unit.disabled) {
        particles.smoke(unit.vehicle.state.x, unit.vehicle.state.z);
      }
    }
    for (const t of traffic.cars) {
      if ((t.health ?? 60) <= 20) particles.smoke(t.mesh.position.x, t.mesh.position.z);
    }
  }

  // The longest escape: how long Mara stayed hot before shaking them.
  if (wanted.level > 0) {
    escapeTime += dt;
  } else if (escapeTime > 0) {
    stats.longestEscape = Math.max(stats.longestEscape, escapeTime);
    escapeTime = 0;
  }

  // Slow health recovery while the heat is off.
  if (wanted.level === 0 && player.state.health < PLAYER.maxHealth) {
    player.heal(2 * dt);
    hud.setHealth(player.state.health);
  }

  // The hint line: what E does right now.
  if (!driving) {
    const sale = nearestSaleCar();
    if (sale) {
      hud.setHint(sale.kind === 'owned'
        ? `Press E to take your ${sale.name}`
        : `Press E to buy the ${sale.name} — $${sale.price.toLocaleString('en-US')}`);
    } else {
      const near = nearestStealableCar(player, drivableCars.filter((c) => c.kind !== 'sale').map((c) => c.vehicle));
      hud.setHint(near ? 'Press E to take the car' : 'WASD to walk — find a car and press E · M for a job');
    }
  } else {
    hud.setHint('E to get out — P to pause');
  }

  hud.setSpeed(driving ? player.state.inCar.state.speed * 3.6 : 0, driving);
  hud.setHealth(player.state.health);
  hud.setCrosshair(!driving && combat.weapon === 'pistol');
  hud.setWeapon(combat.weapon, combat.ammo);
  audio.setEngine(driving ? Math.abs(player.state.inCar.state.speed) / CAR.maxSpeed : 0, driving);
  audio.setSiren(wanted.level > 0, dt);

  autosaveTimer += dt;
  if (autosaveTimer >= 15) {
    autosaveTimer = 0;
    saveGame();
  }
}

function bust(text) {
  if (screen !== 'playing') return;
  screen = 'busted';
  missions.abort();
  audio.busted();
  audio.setEngine(0, false);
  audio.setSiren(false, 0);
  hud.setStats(stats);
  saveGame();
  hud.screens.showBusted(text);
}

function resetGame() {
  wanted.clear();
  police.reset();
  combat.reset();
  missions.abort();
  player.state.health = PLAYER.maxHealth;
  if (player.state.inCar) player.exitCar();
  player.state.x = 0;
  player.state.z = 20;
  player.state.heading = 0;
  player.mesh.position.set(0, 0, 20);
  player.mesh.visible = true;
  escapeTime = 0;
  hud.setHealth(PLAYER.maxHealth);
  hud.setWanted(0);
  hud.setWeapon('fists', COMBAT.pistolAmmo);
  hud.screens.hideBusted();
  hud.screens.hideTitle();
  chaseCamera.clearFraming();
  chaseCamera.snap({ x: 0, z: 20, heading: 0 }, false);
  screen = 'playing';
}

function startGame() {
  audio.unlock();
  audio.click();
  player.mesh.visible = true;
  hud.screens.hideTitle();
  screen = 'playing';
  const target = player.state.inCar
    ? { x: player.state.inCar.state.x, z: player.state.inCar.state.z, heading: player.state.inCar.state.heading }
    : { x: player.state.x, z: player.state.z, heading: player.state.heading };
  chaseCamera.clearFraming();
  chaseCamera.snap(target, !!player.state.inCar);
}

function quitToTitle() {
  saveGame();
  screen = 'title';
  player.mesh.visible = false;
  hud.setStats(stats);
  hud.screens.hidePause();
  hud.screens.showTitle();
}

hud.buttons.startButton.addEventListener('click', () => {
  audio.unlock();
  if (store.load()) {
    // A career exists: START ENGINE means a fresh one.
    store.clear();
    window.location.reload();
    return;
  }
  startGame();
});
hud.buttons.continueButton.addEventListener('click', () => {
  audio.unlock();
  audio.click();
  player.mesh.visible = true;
  hud.screens.hideTitle();
  screen = 'playing';
  const target = { x: player.state.x, z: player.state.z, heading: player.state.heading };
  chaseCamera.clearFraming();
  chaseCamera.snap(target, false);
});
hud.buttons.resumeButton.addEventListener('click', () => {
  screen = 'playing';
  hud.screens.hidePause();
});
hud.buttons.restartButton.addEventListener('click', resetGame);
hud.buttons.quitButton.addEventListener('click', quitToTitle);

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
    extra: {
      marker: missions.marker,
      collectibles: collectibles.items,
      garage: { x: 156, z: 186 },
    },
  });
  particles.update(1 / 60);
  world.update(1 / 60, elapsed);
  renderer.render(world.scene, camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - (frame.last ?? now)) / 1000, MAX_FRAME);
  frame.last = now;
  elapsed += dt;
  if (screen === 'title') {
    // The title screen orbits the city while traffic keeps moving — and
    // Mara herself stays out of the panel's way.
    traffic.update(dt, null, null, null);
    world.update(dt, elapsed);
    chaseCamera.updateTitle(dt, elapsed);
    renderer.render(world.scene, camera);
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

// Screenshot staging: put the game in a photogenic state on a long straight
// road, settle it, then paint twice and signal readiness. The road at z=-38
// runs the whole city east-west; heading PI/2 drives +x along it.
const SHOT_ROAD_Z = -38;
const SHOT_LANE_Z = SHOT_ROAD_Z + 3.4;

function placeTrafficOnRoad(car, x) {
  car.axis = 'x';
  car.lane = 3.4;
  car.lineAt = SHOT_ROAD_Z;
  car.heading = Math.PI / 2;
  car.pos = x;
  car.speed = 9;
  car.targetSpeed = 9;
  car.mesh.position.set(x, 0, SHOT_LANE_Z);
  car.mesh.rotation.y = Math.PI / 2;
}

function stageShot(name) {
  screen = 'playing';
  hud.screens.hideTitle();
  chaseCamera.setFraming(20, 7.5);

  if (name === 'drive') {
    // Open road, traffic ahead, the car actually moving.
    const entry = drivableCars[0];
    entry.vehicle.teleport(-120, SHOT_LANE_Z, Math.PI / 2);
    player.enterCar(entry.vehicle);
    entry.vehicle.state.speed = 24;
    placeTrafficOnRoad(traffic.cars[0], -70);
    placeTrafficOnRoad(traffic.cars[1], -40);
    placeTrafficOnRoad(traffic.cars[2], -10);
    for (let i = 0; i < 45; i++) {
      traffic.update(STEP, player.state.inCar, null, null);
      player.state.inCar.update(STEP, { throttle: 0.9, steer: 0, handbrake: false }, world, null);
    }
    entry.vehicle.state.speed = 24;
  } else if (name === 'chase') {
    // Mid-road, two cruisers visible right behind with light bars flashing.
    const entry = drivableCars[1];
    entry.vehicle.teleport(-120, SHOT_LANE_Z, Math.PI / 2);
    player.enterCar(entry.vehicle);
    entry.vehicle.state.speed = 26;
    wanted.addHeat(70, 'steal');
    police.spawnUnitAt('patrol', -134, SHOT_LANE_Z, Math.PI / 2);
    police.spawnUnitAt('interceptor', -146, SHOT_ROAD_Z - 3.4, Math.PI / 2);
    for (let i = 0; i < 60; i++) {
      police.stepUnits(STEP, wanted.level, player, null, null, null);
      entry.vehicle.update(STEP, { throttle: 1, steer: 0, handbrake: false }, world, null);
      traffic.update(STEP, player.state.inCar, null, null);
    }
    entry.vehicle.state.speed = 26;
    chaseCamera.setFraming(21, 8);
  } else if (name === 'mission') {
    // Job 3 in progress: the package run, marker ahead, one cruiser behind.
    missions.start(2);
    player.state.x = -60;
    player.state.z = 60;
    player.state.heading = 0;
    player.mesh.position.set(-60, 0, 60);
    for (let i = 0; i < 40 && missions.marker && missions.marker.x !== 150; i++) {
      missions.update(STEP);
    }
    const entry = drivableCars[0];
    entry.vehicle.teleport(150, 186, 0);
    player.enterCar(entry.vehicle);
    entry.vehicle.state.speed = 12;
    wanted.addHeat(30, 'steal');
    police.spawnUnitAt('patrol', 150, 140, 0);
    for (let i = 0; i < 30; i++) {
      police.stepUnits(STEP, wanted.level, player, null, null, null);
      entry.vehicle.update(STEP, { throttle: 0.6, steer: 0, handbrake: false }, world, null);
      traffic.update(STEP, player.state.inCar, null, null);
    }
    entry.vehicle.state.speed = 12;
    chaseCamera.setFraming(18, 7);
  } else {
    // 'city': a high wide look over the grid, the beach and the bay.
    player.state.x = 0;
    player.state.z = 20;
    player.state.heading = 0.6;
    player.mesh.position.set(0, 0, 20);
    player.mesh.visible = true;
    chaseCamera.setFraming(30, 15);
  }

  const target = player.state.inCar
    ? { x: player.state.inCar.state.x, z: player.state.inCar.state.z, heading: player.state.inCar.state.heading }
    : { x: player.state.x, z: player.state.z, heading: player.state.heading };
  chaseCamera.snap(target, !!player.state.inCar);
  hud.setWanted(wanted.level);
  hud.setSpeed(player.state.inCar ? player.state.inCar.state.speed * 3.6 : 0, !!player.state.inCar);
  hud.setCash(cash);
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
