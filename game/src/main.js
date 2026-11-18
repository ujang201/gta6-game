// Solmar Bay — entry point. Builds the city, wires every system together
// and runs the frame loop: menu, free roam, missions, busted and wasted.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createTraffic, updateTraffic } from './vehicles.js';
import { createPeds, updatePeds } from './peds.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solmarbay-save-v1';
const $ = (id) => document.getElementById(id);

// Any uncaught error lands in #error-box so a headless play-test can see it.
window.addEventListener('error', (e) => {
  const box = $('error-box');
  if (box) box.textContent = `ERROR: ${e.message}`;
});

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = Number(params.get('seed') || 1);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = 'game-canvas';
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(-205, 14, 60);

const input = createInput(renderer.domElement);
const audio = createAudio();
const hud = createHud();
const world = buildWorld(scene);
const traffic = createTraffic(world, scene, 14);
const peds = createPeds(world, scene, 20);
const police = createPolice(world, scene);
const player = createPlayer(world, scene, input);
const missions = createMissions({ world, scene, player, police, hud, audio, peds });
const game = {
  world, scene, player, police, missions, traffic, peds, hud, audio, camera,
  state: 'menu',
  shotMode: false,
  fixedTime: 1.6,
  now: 0,
  missionTruck: null,
  elapsed: 0,
  saveTimer: 0,
  inSpray: false,
  inHouse: false,
};

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: player.cash,
      health: player.health,
      ammo: player.ammo,
      missionIndex: missions.index,
      x: player.pos.x,
      z: player.pos.z,
      heading: player.heading,
    }));
  } catch (e) {
    // Saving is a nicety; a full or blocked store must not break the game.
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function applySave(s) {
  if (!s) return;
  player.cash = s.cash ?? 250;
  player.health = s.health ?? 100;
  player.ammo = s.ammo ?? 24;
  player.armed = player.ammo > 0;
  missions.index = (s.missionIndex ?? -1);
  missions.active = false;
  player.pos.set(s.x ?? 0, 0, s.z ?? 40);
  player.heading = s.heading ?? 0;
  player.camYaw = player.heading + Math.PI;
  if (missions.index >= 0 && missions.index < 5) {
    hud.setObjective('', 'Press M to start the next job.');
  }
}

function startPlaying(fresh) {
  if (fresh) {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
    player.cash = 250;
    player.health = 100;
    player.ammo = 24;
    player.armed = false;
    missions.index = -1;
    missions.active = false;
    player.pos.set(0, 0, 40);
    player.heading = 0;
    player.camYaw = Math.PI;
    police.clearWanted();
    player.onFoot = true;
    player.mesh.visible = true;
    if (player.car) {
      player.car.stolen = false;
      player.car = null;
    }
    hud.setObjective('SOLMAR BAY', 'Welcome to Solmar Bay. Press M to start the first job.');
  }
  game.state = 'playing';
  hud.showOnly(null);
  audio.ensure();
}

function showMenu() {
  game.state = 'menu';
  hud.showOnly('menu');
  const cont = $('btn-continue');
  if (cont) cont.classList.toggle('hidden', !loadGame());
}

function wasted() {
  game.state = 'wasted';
  audio.fail();
  hud.showOnly('wasted');
  player.health = 50;
  player.cash = Math.max(0, player.cash - 100);
  police.clearWanted();
}

function busted() {
  if (game.state !== 'playing') return;
  game.state = 'busted';
  audio.fail();
  hud.showOnly('busted');
  player.cash = Math.max(0, player.cash - 150);
  police.clearWanted();
  if (player.car) {
    player.car.stolen = false;
    player.car = null;
    player.onFoot = true;
    player.mesh.visible = true;
  }
  player.pos.set(world.spots.safehouse.x, 0, world.spots.safehouse.z);
}

// --- Combat: what a punch and a pistol shot actually hit. ---
function nearestTarget(origin, dir, maxDist, maxAngle) {
  let best = null;
  let bestD = maxDist;
  const targets = [];
  for (const p of peds) if (p.hp > 0) targets.push({ obj: p, kind: p.rival ? 'rival' : 'ped' });
  for (const c of police.cops) targets.push({ obj: c, kind: 'cop' });
  for (const t of targets) {
    const dx = t.obj.pos.x - origin.x;
    const dy = 1.3 - origin.y;
    const dz = t.obj.pos.z - origin.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > bestD) continue;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
    if (dot < Math.cos(maxAngle)) continue;
    bestD = d;
    best = { ...t, dist: d, point: { x: t.obj.pos.x, y: 1.3, z: t.obj.pos.z } };
  }
  return best;
}

