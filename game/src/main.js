// main.js — Solmar Bay entry point: wires the world, the player, traffic,
// pedestrians, police, missions and HUD together and runs the game loop.
// States: menu → briefing → playing ⇄ paused → busted / wasted.
// Saves progress to localStorage. ?shot=cover|street|mission|menu stages a
// deterministic screenshot scene instead of the menu.

import * as THREE from 'three';
import { World, CITY_HALF, SEA_X } from './world.js';
import { Traffic, makeCarMesh, Car } from './vehicles.js';
import { PedCrowd, makePedMesh, Ped } from './peds.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { MissionManager, MISSIONS } from './missions.js';
import { HUD, showMenu, fillStartMenu, showBriefing, hideBriefing, showEndScreen, hideEndScreen } from './hud.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { stageShot } from './shots.js';
import { clamp, distance2D } from './random.js';

const SEED = 20261117;
const SAVE_KEY = 'solmar-bay-save-v1';

const errorBox = document.getElementById('error-box');
window.addEventListener('error', (e) => {
  if (errorBox) errorBox.textContent = 'ERROR: ' + (e.message || e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  if (errorBox) errorBox.textContent = 'ERROR: ' + (e.reason && e.reason.message ? e.reason.message : e.reason);
});

class Game {
  constructor() {
    this.state = 'menu';
    this.shotMode = false;
    this.frozen = false;
    this.time = 0;
    this.paused = false;
    this.rivals = [];

    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(30, 12, 60);

    this.world = new World(this.scene, SEED);
    this.traffic = new Traffic(this.scene, this.world, SEED, 14);
    this.crowd = new PedCrowd(this.scene, this.world, SEED, 20);
    this.police = new Police(this.scene, this.world, SEED);
    this.player = new Player(this.scene, 20, 40);
    this.missions = new MissionManager((t, p) => this.onMissionEvent(t, p));
    this.hud = new HUD();
    this.input = new Input();
    this.input.attach(canvas);
    this.audio = new SoundBank();
    this.input.onFirstGesture = () => this.audio.ensure();

    this.buildWaypointMarker();
    this.parkSpecialCars();
    this.bindMenuButtons();
    this.loadSaveIntoMenu();
    this.showStartMenu();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const params = new URLSearchParams(location.search);
    const shot = params.get('shot');
    if (shot) {
      this.state = 'playing';
      document.getElementById('start-menu').classList.add('hidden');
      if (!stageShot(this, shot)) {
        this.showStartMenu();
      }
    }
    this.renderer.setAnimationLoop(() => this.frame());
  }

  buildWaypointMarker() {
    // A tall glowing column + ground ring at the active mission waypoint.
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23d, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.y = 30;
    this.marker.visible = false;
    this.scene.add(this.marker);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;
    this.markerRing = ring;
    ring.visible = false;
    this.scene.add(ring);
    // Floating diamond above the marker.
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }),
    );
    diamond.position.y = 12;
    this.markerDiamond = diamond;
    diamond.visible = false;
    this.scene.add(diamond);
  }

  parkSpecialCars() {
    // The red Cometa for mission 1, parked on Coral Row.
    const red = makeCarMesh(0xd94f3d, 'sedan');
    const cometa = new Car(red, 120, -90, Math.PI / 2, 'sedan', 'Cometa');
    cometa.driver = null;
    this.scene.add(red);
    cometa.syncMesh();
    this.traffic.cars.push(cometa);
    // The cargo truck for mission 4, parked in the harbour yard.
    const truck = makeCarMesh(0xe8c33d, 'truck');
    const cargo = new Car(truck, -190, -150, 0, 'truck', 'Cargo Hauler');
    cargo.driver = null;
    this.scene.add(truck);
    cargo.syncMesh();
    this.traffic.cars.push(cargo);
  }

  bindMenuButtons() {
    document.getElementById('new-game-btn').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.newGame();
    });
    document.getElementById('continue-btn').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.continueGame();
    });
    document.getElementById('resume-btn').addEventListener('click', () => {
      this.audio.click();
      this.togglePause(false);
    });
    document.getElementById('quit-btn').addEventListener('click', () => {
      this.audio.click();
      this.saveGame();
      this.showStartMenu();
    });
    document.getElementById('mute-btn').addEventListener('click', (e) => {
      this.audio.ensure();
      const muted = !this.audio.muted;
      this.audio.setMuted(muted);
      e.target.textContent = muted ? '🔇 Sound: Off' : '🔊 Sound: On';
    });
  }

  loadSaveIntoMenu() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      this.saveData = raw ? JSON.parse(raw) : null;
    } catch (e) {
      this.saveData = null;
    }
    const next = this.saveData && MISSIONS[this.saveData.missions?.index || 0];
    fillStartMenu(!!this.saveData, next ? 'Next job: ' + next.title : null);
  }

  showStartMenu() {
    this.state = 'menu';
    this.loadSaveIntoMenu();
    showMenu(document.getElementById('start-menu'), true);
    showMenu(document.getElementById('pause-menu'), false);
    showMenu(document.getElementById('hud'), false);
    hideBriefing();
    hideEndScreen();
  }

  newGame() {
    localStorage.removeItem(SAVE_KEY);
    this.saveData = null;
    this.player = this.resetPlayer();
    this.missions = new MissionManager((t, p) => this.onMissionEvent(t, p));
    this.police.clearWanted();
    this.startPlaying();
    this.missions.start();
  }

  continueGame() {
    if (!this.saveData) return;
    this.player.load(this.saveData.player);
    this.missions = new MissionManager((t, p) => this.onMissionEvent(t, p));
    this.missions.load(this.saveData.missions);
    this.startPlaying();
    if (!this.missions.done) this.missions.start();
  }

  resetPlayer() {
    this.scene.remove(this.player.mesh);
    const p = new Player(this.scene, 20, 40);
    return p;
  }

  startPlaying() {
    this.state = 'playing';
    showMenu(document.getElementById('start-menu'), false);
    showMenu(document.getElementById('pause-menu'), false);
    showMenu(document.getElementById('hud'), true);
    hideEndScreen();
    this.hud.feed('Solmar Bay — good luck, Leo.');
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        player: this.player.save(),
        missions: this.missions.save(),
      }));
    } catch (e) { /* storage full or blocked: play on without saving */ }
  }

  togglePause(on) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.paused = on;
    this.state = on ? 'paused' : 'playing';
    showMenu(document.getElementById('pause-menu'), on);
  }

  onMissionEvent(type, payload) {
    if (type === 'brief') {
      const m = payload.mission;
      this.state = 'briefing';
      showBriefing(m);
      this.audio.pickup();
      if (m.id === 'getaway') this.police.addHeat(2, 'hot car');
    } else if (type === 'stage') {
      this.hud.showBanner(payload.stage.text, '', 2.5);
      this.audio.pickup();
    } else if (type === 'arrive') {
      this.audio.pickup();
    } else if (type === 'complete') {
      const m = payload.mission;
      this.player.cash += payload.reward;
      this.hud.showBanner('JOB DONE — ' + m.title, 'Paid $' + payload.reward, 4);
      this.hud.feed('Paid $' + payload.reward + ' — total earned $' + this.missions.earned);
      this.audio.cash();
      this.saveGame();
      if (!this.missions.done) {
        setTimeout(() => {
          if (this.state === 'playing') this.missions.start();
        }, 4500);
      } else {
        this.hud.showBanner('SOLMAR BAY IS YOURS', 'All five jobs complete. Leo Marin, legend.', 6);
      }
    } else if (type === 'fail') {
      this.hud.showBanner('JOB FAILED', payload.reason || '', 3);
    } else if (type === 'spawn-rivals') {
      this.spawnRivals(payload.count);
    } else if (type === 'alarm') {
      this.police.addHeat(3, 'bank alarm');
      this.hud.feed('Bank alarm! Three stars — run!');
    }
  }

  spawnRivals(count) {
    const base = this.missions.currentStage;
    const bx = base && base.x !== undefined ? base.x : -180;
    const bz = base && base.z !== undefined ? base.z : 120;
    for (let i = 0; i < count; i++) {
      const ped = this.crowd.spawnPed();
      ped.x = bx + (i - 1) * 6;
      ped.z = bz + 6;
      ped.isRival = true;
      ped.health = 100;
      ped.walkSpeed = 3.6;
      ped.speed = 3.6;
      // Rival crew: red shirts.
      ped.mesh.children[0].material = new THREE.MeshStandardMaterial({ color: 0x8a1f1f, roughness: 0.9 });
      this.rivals.push(ped);
      ped.syncMesh(0);
    }
    this.hud.showBanner('RIVAL CREW', 'Take down 3 rivals', 3);
  }

  onPlayerEvent(type, payload) {
    if (type === 'enter-car') {
      const car = payload.car;
      this.audio.pickup();
      if (car.driver === 'player' && this.police.stars < 1) {
        // Stealing a car in the open is a crime.
        this.police.addHeat(0.6, 'grand theft auto');
        this.hud.feed('You stole a ' + car.name + ' — the cops noticed');
      }
      this.hud.feed('Driving: ' + car.name);
    } else if (type === 'exit-car') {
      this.audio.click();
    } else if (type === 'crash') {
      this.hud.feed('Crash!');
    } else if (type === 'shot') {
      // Heat already added by the player; rivals return fire.
      this.rivalReturnFire();
    } else if (type === 'kill') {
      const ref = payload.ref;
      if (ref && ref.isRival) {
        this.missions.noteKill();
        this.hud.feed('Rival down — ' + this.missions.killsDone + '/3');
        this.audio.cash();
      } else if (payload.kind === 'officer') {
        this.hud.feed('Officer down! The whole department is coming.');
      } else if (payload.kind === 'ped') {
        this.police.addHeat(1.2, 'casualty');
        this.hud.feed('A bystander is down. The cops are coming.');
      }
    } else if (type === 'crime') {
      this.hud.feed('Assault on an officer!');
    }
  }

  rivalReturnFire() {
    for (const r of this.rivals) {
      if (!r.alive) continue;
      const d = distance2D(r.x, r.z, this.player.x, this.player.z);
      if (d < 30 && Math.random() < 0.4) {
        if (this.player.damage(4)) this.endRun(false);
      }
    }
  }

  endRun(busted) {
    const wanted = this.police.stars > 0;
    if (busted || wanted) {
      this.state = 'busted';
      showEndScreen('busted', 'The SBPD caught up with Leo. The crew posts bail — the job restarts.');
      this.audio.busted();
      this.player.cash = Math.max(0, this.player.cash - 150);
    } else {
      this.state = 'wasted';
      showEndScreen('wasted', 'Leo is down. The crew drags him to the clinic — the job restarts.');
      this.audio.busted();
    }
    this.missions.fail(busted ? 'Busted' : 'Wasted');
    this.player.health = 100;
  }

  // One fixed simulation step; used by the live loop and by shot staging.
  stepWorld(dt) {
    this.time += dt;
    const p = this.player;
    const pos = p.position;
    p.update(dt, this.input, this.world, this.traffic, this.crowd, this.police, this.audio,
      (t, pl) => this.onPlayerEvent(t, pl));
    this.traffic.update(dt, p.inCar, this.police.cars);
    this.crowd.update(dt, pos.x, pos.z);
    // Rivals hunt the player instead of wandering.
    for (const r of this.rivals) {
      if (!r.alive) continue;
      r.panicked = false;
      r.target = { x: pos.x, z: pos.z };
      const d = distance2D(r.x, r.z, pos.x, pos.z);
      if (d < 2.5) {
        if (p.damage(6 * dt * 10 * 0.1)) this.endRun(false);
      }
    }
    const policeState = this.police.update(dt, pos.x, pos.z, !!p.inCar, Math.abs(p.speed || 0));
    this.audio.setSiren(this.police.sirenLevel);
    // Police rams hurt the player (on foot or in the car).
    const impact = this.police.checkRam(pos.x, pos.z, p.inCar ? 2.4 : 1.2);
    if (impact > 6) {
      this.audio.crash();
      if (p.damage(impact * 0.9)) this.endRun(true);
    }
    // Officers on foot grab the player.
    for (const o of this.police.officers) {
      if (distance2D(o.x, o.z, pos.x, pos.z) < 1.6) {
        this.endRun(true);
        return;
      }
    }
    // Pay-N-Spray: drive in with heat, pay $100, walk out clean.
    if (p.inCar) {
      for (const bay of this.world.payNSpray) {
        if (distance2D(pos.x, pos.z, bay.x, bay.z) < bay.r && this.police.wanted > 0) {
          if (p.cash >= 100) {
            p.cash -= 100;
            this.police.clearWanted();
            this.hud.showBanner('PAY-N-SPRAY', 'Fresh paint, clean record — $100', 3);
            this.audio.cash();
          }
        }
      }
    }
    // Safehouse porch heals Leo and cools heat while he lingers.
    const sh = this.world.safehouse;
    if (!p.inCar && distance2D(pos.x, pos.z, sh.x, sh.z) < sh.r) {
      p.heal(12 * dt);
      if (this.police.wanted > 0 && this.police.heatTimer > 6) {
        this.police.wanted = Math.max(0, this.police.wanted - 0.2 * dt);
      }
    }
    // Missions.
    this.missions.update(dt, {
      px: pos.x, pz: pos.z,
      inCar: !!p.inCar,
      carKind: p.inCar ? p.inCar.kind : null,
      wanted: this.police.stars,
    });
    // Waypoint marker follows the active mission.
    const wp = this.missions.waypoint();
    const showMarker = !!wp && (this.state === 'playing' || this.shotMode);
    this.marker.visible = showMarker;
    this.markerRing.visible = showMarker;
    this.markerDiamond.visible = showMarker;
    if (wp) {
      this.marker.position.set(wp.x, 30, wp.z);
      this.markerRing.position.set(wp.x, 0.4, wp.z);
      this.markerDiamond.position.set(wp.x, 12 + Math.sin(this.time * 2) * 0.6, wp.z);
      this.markerDiamond.rotation.y = this.time;
    }
    if (p.health <= 0 && this.state === 'playing') this.endRun(false);
  }

  hudState() {
    const pos = this.player.position;
    return {
      px: pos.x, pz: pos.z,
      heading: this.player.inCar ? this.player.inCar.heading : this.player.heading,
      wantedStars: this.police.stars,
      cash: this.player.cash,
      health: this.player.health,
      speed: this.player.speed || 0,
      inCar: !!this.player.inCar,
      carName: this.player.inCar ? this.player.inCar.name : '',
      hasPistol: this.player.hasPistol,
      ammo: this.player.ammo,
      objective: this.missions.objectiveText(),
      waypoint: this.missions.waypoint(),
      policePositions: this.police.cars.map((c) => ({ x: c.x, z: c.z })),
      payNSpray: this.world.payNSpray,
      safehouse: this.world.safehouse,
      mapTime: this.hud.mapTime,
    };
  }

  frame() {
    const dt = Math.min(0.05, 1 / 60);
    if (this.shotMode) {
      // Frozen staged scene: render only.
      if (!this.frozen) this.stepWorld(dt);
      this.hud.update(0, this.hudState());
      this.renderOnce();
      this.input.endFrame();
      return;
    }
    if (this.state === 'menu') {
      // Slow orbit over the beach while the menu is up.
      this.time += dt;
      const a = this.time * 0.05;
      this.camera.position.set(
        -CITY_HALF + 60 + Math.sin(a) * 40, 26, 40 + Math.cos(a) * 30,
      );
      this.camera.lookAt(-CITY_HALF - 20, 4, 0);
      this.traffic.update(dt, null, []);
      this.crowd.update(dt, 0, 0);
      this.renderOnce();
      this.input.endFrame();
      return;
    }
    if (this.state === 'briefing') {
      if (this.input.pressed.size > 0 || this.input.consumeMouse().clicked) {
        hideBriefing();
        this.state = 'playing';
      }
      this.renderOnce();
      this.input.endFrame();
      return;
    }
    if (this.state === 'busted' || this.state === 'wasted') {
      if (this.input.wasPressed('KeyR')) {
        hideEndScreen();
        this.player.health = 100;
        this.player.x = 20;
        this.player.z = 40;
        this.player.mesh.position.set(20, 0, 40);
        if (this.player.inCar) {
          this.player.inCar.driver = null;
          this.player.inCar = null;
          this.player.mesh.visible = true;
        }
        this.police.clearWanted();
        this.missions.restart();
        this.state = 'playing';
      } else if (this.input.wasPressed('Enter')) {
        hideEndScreen();
        this.showStartMenu();
      }
      this.renderOnce();
      this.input.endFrame();
      return;
    }
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyP')) {
      this.togglePause(this.state === 'playing');
    }
    if (this.state === 'paused') {
      this.renderOnce();
      this.input.endFrame();
      return;
    }
    if (this.state === 'playing') {
      if (this.input.wasPressed('KeyM') && !this.missions.active && !this.missions.done) {
        this.missions.start();
      }
      this.stepWorld(dt);
      this.player.updateCamera(this.camera, dt);
      this.hud.update(dt, this.hudState());
    }
    this.renderOnce();
    this.input.endFrame();
  }

  renderOnce() {
    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
