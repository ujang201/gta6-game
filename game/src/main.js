// SOLMAR BAY — main game loop and wiring.
// Three.js open-world crime game: Leo steals cars, runs missions, dodges the law.
import * as THREE from 'three';
import { RNG, clamp } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { buildWorld } from './world.js';
import { Traffic, Drivable } from './vehicles.js';
import { Peds } from './peds.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { shotParams, stageShot } from './shots.js';

const SAVE_KEY = 'solmarbay-save-v1';
const SEED = 1337;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 8, -14);

    this.rng = new RNG(SEED);
    this.world = buildWorld(this.scene, this.rng);
    this.input = new Input(this.canvas);
    this.audio = new AudioSys();
    this.hud = new HUD();
    this.traffic = new Traffic(this.scene, this.world, this.rng);
    this.peds = new Peds(this.scene, this.world, this.rng);
    this.player = new Player(this.scene, this.world);
    this.drivable = new Drivable(this.scene, 0x888888, false);
    this.drivable.hide();
    this.police = new Police(this.scene, this.world, this.rng);
    this.missions = new Missions(this.scene, this.world, this.rng);

    // tracer line for gunshots (shown briefly)
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ]);
    this.tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe08a }));
    this.tracer.visible = false;
    this.scene.add(this.tracer);
    this.tracerTimer = 0;

    this.state = 'menu'; // menu | playing | paused | busted | wasted | won
    this.shot = shotParams();
    this.camPos = new THREE.Vector3(0, 8, -14);
    this.errors = [];
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));

    // mission wiring
    this.missions.onReward = (amt) => {
      this.player.cash += amt;
    };
    this.missions.onWanted = (stars) => {
      if (stars === 0) this.police.clearWanted();
      else {
        this.police.wanted = stars;
        this.police.heat = stars / 5;
      }
    };
    this.missions.onDamage = (amt) => this.hurtPlayer(amt);
    this.police.onBusted = () => this.endGame('busted');
    this.police.onSiren = () => this.audio.siren();

    // HUD wiring
    this.hud.onNewGame = () => this.startGame(false);
    this.hud.onContinue = () => this.startGame(true);
    this.hud.onResume = () => {
      this.state = 'playing';
      this.hud.hidePause();
    };
    this.hud.onQuit = () => this.toMenu();
    this.hud.onRetry = () => this.retry();
    this.hud.onMenu = () => this.toMenu();
    this.input.onKey = (code) => {
      if (code === 'KeyP' && this.state === 'playing') {
        this.state = 'paused';
        this.hud.showPause();
      } else if (code === 'KeyP' && this.state === 'paused') {
        this.state = 'playing';
        this.hud.hidePause();
      }
      if (code === 'Enter' && this.state === 'menu') this.startGame(false);
    };

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // menu backdrop: slow orbit around downtown
    this.menuAngle = 0;
    this.hud.showMenu(this.loadSave() !== null);
    this.hud.setStars(0);
    this.hud.setCash(300);
    this.hud.setHealth(100);
    this.hud.setObjective('Welcome to Solmar Bay');
    this.player.place(-26, 0, 0);

    if (this.shot) {
      this.setupShot();
    }

    // test hook for headless play-tests
    window.__solmar = {
      game: this,
      state: () => this.state,
      player: this.player,
      missions: this.missions,
      police: this.police,
      errors: this.errors,
      testStep: (fn) => fn(this),
    };
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        mission: Math.max(0, this.missions.index),
        cash: this.player.cash,
        health: this.player.health,
        ammo: this.player.ammo,
      }));
    } catch { /* storage unavailable */ }
  }

  startGame(fromSave) {
    this.audio.unlock();
    this.audio.click();
    const save = fromSave ? this.loadSave() : null;
    this.player.health = save ? save.health : 100;
    this.player.cash = save ? save.cash : 300;
    this.player.ammo = save ? save.ammo : 24;
    this.player.place(-26, 0, 0);
    this.police.clearWanted();
    this.missions.index = -1;
    this.missions.done = false;
    this.missions.stage = 0;
    if (save && save.mission > 0) {
      this.missions.index = save.mission;
      this.missions.events.push('Continuing at Mission ' + (save.mission + 1) + ': ' + this.missions.defs[save.mission].title);
      if (save.mission === 1) this.missions.onWanted(2);
    } else {
      this.missions.start();
    }
    this.state = 'playing';
    this.hud.hideMenu();
    this.hud.hideEnd();
    this.hud.showToast('Welcome to Solmar Bay. Mission: ' + this.missions.current().title);
  }

  toMenu() {
    this.saveGame();
    this.state = 'menu';
    this.hud.showMenu(this.loadSave() !== null);
    this.hud.hidePause();
    this.hud.hideEnd();
    this.player.place(-26, 0, 0);
    if (this.player.inCar) {
      this.player.inCar.hide();
      this.player.inCar = null;
    }
    this.police.clearWanted();
  }

  retry() {
    this.audio.click();
    this.player.health = 100;
    const safe = this.world.landmarks.safehouse;
    this.player.place(safe.x + 6, safe.z, 0);
    if (this.player.inCar) {
      this.player.inCar.hide();
      this.player.inCar = null;
    }
    this.police.clearWanted();
    this.state = 'playing';
    this.hud.hideEnd();
    this.hud.showToast('Back on your feet. The job is not done.');
  }

  endGame(kind) {
    if (this.state !== 'playing') return;
    this.state = kind;
    if (kind === 'busted') {
      this.hud.showEnd('busted', 'The Solmar Bay PD caught up with Leo. The crew will have to wait.');
    } else if (kind === 'wasted') {
      this.hud.showEnd('wasted', 'Leo is down. The city keeps moving without him.');
    } else if (kind === 'won') {
      this.saveGame();
      this.hud.showEnd('won', 'All five jobs done. Solmar Bay is yours, Leo.');
    }
  }

  hurtPlayer(amount) {
    if (this.state !== 'playing') return;
    if (this.shot) return; // staged screenshots never kill the player
    if (this.player.damage(amount)) this.endGame('wasted');
  }

  setupShot() {
    // deterministic scene for the dossier screenshot
    const name = this.shot.shot;
    stageShot(this, name);
    this.state = name === 'menu' ? 'menu' : 'playing';
    if (name === 'menu') this.hud.showMenu(false);
    else this.hud.hideMenu();
    // settle the scene with fixed steps so the shot is reproducible
    for (let i = 0; i < 40; i++) this.update(1 / 60, true);
    this.render();
  }

  // --- combat ---
  shoot() {
    const m = this.player.muzzle();
    const heading = this.player.heading;
    this.audio.shoot();
    this.tracer.geometry.setFromPoints([
      new THREE.Vector3(m.x, 1.4, m.z),
      new THREE.Vector3(m.x + Math.cos(heading) * 26, 1.4, m.z - Math.sin(heading) * 26),
    ]);
    this.tracer.visible = true;
    this.tracerTimer = 0.09;
    let hit = this.missions.tryHitShot(m.x, m.z, heading);
    if (!hit) {
      // nearest ped in the shot cone
      const near = this.peds.nearest(m.x, m.z, 30);
      if (near) {
        const dx = near.ped.x - m.x;
        const dz = near.ped.z - m.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        const dot = (dx * Math.cos(heading) + dz * -Math.sin(heading)) / d;
        if (dot > 0.9) {
          this.peds.kill(near.ped);
          this.police.addHeat(0.3);
          hit = true;
        }
      }
    }
    if (!hit) {
      // police unit in the cone: slow it down
      for (const u of this.police.units) {
        const dx = u.x - m.x;
        const dz = u.z - m.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        if (d < 30) {
          const dot = (dx * Math.cos(heading) + dz * -Math.sin(heading)) / d;
          if (dot > 0.9) {
            u.speed *= 0.25;
            this.police.addHeat(0.1);
            hit = true;
            break;
          }
        }
      }
    }
    this.peds.scare(m.x, m.z, 18);
    this.police.addHeat(0.05);
  }

  punch(px, pz) {
    this.audio.noise(0.1, 0.25, 1200);
    const near = this.peds.nearest(px, pz, 2.2);
    if (near) {
      this.peds.scare(px, pz, 12);
      this.police.addHeat(0.15);
    }
    // rival in range takes damage
    for (const r of this.missions.rivals) {
      if (r.hp <= 0) continue;
      const d = Math.hypot(r.x - px, r.z - pz);
      if (d < 2.2) {
        r.hp -= 25;
        if (r.hp <= 0) r.mesh.visible = false;
      }
    }
  }

  // --- per-frame update ---
  update(dt, fixed) {
    // dt is clamped by the caller; never negative, never huge
    dt = clamp(dt, 0, 0.05);
    const inCar = !!this.player.inCar;
    if (this.state === 'playing') {
      // enter / exit car
      if (this.input.hit('KeyE')) {
        if (inCar) {
          const car = this.player.exitCar();
          if (car) this.hud.showToast('Out of the car.');
        } else {
          const got = this.player.tryEnterCar(this.traffic, this.drivable);
          if (got) {
            this.police.addHeat(0.2);
            this.audio.pickup();
            this.hud.showToast('Car stolen! The law may notice.');
          } else {
            this.hud.setHint('No car close enough — walk up to traffic and press E.');
          }
        }
      }
      if (inCar) {
        this.drivable.update(dt, this.input, this.world, (speed) => {
          this.audio.crash();
          if (!this.shot) {
            this.player.damage(Math.min(12, speed * 0.5));
            if (this.player.health <= 0) this.endGame('wasted');
          }
        });
        this.player.x = this.drivable.x;
        this.player.z = this.drivable.z;
        this.player.heading = this.drivable.heading;
        this.player.camYaw = this.drivable.heading;
        this.audio.setEngine(Math.abs(this.drivable.speed) / 26, true);
      } else {
        this.player.updateOnFoot(dt, this.input, () => this.shoot(), (x, z) => this.punch(x, z));
        this.audio.setEngine(0, false);
      }
      // Pay-N-Spray: drive in with heat and cash to clear wanted
      const pay = this.world.landmarks.paynspray;
      if (inCar && this.police.wanted > 0 && this.player.cash >= 100 &&
        Math.hypot(this.player.x - pay.x, this.player.z - pay.z) < 11) {
        this.player.cash -= 100;
        this.player.heal(25);
        this.police.clearWanted();
        this.audio.pickup();
        this.hud.showToast('Pay-N-Spray: heat cleared (-$100), car fixed.');
      }
      this.traffic.update(dt);
      this.peds.update(dt);
      const pSpeed = inCar ? Math.abs(this.drivable.speed) : null;
      this.police.update(dt, this.player.x, this.player.z, pSpeed, () => {
        this.hurtPlayer(8);
        this.audio.crash();
      });
      this.missions.update(dt, { px: this.player.x, pz: this.player.z, inCar });
      for (const ev of this.missions.takeEvents()) this.hud.showToast(ev);
      if (this.missions.done && this.state === 'playing') this.endGame('won');
      // traffic collision with the player's car
      if (inCar) {
        const near = this.traffic.nearest(this.player.x, this.player.z, 4.2);
        if (near) {
          this.drivable.speed *= 0.55;
          near.car.speed = 0;
          this.audio.crash();
        }
      }
    } else if (this.state === 'menu') {
      // idle backdrop: slow orbit, traffic keeps moving
      this.menuAngle += dt * 0.05;
      this.traffic.update(dt);
      this.peds.update(dt);
    }
    // HUD
    const cur = this.missions.current();
    this.hud.setStars(this.police.wanted);
    this.hud.setCash(this.player.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setSpeed(inCar ? Math.abs(this.drivable.speed) * 3.6 : 0);
    if (this.state === 'menu') {
      this.hud.setObjective('Welcome to Solmar Bay');
    } else if (this.missions.done) {
      this.hud.setObjective('All missions complete!');
    } else if (cur) {
      this.hud.setObjective('Mission ' + (this.missions.index + 1) + ': ' + cur.title + ' — ' + cur.objective);
    }
    this.hud.updateToasts(dt);
    this.hud.drawMap(
      this.player.x, this.player.z, inCar ? this.drivable.heading : this.player.heading,
      this.missions.markerTarget(), this.police.dots(),
      this.traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    );
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.visible = false;
    }
    this.input.endFrame();
  }

  render() {
    // third-person camera: behind the player/car, orbit with the mouse
    const inCar = !!this.player.inCar;
    const heading = inCar ? this.drivable.heading : this.player.camYaw;
    const fx = Math.cos(heading);
    const fz = -Math.sin(heading);
    const dist = inCar ? 11.5 : 8.5;
    const height = inCar ? 5 : 4.2;
    const px = this.player.x;
    const pz = this.player.z;
    const desired = new THREE.Vector3(px - fx * dist, height, pz - fz * dist);
    if (this.shot) {
      // shot mode: snap instantly, no smoothing
      this.camPos.copy(desired);
    } else {
      const k = 1 - Math.exp(-7 * 0.016);
      this.camPos.lerp(desired, k);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(px + fx * 6, 1.6, pz + fz * 6);
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();

// --- headless self-test (?test=1): scripted play-through, results in #test-result ---
function runSelfTest() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail ?? '' });
  try {
    game.startGame(false);
    check('boot-to-playing', game.state === 'playing', game.state);
    // steal a car: put a traffic car right next to the player, then press E
    const car = game.traffic.cars[0];
    car.mesh.position.set(game.player.x + 2, 0, game.player.z);
    car.s = game.player.x + 2;
    car.road = game.player.z;
    car.axis = 'x';
    car.dir = 1;
    game.input.testHit('KeyE');
    game.update(1 / 60);
    check('enter-car', !!game.player.inCar, game.player.inCar ? 'in car' : 'on foot');
    // drive forward for 1.5s
    const x0 = game.player.x;
    game.input.testDown('KeyW');
    for (let i = 0; i < 90; i++) game.update(1 / 60);
    game.input.testUp('KeyW');
    check('drive-forward', game.player.x - x0 > 5, 'moved ' + (game.player.x - x0).toFixed(1) + 'm, speed ' + game.drivable.speed.toFixed(1));
    // exit the car
    game.input.testHit('KeyE');
    game.update(1 / 60);
    check('exit-car', !game.player.inCar, '');
    // shoot once
    const ammo0 = game.player.ammo;
    game.input.testHit('Space');
    game.update(1 / 60);
    check('shoot-ammo', game.player.ammo === ammo0 - 1, ammo0 + '->' + game.player.ammo);
    // walk forward for 1s
    const wx0 = game.player.x;
    const wz0 = game.player.z;
    game.input.testDown('KeyW');
    for (let i = 0; i < 60; i++) game.update(1 / 60);
    game.input.testUp('KeyW');
    const walked = Math.hypot(game.player.x - wx0, game.player.z - wz0);
    check('walk-forward', walked > 2, walked.toFixed(1) + 'm');
    // mission 1: get in a car and teleport to the meet point
    const car2 = game.traffic.cars[0];
    car2.mesh.position.set(game.player.x + 2, 0, game.player.z);
    car2.s = game.player.x + 2;
    car2.road = game.player.z;
    car2.axis = 'x';
    car2.dir = 1;
    game.input.testHit('KeyE');
    game.update(1 / 60);
    const meet = game.world.landmarks.meet;
    game.drivable.x = meet.x;
    game.drivable.z = meet.z;
    game.player.x = meet.x;
    game.player.z = meet.z;
    game.update(1 / 60);
    check('mission1-completes', game.missions.index === 1, 'index=' + game.missions.index);
    // no console errors
    check('no-errors', game.errors.length === 0, game.errors.join('; ').slice(0, 200));
  } catch (e) {
    results.push({ name: 'exception', ok: false, detail: String((e && e.stack) || e) });
  }
  const div = document.createElement('div');
  div.id = 'test-result';
  div.textContent = JSON.stringify({ passed: results.filter((r) => r.ok).length, total: results.length, results });
  document.body.appendChild(div);
  document.title = 'TEST-DONE';
}
if (new URLSearchParams(window.location.search).get('test') === '1') {
  setTimeout(runSelfTest, 800);
}

// main loop: dt clamped, never negative (virtual-time safe)
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (game.state === 'playing' || game.state === 'menu') {
    game.update(game.shot ? 1 / 60 : dt);
  } else {
    // paused / ended: drop stale key presses so they do not fire on resume
    game.input.endFrame();
  }
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
