// The wanted system: crimes add heat, hiding sheds it, and the heat maps to
// a wanted level of 0-3. The level is what the HUD stars show and what the
// police manager answers to.
import { WANTED } from './config.js';

export function createWantedSystem() {
  let heat = 0;
  let level = 0;
  let hiddenTimer = 0;
  const listeners = [];

  function levelFor(value) {
    if (value >= WANTED.levelThresholds[2]) return 3;
    if (value >= WANTED.levelThresholds[1]) return 2;
    if (value >= WANTED.levelThresholds[0]) return 1;
    return 0;
  }

  function setHeat(value) {
    const next = Math.max(0, Math.min(WANTED.maxHeat, value));
    const nextLevel = levelFor(next);
    const changed = nextLevel !== level;
    heat = next;
    level = nextLevel;
    if (changed) {
      for (const fn of listeners) fn(level);
    }
    return changed;
  }

  return {
    get heat() {
      return heat;
    },
    get level() {
      return level;
    },
    onLevelChange(fn) {
      listeners.push(fn);
    },
    // A crime with a name the HUD can announce: stealing, hitting a
    // pedestrian, smashing into traffic, a reckless near miss.
    addHeat(amount, reason) {
      setHeat(heat + amount);
      return { level, reason };
    },
    // Called every frame: while no police unit is near, the escape timer
    // runs and the heat drains fast; while the heat is low it drains slowly.
    update(dt, nearestPoliceDistance) {
      if (level === 0) return;
      if (nearestPoliceDistance > WANTED.escapeRadius) {
        hiddenTimer += dt;
        if (hiddenTimer >= WANTED.escapeSeconds) {
          setHeat(heat - 26 * dt);
          if (heat <= 0) hiddenTimer = 0;
        }
      } else {
        hiddenTimer = 0;
        setHeat(heat - WANTED.decayPerSecond * 0.25 * dt);
      }
    },
    clear() {
      setHeat(0);
      hiddenTimer = 0;
    },
  };
}
