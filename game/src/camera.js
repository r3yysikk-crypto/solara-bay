// The chase camera: it hangs behind the car (or the walker), swings smoothly
// when they turn, and looks a little ahead so the road reads. A crash adds a
// short shake; nothing here ever snaps.
import { CAMERA } from './config.js';

export function createCamera(camera) {
  let yaw = 0;
  let shake = 0;
  let framing = null; // { distance, height } override, used by the shots
  const ideal = new THREE.Vector3();
  const look = new THREE.Vector3();

  function framingFor(driving) {
    if (framing) return framing;
    return {
      distance: driving ? CAMERA.driveDistance : CAMERA.footDistance,
      height: driving ? CAMERA.driveHeight : CAMERA.footHeight,
    };
  }

  function update(dt, target, driving) {
    const { distance, height } = framingFor(driving);
    // The camera yaw eases toward the target's heading instead of snapping.
    let diff = target.heading - yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    yaw += diff * Math.min(1, CAMERA.smoothing * 0.55 * dt);

    ideal.set(
      target.x - Math.sin(yaw) * distance,
      height,
      target.z - Math.cos(yaw) * distance,
    );
    const k = Math.min(1, CAMERA.smoothing * dt);
    camera.position.lerp(ideal, k);
    look.set(
      target.x + Math.sin(target.heading) * CAMERA.lookAhead,
      1.2,
      target.z + Math.cos(target.heading) * CAMERA.lookAhead,
    );
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      camera.position.x += (Math.random() - 0.5) * shake * 0.9;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    }
    camera.lookAt(look);
  }

  // The title screen's slow orbit over the city: the bay, the grid and the
  // skyline, with no player standing in the panel's way.
  function updateTitle(dt, time) {
    const angle = time * 0.045;
    const radius = 165;
    camera.position.set(Math.sin(angle) * radius, 62, 40 + Math.cos(angle) * radius);
    camera.lookAt(0, 4, 30);
  }

  function snap(target, driving) {
    const { distance, height } = framingFor(driving);
    yaw = target.heading;
    camera.position.set(
      target.x - Math.sin(yaw) * distance,
      height,
      target.z - Math.cos(yaw) * distance,
    );
  }

  function setFraming(distance, height) {
    framing = { distance, height };
  }

  function clearFraming() {
    framing = null;
  }

  function addShake(amount) {
    shake = Math.min(0.7, shake + amount);
  }

  function getYaw() {
    return yaw;
  }

  return { update, updateTitle, snap, setFraming, clearFraming, addShake, getYaw };
}
