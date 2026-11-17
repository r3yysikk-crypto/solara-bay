// The HUD: wanted stars, speed, health and a live minimap, plus the title,
// pause and busted screens. Everything is plain DOM over the canvas, so it
// costs the game no 3D work and stays readable at a glance.
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
  const resumeButton = document.getElementById('resume-button');
  const restartButton = document.getElementById('restart-button');
  const hint = document.getElementById('hint');

  let messageTimer = 0;

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

  // The minimap: the road grid, the bay, the player arrow, police blips and
  // traffic dots, all drawn on a 2D canvas in the corner.
  function drawMinimap(player, policeUnits, trafficCars) {
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
    drawMinimap(snapshot.player, snapshot.police, snapshot.traffic);
  }

  return {
    showMessage,
    setWanted,
    setSpeed,
    setHealth,
    setCash,
    setHint,
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
    buttons: { startButton, resumeButton, restartButton },
  };
}
