// The HUD: wanted stars, speed, health, cash, mission objective, ammo and
// a live minimap, plus the title, pause and busted screens. Everything is
// plain DOM over the canvas, so it costs the game no 3D work and stays
// readable at a glance. Damage numbers project from the world onto the
// screen; the minimap also shows the mission beacon, hidden packages and
// the Sunset Motors lot.
import { CITY } from './config.js';

export function createHud() {
  const stars = document.getElementById('wanted-stars');
  const speed = document.getElementById('speed');
  const speedUnit = document.getElementById('speed-unit');
  const healthFill = document.getElementById('health-fill');
  const cash = document.getElementById('cash');
  const message = document.getElementById('message');
  const minimap = document.getElementById('minimap');
  const mapCtx = minimap.getContext('2d');
  const title = document.getElementById('title-screen');
  const pause = document.getElementById('pause-screen');
  const busted = document.getElementById('busted-screen');
  const bustedText = document.getElementById('busted-text');
  const startButton = document.getElementById('start-button');
  const continueButton = document.getElementById('continue-button');
  const resumeButton = document.getElementById('resume-button');
  const restartButton = document.getElementById('restart-button');
  const quitButton = document.getElementById('quit-button');
  const missionList = document.getElementById('mission-list');
  const statsLine = document.getElementById('stats-line');
  const hint = document.getElementById('hint');
  const objective = document.getElementById('objective');
  const objectiveTitle = document.getElementById('objective-title');
  const objectiveText = document.getElementById('objective-text');
  const objectiveDist = document.getElementById('objective-dist');
  const ammo = document.getElementById('ammo');
  const packages = document.getElementById('packages');
  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  const damageFlash = document.getElementById('damage-flash');
  const damageLayer = document.getElementById('damage-numbers');

  let messageTimer = 0;
  let hitTimer = 0;
  let flashOpacity = 0;

  // A pool of floating damage numbers, reused so the DOM never churns.
  const damagePool = [];
  for (let i = 0; i < 8; i++) {
    const el = document.createElement('div');
    el.className = 'damage-number';
    el.style.display = 'none';
    damageLayer.appendChild(el);
    damagePool.push({ el, timer: 0, x: 0, y: 0 });
  }
  let damageCursor = 0;

  function showMessage(text, seconds = 3) {
    message.textContent = text;
    message.style.opacity = '1';
    messageTimer = seconds;
  }

  function setWanted(level) {
    let text = '';
    for (let i = 0; i < 3; i++) text += i < level ? '★' : '☆';
    stars.textContent = text;
    stars.className = level > 0 ? `wanted level-${level}` : 'wanted';
  }

  function setSpeed(kmh, driving) {
    speed.textContent = String(Math.round(Math.abs(kmh)));
    speedUnit.textContent = driving ? 'km/h' : '';
    speed.style.display = driving ? '' : 'none';
    speedUnit.style.display = driving ? '' : 'none';
  }

  function setHealth(value) {
    healthFill.style.width = `${Math.max(0, Math.min(100, value))}%`;
    healthFill.className = value < 30 ? 'low' : '';
  }

  function setCash(value) {
    cash.textContent = `$${value.toLocaleString('en-US')}`;
  }

  function setHint(text) {
    hint.textContent = text;
    hint.style.opacity = text ? '1' : '0';
  }

  function setObjective(obj) {
    if (!obj) {
      objective.style.display = 'none';
      return;
    }
    objective.style.display = 'block';
    objectiveTitle.textContent = obj.title;
    objectiveText.textContent = obj.text;
    objectiveDist.textContent = [
      obj.distance != null ? `${obj.distance} m` : '',
      obj.timer != null ? `${obj.timer}s` : '',
    ].filter(Boolean).join(' · ');
  }

  function setWeapon(weapon, ammoCount) {
    if (weapon === 'pistol') {
      ammo.textContent = `PISTOL  ${ammoCount} / 12`;
      ammo.style.display = 'block';
    } else {
      ammo.textContent = 'FISTS';
      ammo.style.display = 'block';
    }
  }

  function setPackages(found, total) {
    packages.textContent = `PACKAGES  ${found}/${total}`;
  }

  function setCrosshair(visible) {
    crosshair.style.display = visible ? 'block' : 'none';
  }

  function showHitmarker() {
    hitmarker.style.opacity = '1';
    hitTimer = 0.25;
  }

  function flashDamage() {
    flashOpacity = 0.55;
    damageFlash.style.opacity = String(flashOpacity);
  }

  // A damage number floats up from where the hit landed on screen.
  function showDamage(worldPos, camera, text) {
    const v = new THREE.Vector3(worldPos.x, 2.2, worldPos.z);
    v.project(camera);
    if (v.z > 1) return;
    const slot = damagePool[damageCursor];
    damageCursor = (damageCursor + 1) % damagePool.length;
    slot.el.textContent = text;
    slot.x = (v.x * 0.5 + 0.5) * window.innerWidth;
    slot.y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    slot.el.style.left = `${slot.x}px`;
    slot.el.style.top = `${slot.y}px`;
    slot.el.style.display = 'block';
    slot.el.style.opacity = '1';
    slot.timer = 0.8;
  }

  function setStats(stats) {
    if (!statsLine) return;
    const acc = stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;
    statsLine.textContent = `Jobs done ${stats.missionsDone} · Cars stolen ${stats.carsStolen} · Longest escape ${Math.round(stats.longestEscape)}s · Packages ${stats.packagesFound}/10 · Accuracy ${acc}%`;
  }

  function setMissionList(missions, onStart) {
    if (!missionList) return;
    missionList.innerHTML = '';
    missions.DEFS.forEach((def, i) => {
      const done = missions.completed?.includes(i);
      const btn = document.createElement('button');
      btn.className = 'mission-row';
      btn.textContent = `${done ? '✓ ' : ''}${def.title}`;
      btn.addEventListener('click', () => onStart(i));
      missionList.appendChild(btn);
    });
  }

  // The minimap: the road grid, the bay, the player arrow, police blips,
  // traffic dots, the mission beacon, hidden packages and the car lot.
  function drawMinimap(player, policeUnits, trafficCars, extra = {}) {
    const w = minimap.width;
    const h = minimap.height;
    const span = CITY.span + CITY.beachDepth + 60;
    const toMap = (x, z) => [
      ((x + span / 2) / span) * w,
      ((z + span / 2) / span) * h,
    ];
    mapCtx.fillStyle = 'rgba(20, 30, 40, 0.85)';
    mapCtx.fillRect(0, 0, w, h);
    // The bay along the bottom edge.
    mapCtx.fillStyle = '#2f7fb8';
    const [, bayY] = toMap(0, CITY.half + CITY.beachDepth / 2);
    mapCtx.fillRect(0, bayY, w, h - bayY);
    // Roads.
    mapCtx.strokeStyle = '#8a8f96';
    mapCtx.lineWidth = 2;
    const half = CITY.half;
    const pitch = 76;
    for (let i = 0; i <= 5; i++) {
      const c = -half + 7 + i * pitch;
      const [x1, y1] = toMap(c, -half);
      const [x2, y2] = toMap(c, half);
      mapCtx.beginPath();
      mapCtx.moveTo(x1, y1);
      mapCtx.lineTo(x2, y2);
      mapCtx.stroke();
      const [hx1, hy1] = toMap(-half, c);
      const [hx2, hy2] = toMap(half, c);
      mapCtx.beginPath();
      mapCtx.moveTo(hx1, hy1);
      mapCtx.lineTo(hx2, hy2);
      mapCtx.stroke();
    }
    // Hidden packages as green dots.
    if (extra.collectibles) {
      mapCtx.fillStyle = '#7dff9b';
      for (const item of extra.collectibles) {
        if (item.found) continue;
        const [mx, my] = toMap(item.x, item.z);
        mapCtx.fillRect(mx - 2, my - 2, 4, 4);
      }
    }
    // Sunset Motors lot as a white square.
    if (extra.garage) {
      const [gx, gy] = toMap(extra.garage.x, extra.garage.z);
      mapCtx.fillStyle = '#ffffff';
      mapCtx.fillRect(gx - 3, gy - 3, 6, 6);
    }
    // Traffic as pale dots.
    mapCtx.fillStyle = '#cfd6dd';
    for (const car of trafficCars) {
      const [mx, my] = toMap(car.mesh.position.x, car.mesh.position.z);
      mapCtx.fillRect(mx - 1, my - 1, 2, 2);
    }
    // Police as flashing blue-red blips.
    for (const unit of policeUnits) {
      const [mx, my] = toMap(unit.vehicle.state.x, unit.vehicle.state.z);
      mapCtx.fillStyle = Math.sin(performance.now() / 150) > 0 ? '#ff3b30' : '#3b82f6';
      mapCtx.beginPath();
      mapCtx.arc(mx, my, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // The mission beacon as a pulsing yellow diamond.
    if (extra.marker) {
      const [mx, my] = toMap(extra.marker.x, extra.marker.z);
      const pulse = 5 + Math.sin(performance.now() / 200) * 1.5;
      mapCtx.fillStyle = '#ffd23f';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, my - pulse);
      mapCtx.lineTo(mx + pulse, my);
      mapCtx.lineTo(mx, my + pulse);
      mapCtx.lineTo(mx - pulse, my);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // The player: a yellow arrow pointing where they face.
    const [px, py] = toMap(player.x, player.z);
    mapCtx.save();
    mapCtx.translate(px, py);
    // The arrow is drawn pointing up; rotate it so it faces the heading.
    // Heading is atan2(dx, dz) on the map, canvas y grows downward.
    mapCtx.rotate(Math.PI - player.heading);
    mapCtx.fillStyle = '#ffd23f';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4, 5);
    mapCtx.lineTo(-4, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  function update(dt, snapshot) {
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) message.style.opacity = '0';
    }
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) hitmarker.style.opacity = '0';
    }
    if (flashOpacity > 0) {
      flashOpacity = Math.max(0, flashOpacity - dt * 1.8);
      damageFlash.style.opacity = String(flashOpacity);
    }
    for (const slot of damagePool) {
      if (slot.timer > 0) {
        slot.timer -= dt;
        slot.y -= dt * 46;
        slot.el.style.top = `${slot.y}px`;
        slot.el.style.opacity = String(Math.max(0, slot.timer / 0.8));
        if (slot.timer <= 0) slot.el.style.display = 'none';
      }
    }
    drawMinimap(snapshot.player, snapshot.police, snapshot.traffic, snapshot.extra ?? {});
  }

  return {
    showMessage,
    setWanted,
    setSpeed,
    setHealth,
    setCash,
    setHint,
    setObjective,
    setWeapon,
    setPackages,
    setCrosshair,
    showHitmarker,
    flashDamage,
    showDamage,
    setStats,
    setMissionList,
    update,
    screens: {
      showTitle() {
        title.style.display = 'flex';
        pause.style.display = 'none';
        busted.style.display = 'none';
      },
      showPause() {
        pause.style.display = 'flex';
      },
      hidePause() {
        pause.style.display = 'none';
      },
      showBusted(text) {
        bustedText.textContent = text;
        busted.style.display = 'flex';
      },
      hideBusted() {
        busted.style.display = 'none';
      },
      hideTitle() {
        title.style.display = 'none';
      },
    },
    buttons: { startButton, continueButton, resumeButton, restartButton, quitButton },
  };
}