function shoot(pl) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  const hit = nearestTarget(origin, dir, 45, 0.14);
  const gunPos = new THREE.Vector3(pl.pos.x, 1.1, pl.pos.z);
  const end = hit
    ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)
    : origin.clone().add(dir.clone().multiplyScalar(40));
  const posAttr = pl.tracer.geometry.getAttribute('position');
  posAttr.setXYZ(0, gunPos.x, gunPos.y, gunPos.z);
  posAttr.setXYZ(1, end.x, end.y, end.z);
  posAttr.needsUpdate = true;
  pl.tracer.material.opacity = 0.9;
  pl.muzzle.position.set(gunPos.x, gunPos.y, gunPos.z);
  pl.muzzle.intensity = 4;
  game.lastGunshot = { x: pl.pos.x, z: pl.pos.z };
  police.addHeat(3);
  if (!hit) return;
  hit.obj.hp -= 34;
  if (hit.obj.hp <= 0) {
    hit.obj.mesh.visible = false;
    if (hit.kind === 'rival') {
      hud.feed('Rival down');
    } else if (hit.kind === 'cop') {
      police.addHeat(22);
      hud.feed('You shot a cop — the whole department is coming');
    } else {
      police.addHeat(10);
      hud.feed('Pedestrian down — witnesses called it in');
    }
  }
}

function punch(pl) {
  const fwd = { x: Math.sin(pl.heading), z: Math.cos(pl.heading) };
  let best = null;
  let bestD = 2.4;
  const targets = [];
  for (const p of peds) if (p.hp > 0) targets.push({ obj: p, kind: p.rival ? 'rival' : 'ped' });
  for (const c of police.cops) targets.push({ obj: c, kind: 'cop' });
  for (const t of targets) {
    const dx = t.obj.pos.x - pl.pos.x;
    const dz = t.obj.pos.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    const dot = (dx * fwd.x + dz * fwd.z) / (d || 1);
    if (dot < 0.4) continue;
    bestD = d;
    best = t;
  }
  if (!best) return;
  best.obj.hp -= 25;
  if (best.obj.hp <= 0) {
    best.obj.mesh.visible = false;
    if (best.kind === 'cop') police.addHeat(18);
    else if (best.kind === 'ped') police.addHeat(8);
  }
}

const ctx = {
  camera, audio, hud, traffic, police,
  get missionTruck() {
    return game.missionTruck;
  },
  punch, shoot,
};

