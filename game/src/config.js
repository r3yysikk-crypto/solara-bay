// Solara Bay: every tuning number for the city, the cars, the police and the
// wanted system lives here, so a balance change is one edit, not a hunt.
export const CITY = {
  blocks: 5, // blocks per side of the road grid
  blockSize: 62, // metres of buildings between two roads
  roadWidth: 14, // metres of asphalt per road
  sidewalk: 3, // metres of pavement hugging each road
  // The grid is centred on the origin; its outer edge is the playable bound.
  get span() {
    return this.blocks * this.blockSize + (this.blocks + 1) * this.roadWidth;
  },
  get half() {
    return this.span / 2;
  },
  // The bay sits past the south edge: sand, then open water.
  beachDepth: 46,
  waterDepth: 120,
};

export const COLOURS = {
  sky: 0x8ec9ee,
  fog: 0xa8d4f0,
  sun: 0xfff2d8,
  ground: 0x7fae62,
  sand: 0xe8d49a,
  water: 0x2f7fb8,
  road: 0x3a3f46,
  roadLine: 0xf5d76e,
  sidewalk: 0xb9b3a4,
  buildingGlass: 0x9fc6e8,
};

// Palette of sun-bleached building faces, drawn from Solara Bay's own look:
// white stucco, pastel hotels, terracotta roofs, glass towers.
export const BUILDING_PALETTE = [
  0xf2ead8, 0xe8d9b8, 0xdfe9ee, 0xf6c9a0, 0xc9d6c5,
  0xe8b4b8, 0xbfd9e2, 0xf0e0c0, 0xd8c8e8, 0x9fb8c8,
];

export const CAR_COLOURS = [
  0xd83a2e, 0x2e6fd8, 0xf2c230, 0x2fae6e, 0xe8e8e8,
  0x22242a, 0x8a5fd0, 0xe07b39, 0x3aa7a3, 0xc0c8d0,
];

export const PLAYER = {
  walkSpeed: 6, // m/s on foot
  runSpeed: 10, // m/s holding Shift
  radius: 0.6,
  maxHealth: 100,
};

export const CAR = {
  // Arcade handling: quick to answer, a little slide in the tail.
  engineAccel: 26, // m/s^2 at full throttle
  brakeAccel: 42,
  reverseAccel: 16,
  maxSpeed: 42, // m/s, about 150 km/h
  maxReverseSpeed: 12,
  drag: 0.55, // 1/s, rolling + air drag
  grip: 7.5, // how fast lateral velocity is killed (lower = more drift)
  steerMax: 0.55, // radians at standstill
  steerSpeed: 2.6, // radians/s the wheel turns
  radius: 1.9, // collision circle
  enterDistance: 4.2, // how close to press E and take a car
};

export const TRAFFIC = {
  carCount: 12,
  pedestrianCount: 16,
  carSpeed: 9,
  carSpeedVariance: 3,
  walkSpeed: 1.6,
};

// Wanted heat: crimes add heat, hiding sheds it. Levels gate the police.
export const WANTED = {
  stealCar: 30,
  hitPedestrian: 55,
  hitTrafficCar: 12,
  recklessNearMiss: 6,
  levelThresholds: [25, 60, 105], // heat needed for level 1, 2, 3
  decayPerSecond: 2.2, // heat lost while unseen and quiet
  escapeRadius: 70, // no police inside this range counts as hiding
  escapeSeconds: 4, // hiding this long drops one level
  maxHeat: 140,
};

export const POLICE = {
  // How many units chase at each wanted level (index = level).
  unitsPerLevel: [0, 2, 4, 6],
  patrol: { maxSpeed: 40, accel: 24, colour: 0x1c2733, livery: 0xf2f2f2 },
  interceptor: { maxSpeed: 47, accel: 30, colour: 0x14161c, livery: 0xd83a2e },
  ramDamage: 6, // health lost when a unit rams the player's car hard
  ramCooldown: 0.8, // seconds between rams from one unit
  bustDistance: 3.0, // a unit this close to the player on foot starts a bust
  bustSeconds: 1.6, // seconds inside bust distance to get busted
  despawnDistance: 260, // units further than this from the player give up
  roadblockAtLevel: 3, // level that calls in a roadblock ahead of the player
};

export const CAMERA = {
  driveDistance: 11,
  driveHeight: 4.6,
  footDistance: 7,
  footHeight: 3.2,
  smoothing: 5.5, // 1/s lerp toward the ideal spot
  lookAhead: 6,
};
