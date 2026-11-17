// shots.js — deterministic screenshot staging for Solmar Bay.
// ?shot=cover|street|mission|menu places the player, the traffic, the
// police and the mission in a fixed pose, steps the simulation a fixed
// number of frames from the fixed seed, then freezes it, so the same URL
// renders the same frame twice. The menu shot keeps the start screen up
// over a sunset beach view.

import { CITY_HALF } from './world.js';

const FIXED_STEPS = 150; // 2.5 s of simulated traffic/peds at 60 Hz
const DT = 1 / 60;

function placeDriving(game, x, z, heading, speed) {
  const car = game.traffic.nearestCar(x, z, 400) || game.traffic.cars[0];
  game.player.enterCar(car, () => {});
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = speed;
  car.syncMesh();
  game.player.x = x;
  game.player.z = z;
}

// Chase camera pinned behind the player's car after the staged steps.
function pinChaseCam(game, dist, height) {
  const car = game.player.inCar;
  const px = car ? car.x : game.player.x;
  const pz = car ? car.z : game.player.z;
  const heading = car ? car.heading : game.player.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  game.camera.position.set(px - fx * dist, height, pz - fz * dist);
  game.camera.lookAt(px + fx * 12, 1.8, pz + fz * 12);
}

function stageCover(game) {
  // High-speed chase down the central boulevard, three stars, two police
  // interceptors closing in behind, mission objective on the HUD.
  game.missions.index = 4;
  game.missions.start();
  game.missions.stage = 2; // lose the three-star heat
  game.police.addHeat(3.2, 'chase');
  placeDriving(game, 0, 90, 0, 30);
  // Interceptors start behind Leo and close in during the staged steps.
  game.police.spawnCarNear(0, 62);
  game.police.spawnCarNear(-8, 48);
  const c1 = game.police.cars[0];
  const c2 = game.police.cars[1];
  if (c1) { c1.x = -4; c1.z = 62; c1.heading = 0; c1.speed = 34; }
  if (c2) { c2.x = 5; c2.z = 48; c2.heading = 0; c2.speed = 32; }
  game.player.camYaw = Math.PI;
  game.hud.showBanner('THE BIG ONE', 'Lose the cops — reach the safehouse', 999);
  game.hud.feed('Vault cash secured: $3,000');
  game.hud.feed('SBPD on your tail — 3 stars');
  game.state = 'playing';
}

function stageStreet(game) {
  // Leo on foot on a downtown sidewalk corner, traffic and pedestrians
  // around him. (8, 8) is the sidewalk corner by the central intersection;
  // the camera sits on the road looking back at him.
  game.player.x = 8;
  game.player.z = 8;
  game.player.heading = Math.PI * 0.75;
  game.player.camYaw = Math.PI * 1.15;
  game.player.mesh.position.set(8, 0, 8);
  game.player.mesh.rotation.y = game.player.heading;
  game.missions.index = 0;
  game.state = 'playing';
  game.hud.feed('Welcome to Solmar Bay');
  // Stage two traffic cars and a pedestrian so they end the staged steps
  // right by the intersection Leo is standing on.
  const t = game.traffic.cars;
  if (t[0]) { t[0].x = 0; t[0].z = -45; t[0].heading = 0; t[0].speed = 9; t[0].target = { x: 0, z: 200 }; }
  if (t[1]) { t[1].x = 45; t[1].z = 0; t[1].heading = -Math.PI / 2; t[1].speed = 9; t[1].target = { x: -200, z: 0 }; }
  const ped = game.crowd.peds[0];
  if (ped) { ped.x = 13; ped.z = 14; ped.target = { x: 60, z: 60 }; }
}

function stageMission(game) {
  // Mid-mission: driving west along the harbour road toward the truck,
  // waypoint marker visible ahead.
  game.missions.index = 3;
  game.missions.start();
  game.missions.stage = 0; // steal the cargo truck at the harbour
  placeDriving(game, -150, -138, -Math.PI / 2, 18);
  game.player.camYaw = Math.PI;
  game.hud.showBanner('HARBOR HEIST', 'Steal the cargo truck at the harbour', 999);
  game.hud.feed('Rosa: the truck is in the harbour yard');
  game.state = 'playing';
}

function stageMenu(game) {
  // Start menu over the beach at sunset: Leo stands on the boardwalk.
  game.player.x = -CITY_HALF - 2;
  game.player.z = 40;
  game.player.heading = -Math.PI / 2;
  game.player.mesh.position.set(game.player.x, 0, game.player.z);
  game.player.mesh.rotation.y = game.player.heading;
  game.player.camYaw = Math.PI * 0.5;
  game.state = 'menu';
  game.showStartMenu();
  game.camera.position.set(-CITY_HALF + 22, 7, 62);
  game.camera.lookAt(-CITY_HALF - 30, 3, 30);
}

// Step the world a fixed number of frames, then freeze: the render loop
// keeps drawing the same state, so headless screenshots are stable.
export function stageShot(game, name) {
  game.shotMode = true;
  game.shotName = name;
  const fn = { cover: stageCover, street: stageStreet, mission: stageMission, menu: stageMenu }[name];
  if (!fn) return false;
  fn(game);
  // Briefings are for live play; a staged shot shows the action, not the popup.
  const briefing = document.getElementById('briefing');
  if (briefing) briefing.classList.add('hidden');
  game.state = name === 'menu' ? 'menu' : 'playing';
  if (name !== 'menu') {
    document.getElementById('hud').classList.remove('hidden');
  }
  for (let i = 0; i < FIXED_STEPS; i++) {
    game.stepWorld(DT);
  }
  // Freeze traffic motion for the shot but keep the pose.
  game.frozen = true;
  // The staged steps can rough Leo up (police rams); a screenshot should
  // show him at full health.
  game.player.health = 100;
  game.player.hurtFlash = 0;
  // Pin the camera for the shot so the frame does not drift.
  if (name === 'cover') {
    // Front-side angle: Leo's car in the foreground, the interceptors
    // visible behind it — the chase reads at a glance.
    const car = game.player.inCar;
    const px = car.x;
    const pz = car.z;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    game.camera.position.set(px + fx * 22 + 9, 5.5, pz + fz * 22);
    game.camera.lookAt(px, 1.8, pz);
  } else if (name === 'street') {
    game.camera.position.set(-2, 4.5, 22);
    game.camera.lookAt(8, 1.5, 8);
  } else if (name === 'mission') {
    pinChaseCam(game, 15, 7);
  }
  game.hud.mapTime = 1234567; // fixed minimap pulse
  game.renderOnce();
  return true;
}
