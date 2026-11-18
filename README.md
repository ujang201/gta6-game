[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ujang201/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ujang201/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR BAY — a GTA-style open world in the browser

Sun-soaked coastal city, five chained heist missions, traffic, pedestrians,
a wanted system with police chases, and a full HUD with a live minimap.
Built with three.js (vendored, no network) as a static site — open
`game/index.html` in a desktop browser and play.

## Play

- **On foot:** WASD move, Shift run, E enter/exit car, F punch, Space or click shoot (pistol), mouse drag orbits the camera.
- **Driving:** WASD drive, Space handbrake. Steal any traffic car with E.
- **Wanted:** stealing cars, shooting and hurting pedestrians raise your heat (0–5 stars). Police spawn, chase and ram you. Lose them over time, hide, or pay $100 at the Pay-N-Spray garage on the south road.
- **Missions:** 1 First Wheels (steal a car, reach the meet) · 2 Getaway (lose 2-star heat, reach the safehouse) · 3 The Pickup (deal + rival shootout) · 4 Harbor Heist (marina truck run) · 5 The Big One (bank job finale). Cash rewards stack up; progress saves to localStorage.
- **P** pauses.

## Run it

```sh
node serve.ts   # then open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```

## Screenshots

Four staged shots (deterministic, `?shot=`): a police chase at 3-star heat,
Leo on foot downtown, a mission in progress, and the title menu.

<sub>Entered on [make.fun](https://make.fun/?ref=wfjv7kgb&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
