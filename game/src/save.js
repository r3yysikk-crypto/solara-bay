// Save / load: one localStorage slot holds Mara's career — cash, the
// missions she finished, the cars she owns, the packages she found, her
// stats and where she stood. Nothing leaves the browser.
const SAVE_KEY = 'solara-bay-save-v1';

export function createSave() {
  function blank() {
    return {
      cash: 250,
      missionsCompleted: [],
      currentMission: 0,
      ownedCars: [],
      packages: [],
      stats: {
        missionsDone: 0,
        carsStolen: 0,
        longestEscape: 0,
        shotsFired: 0,
        shotsHit: 0,
        packagesFound: 0,
      },
      player: { x: 0, z: 20, heading: 0 },
      savedAt: 0,
    };
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.cash !== 'number') return null;
      const merged = blank();
      return { ...merged, ...data, stats: { ...merged.stats, ...(data.stats ?? {}) } };
    } catch {
      return null;
    }
  }

  function save(data) {
    try {
      const copy = { ...data, savedAt: Date.now() };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
      return true;
    } catch {
      return false;
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // Private mode or a full store: the game still runs, just unsaved.
    }
  }

  return { blank, load, save, clear };
}