// --- Menu wiring. ---
$('btn-new').addEventListener('click', () => {
  audio.ensure();
  audio.click();
  startPlaying(true);
});
$('btn-continue').addEventListener('click', () => {
  audio.ensure();
  audio.click();
  applySave(loadGame());
  startPlaying(false);
});
$('btn-sound').addEventListener('click', (e) => {
  audio.ensure();
  const m = audio.toggleMute();
  e.target.textContent = m ? '🔇 Sound: Off' : '🔊 Sound: On';
});
$('btn-resume').addEventListener('click', () => {
  game.state = 'playing';
  hud.showOnly(null);
  audio.click();
});
$('btn-quit').addEventListener('click', () => {
  saveGame();
  showMenu();
});
$('btn-busted-ok').addEventListener('click', () => {
  audio.click();
  startPlaying(false);
});
$('btn-wasted-ok').addEventListener('click', () => {
  audio.click();
  player.pos.set(world.spots.hospital.x, 0, world.spots.hospital.z);
  startPlaying(false);
});
$('btn-complete-ok').addEventListener('click', () => {
  audio.click();
  hud.showOnly(null);
  game.state = 'playing';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Frame loop. ---
const clock = new THREE.Clock();
let frames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = game.shotMode ? game.fixedTime : game.elapsed;
  game.now = t;
  missions.clock = t;

  if (game.state === 'playing') {
    game.elapsed += dt;
    player.update(dt, ctx);
    updateTraffic(traffic, world, dt);
    updatePeds(peds, world, dt, player.pos, game.lastGunshot || null);
    game.lastGunshot = null;
    police.update(dt, t, player, busted, (d) => {
      if (player.damage(player.onFoot ? 9 : 7)) wasted();
      else hud.hurtFlash();
    });
    missions.update(dt);

    // Rivals shoot back.
    for (const r of missions.rivals) {
      if (r.hp <= 0) continue;
      r.shootCooldown -= dt;
      const d = Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z);
      if (r.shootCooldown <= 0 && d < 32) {
        r.shootCooldown = 1.3 + Math.random() * 0.9;
        if (player.damage(5 + Math.floor(Math.random() * 5))) wasted();
        else hud.hurtFlash();
        if (d < 40) audio.shot();
      }
    }

    // Running over a pedestrian is a crime, and a tragedy.
    if (!player.onFoot && player.car) {
      for (const p of peds) {
        if (p.hp <= 0 || p.rival) continue;
        const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
        if (d < 1.6 && Math.abs(player.car.speed) > 4) {
          p.hp = 0;
          p.mesh.visible = false;
          police.addHeat(10);
          hud.feed('You ran over a pedestrian!');
        }
      }
      // Bumping traffic slows you down.
      for (const c of traffic) {
        if (c.stolen || c === player.car) continue;
        const d = Math.hypot(c.mesh.position.x - player.pos.x, c.mesh.position.z - player.pos.z);
        if (d < 3.4) {
          player.car.speed *= 0.94;
          c.mesh.position.x += (c.mesh.position.x - player.pos.x) * 0.02;
          c.mesh.position.z += (c.mesh.position.z - player.pos.z) * 0.02;
        }
      }
    }

    // Pay-N-Spray: drive in with heat and $100, drive out clean.
    const spray = world.spots.paynspray;
    const inSprayNow = Math.hypot(player.pos.x - spray.x, player.pos.z - spray.z) < 9;
    if (inSprayNow && !game.inSpray && police.wanted > 0 && player.cash >= 100) {
      player.cash -= 100;
      police.clearWanted();
      hud.feed('Pay-N-Spray: $100 — heat gone');
      audio.cash();
    }
    game.inSpray = inSprayNow;

    // Safehouse: heal up, restock ammo, cool off.
    const house = world.spots.safehouse;
    const inHouseNow = Math.hypot(player.pos.x - house.x, player.pos.z - house.z) < 9;
    if (inHouseNow && !game.inHouse) {
      player.heal(100);
      player.ammo = 24;
      player.armed = true;
      hud.feed('Safehouse — healed up, ammo restocked');
      audio.pickup();
    }
    game.inHouse = inHouseNow;

    // Missions start with M; pause with P or Escape.
    if (input.wasPressed('KeyM')) {
      if (!missions.active) {
        missions.startNext();
        if (missions.index >= 5) {
          game.state = 'complete';
          hud.showOnly('complete');
          audio.sting();
        }
      }
    }
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      game.state = 'paused';
      hud.showOnly('pause');
      saveGame();
    }

    // HUD refresh.
    hud.setStars(police.wanted);
    hud.setCash(player.cash);
    hud.setAmmo(player.ammo);
    hud.setHealth(player.health);
    hud.setSpeed(player.onFoot ? 0 : Math.abs(player.car ? player.car.speed : 0) * 3.2, player.onFoot ? '' : (player.car ? player.car.name : ''));
    hud.drawMinimap(world, player, missions.waypoint(), police, t);

    game.saveTimer += dt;
    if (game.saveTimer > 12) {
      game.saveTimer = 0;
      saveGame();
    }
  } else if (game.state === 'menu') {
    // Slow drift over the beach so the menu is alive behind the title.
    const a = game.elapsed * 0.05;
    game.elapsed += dt;
    camera.position.set(-205 + Math.sin(a) * 12, 14 + Math.sin(a * 0.7) * 2, 60 + Math.cos(a) * 8);
    camera.lookAt(-100, 12, 0);
  }

  world.update(dt, t);
  input.endFrame();
  renderer.render(scene, camera);
  frames += 1;
}

// Boot: shot staging skips the menu entirely.
if (shotName) {
  stageShot(game, shotName);
  hud.setStars(police.wanted);
  hud.setCash(player.cash);
  hud.setAmmo(player.ammo);
  hud.setHealth(player.health);
} else {
  showMenu();
}
animate();

// Exposed for the play-test driver.
window.__solmar = { game, player, police, missions };
