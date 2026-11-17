// Missions: Mara Voss climbs the Solara Bay ladder, one job at a time.
// Five sequential jobs — steal, escape, deliver, race, and the big score —
// each with a beacon in the world, a marker on the minimap, an objective
// on the HUD, a timer where it matters, and cash on completion.
import { CITY, MISSIONS } from './config.js';

const PIER = { x: 0, z: CITY.half + CITY.beachDepth + 28 };
const BEACH_HOUSE = { x: 150, z: CITY.half + 20 };
const MARKET = { x: -60, z: 60 };
const GARAGE_LOT = { x: 156, z: 186 };
const RACE_POINTS = [
  { x: -150, z: -150 },
  { x: 150, z: -150 },
  { x: 150, z: 150 },
  { x: -150, z: 150 },
  { x: 0, z: 0 },
];

const DEFS = [
  {
    id: 'hot-wheels',
    title: '1 — Hot Wheels',
    brief: 'Mara needs wheels. Steal any car, then drop it at the pier.',
    stages: ['Steal a car — press E near one', 'Deliver the car to the pier'],
  },
  {
    id: 'getaway',
    title: '2 — The Getaway',
    brief: 'The department is on you. Lose the heat — get wanted to zero.',
    stages: ['Lose the cops — wanted level must hit zero'],
  },
  {
    id: 'package-run',
    title: '3 — Package Run',
    brief: 'Pick up the package at the market, deliver it to the beach house. Quietly — wanted level 3 blows the job.',
    stages: ['Pick up the package at the market', 'Deliver it to the beach house'],
  },
  {
    id: 'checkpoint-rush',
    title: '4 — Checkpoint Rush',
    brief: 'Five checkpoints, a hundred seconds. Show the bay how you drive.',
    stages: ['Hit all 5 checkpoints in order'],
  },
  {
    id: 'big-score',
    title: '5 — The Big Score',
    brief: 'The final job: steal a police interceptor and bring it to the Sunset Motors lot. The whole department will come.',
    stages: ['Steal a police cruiser', 'Deliver it to the Sunset Motors lot'],
  },
];

