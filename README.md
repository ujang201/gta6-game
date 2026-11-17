# Solmar Bay — Make GTA 6 (gta6-01)

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ujang201/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ujang201/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game in the browser. Leo Marin, a hire driver
in the fictional sunset city of **Solmar Bay**, gets pulled into the Marlin
Crew's five-job spree: steal cars, lose the cops, survive a rival crew, rob
the harbour, and hit the Solmar Bay Bank.

Play it: serve `game/` with any static server and open `index.html`.
No build step, no network requests at play time — three.js is vendored
under `game/vendor/`.

## What is in the game

- **A procedural city** — a 10×10 block grid built from a fixed seed:
  towers and low blocks with runtime-painted window textures, palm trees,
  a beach and the sea on the west edge, sunset lighting and fog.
- **On foot and behind the wheel** — WASD + mouse orbit camera, Shift to
  run, E to steal/enter any traffic car (and step out again), Space as
  handbrake, F to punch, click/Space to fire the pistol.
- **Traffic & pedestrians** — 14 AI cars looping the road grid, 20
  pedestrians strolling the sidewalks who flee gunfire.
- **Wanted system** — 0–5 stars, police interceptors that chase and ram,
  foot officers at high heat. Heat cools while you lay low; a blue
  Pay-N-Spray bay clears it for $100; the safehouse heals you.
- **Five chained story missions** with briefings, waypoint markers,
  objectives and cash payouts: First Wheels, Getaway, The Pickup,
  Harbor Heist, The Big One.
- **HUD** — live canvas minimap (roads, player arrow, mission waypoint,
  police dots, Pay-N-Spray bays, safehouse), wanted stars, cash, health,
  speed, ammo, objective banner and message feed.
- **Menus & save** — start menu (New Game / Continue), pause, mission
  briefings, Busted/Wasted screens, progress saved to localStorage.
- **Sound** — 100% procedural WebAudio: engine hum, sirens, gunshots,
  crashes, cash and UI blips. No audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD | Walk / drive |
| Mouse (drag or click to lock) | Look around |
| Shift | Run |
| E | Enter / steal a car, step out |
| Space | Handbrake (driving) / shoot (on foot) |
| Click | Shoot |
| F | Punch |
| M | Start the next job |
| P / Esc | Pause |

## Tech

- three.js r160 (vendored as `game/vendor/three.module.min.js`)
- ES modules in `game/src/`, one file per system: `world`, `player`,
  `vehicles`, `peds`, `police`, `missions`, `hud`, `audio`, `input`,
  `random`, `shots`
- Screenshots are staged deterministically with `?shot=cover|street|mission|menu`

## Bounty

Built for the make.fun bounty [Make GTA 6](https://make.fun/bounty/gta6-01)
— referral: https://make.fun/r/wfjv7kgb

---

<sub>Entered on [make.fun](https://make.fun/?ref=wfjv7kgb&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## License

MIT — see `LICENSE`. All names, characters, art and sounds are original;
nothing is taken from any commercial game.
