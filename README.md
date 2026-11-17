# Solara Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game set in Solara Bay, a sun-soaked coastal
city. Walk the streets, take any car you can reach, and outrun the Solara Bay
Police Department while your wanted level climbs from one star to three.
Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no
network: the whole game is static files under `game/`.

## Play

- **W A S D** — walk / drive
- **Shift** — run
- **E** — take a car / get out (parked cars, traffic, even a stopped cruiser)
- **Space** — handbrake (a little drift)
- **H** — horn
- **P** — pause

Stealing a car, hitting a pedestrian or smashing into traffic raises your
wanted level. Lose the police by getting out of their sight for a few
seconds and the heat cools off. At wanted level 3 the police set up a
roadblock ahead of you.

## Structure

- `game/index.html` — the page, HUD and screens
- `game/vendor/three.min.js` — vendored Three.js r149 (offline)
- `game/src/config.js` — every tuning number
- `game/src/world.js` — the city: roads, buildings, beach, bay
- `game/src/vehicles.js` — car meshes and the arcade driving model
- `game/src/traffic.js` — traffic cars and pedestrians
- `game/src/player.js` — walking, entering and leaving cars
- `game/src/wanted.js` — wanted heat and levels 1–3
- `game/src/police.js` — patrol sedans, interceptors, roadblocks, busts
- `game/src/hud.js` — stars, speed, health, minimap, screens
- `game/src/camera.js` — the smooth chase camera
- `game/src/audio.js` — synthesised WebAudio: engine, sirens, crashes
- `game/src/input.js` — keyboard input
- `game/src/main.js` — boot and the game loop

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