export function createMissionManager(ctx) {
  const { world, player, police, wanted, hud, audio, combat } = ctx;
  const scene = world.scene;

  // One beacon reused by every objective: a light pillar, a ground ring
  // and a bobbing diamond the player can spot from across the city.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 17;
  beacon.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  beacon.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa7a00, emissiveIntensity: 0.8 }),
  );
  diamond.position.y = 7;
  beacon.add(diamond);
  beacon.visible = false;
  scene.add(beacon);

  let current = -1; // index into DEFS, -1 = no mission
  let stage = 0;
  let timer = 0;
  let checkpoint = 0;
  let hasPackage = false;
  let marker = null; // {x, z} for the minimap + HUD distance
  let time = 0;

  function setMarker(x, z, colour = 0xffd23f) {
    marker = { x, z };
    beacon.position.set(x, 0, z);
    beacon.visible = true;
    pillar.material.color.setHex(colour);
    ring.material.color.setHex(colour);
    diamond.material.color.setHex(colour);
  }

  function hideMarker() {
    marker = null;
    beacon.visible = false;
  }

  function playerPos() {
    return player.state.inCar
      ? { x: player.state.inCar.state.x, z: player.state.inCar.state.z }
      : { x: player.state.x, z: player.state.z };
  }

  function distToMarker() {
    if (!marker) return 0;
    const p = playerPos();
    return Math.hypot(p.x - marker.x, p.z - marker.z);
  }

  function start(index) {
    if (index < 0 || index >= DEFS.length) return false;
    current = index;
    stage = 0;
    timer = 0;
    checkpoint = 0;
    hasPackage = false;
    const def = DEFS[index];
    hud.showMessage(`${def.title}: ${def.brief}`, 6);
    audio.missionStart();
    if (index === 0) {
      setMarker(PIER.x, PIER.z);
    } else if (index === 1) {
      hideMarker();
      timer = MISSIONS.escapeTimeLimit;
      wanted.addHeat(70, 'getaway');
      hud.showMessage('Wanted level 2! Lose them before the clock runs out.', 5);
    } else if (index === 2) {
      setMarker(MARKET.x, MARKET.z, 0x7dff9b);
      combat.spawnHostiles([
        { x: MARKET.x - 6, z: MARKET.z + 4 },
        { x: MARKET.x + 6, z: MARKET.z - 4 },
      ]);
      hud.showMessage('Bay Rats guard the package. Deal with them.', 5);
    } else if (index === 3) {
      timer = MISSIONS.raceTimeLimit;
      setMarker(RACE_POINTS[0].x, RACE_POINTS[0].z);
    } else if (index === 4) {
      setMarker(GARAGE_LOT.x, GARAGE_LOT.z);
      wanted.addHeat(120, 'bigScore');
      hud.showMessage('Every unit in the bay is coming for you.', 5);
    }
    updateHudObjective();
    return true;
  }

  function complete() {
    const reward = MISSIONS.rewards[current];
    const def = DEFS[current];
    hud.showMessage(`Job done — ${def.title}! +$${reward.toLocaleString('en-US')}`, 5);
    audio.missionWin();
    combat.clearHostiles();
    hideMarker();
    ctx.onMissionComplete?.(current, reward);
    current = -1;
    stage = 0;
    updateHudObjective();
  }

  function fail(reason) {
    if (current < 0) return;
    const def = DEFS[current];
    hud.showMessage(`Job failed — ${def.title}: ${reason}`, 5);
    audio.missionFail();
    combat.clearHostiles();
    hideMarker();
    ctx.onMissionFailed?.(current, reason);
    current = -1;
    stage = 0;
    updateHudObjective();
  }

  function abort() {
    if (current < 0) return;
    combat.clearHostiles();
    hideMarker();
    current = -1;
    stage = 0;
    updateHudObjective();
  }

  function updateHudObjective() {
    if (current < 0) {
      hud.setObjective(null);
      return;
    }
    const def = DEFS[current];
    const text = def.stages[stage] ?? def.stages[0];
    hud.setObjective({
      title: def.title,
      text,
      distance: marker ? Math.round(distToMarker()) : null,
      timer: timer > 0 ? Math.ceil(timer) : null,
    });
  }

  function update(dt) {
    time += dt;
    if (beacon.visible) {
      diamond.position.y = 7 + Math.sin(time * 2.2) * 0.7;
      diamond.rotation.y += dt * 1.6;
      ring.scale.setScalar(1 + Math.sin(time * 2.2) * 0.08);
    }
    if (current < 0) return;
    const p = playerPos();

    if (current === 0) {
      if (stage === 0) {
        if (player.state.inCar) {
          stage = 1;
          updateHudObjective();
          hud.showMessage('Now deliver it to the pier.', 3);
        }
      } else if (distToMarker() < 7 && player.state.inCar) {
        complete();
      }
    } else if (current === 1) {
      timer -= dt;
      if (wanted.level === 0) {
        complete();
      } else if (timer <= 0) {
        fail('the clock ran out with the cops still on you');
      }
    } else if (current === 2) {
      if (wanted.level >= MISSIONS.packageFailLevel) {
        fail('the heat hit level 3 — the client walked away');
        return;
      }
      if (stage === 0) {
        if (distToMarker() < 5) {
          hasPackage = true;
          stage = 1;
          setMarker(BEACH_HOUSE.x, BEACH_HOUSE.z, 0x7dff9b);
          hud.showMessage('Package secured. Deliver it to the beach house.', 4);
          updateHudObjective();
        }
      } else if (distToMarker() < 6) {
        complete();
      }
    } else if (current === 3) {
      timer -= dt;
      if (distToMarker() < 7) {
        checkpoint += 1;
        audio.pickup();
        if (checkpoint >= RACE_POINTS.length) {
          complete();
          return;
        }
        setMarker(RACE_POINTS[checkpoint].x, RACE_POINTS[checkpoint].z);
        hud.showMessage(`Checkpoint ${checkpoint + 1} of ${RACE_POINTS.length}`, 2);
      }
      if (timer <= 0) fail('out of time on the race');
    } else if (current === 4) {
      if (stage === 0) {
        if (player.state.inCar && ctx.isPoliceCar?.(player.state.inCar)) {
          stage = 1;
          updateHudObjective();
          hud.showMessage('Cruiser stolen! Bring it to the Sunset Motors lot.', 4);
        }
      } else if (distToMarker() < 7 && player.state.inCar) {
        complete();
      }
    }
    updateHudObjective();
  }

  return {
    DEFS,
    get active() {
      return current >= 0;
    },
    get current() {
      return current;
    },
    get marker() {
      return marker;
    },
    start,
    update,
    complete,
    fail,
    abort,
  };
}
