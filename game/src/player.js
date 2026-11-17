// player.js — Leo Marin on foot and behind the wheel.
// On foot: WASD moves relative to the camera, Shift runs, E enters the
// nearest car, F throws a punch, mouse click / Space fires the pistol.
// In a car: the driving model in vehicles.js takes over, E steps out.
// Leo has health, a pistol with ammo, and a cash wallet.

import * as THREE from 'three';
import { clamp, distance2D } from './random.js';
import { makePedMesh } from './peds.js';
import { drivePlayerCar } from './vehicles.js';

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.heading = 0; // facing direction
    this.camYaw = Math.PI; // camera orbit yaw
    this.camPitch = 0.32;
    this.health = 100;
    this.cash = 250;
    this.ammo = 24;
    this.hasPistol = true;
    this.inCar = null; // Car object or null
    this.speed = 0;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.hurtFlash = 0;
    this.mesh = makePedMesh(0x2e6b4f, 0x2b2b33, 0xe8b88a);
    // Leo's look: green jacket, dark jeans, a cap.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.24, 0.1, 10),
      new THREE.MeshStandardMaterial({ color: 0xd94f3d }),
    );
    cap.position.y = 1.86;
    this.mesh.add(cap);
    scene.add(this.mesh);
    this.muzzle = new THREE.PointLight(0xffd27a, 0, 18);
    scene.add(this.muzzle);
    this.muzzleT = 0;
  }

  get position() {
    return this.inCar ? { x: this.inCar.x, z: this.inCar.z } : { x: this.x, z: this.z };
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, 100);
  }

  damage(amount) {
    this.health = clamp(this.health - amount, 0, 100);
    this.hurtFlash = 0.5;
    return this.health <= 0;
  }

  update(dt, input, world, traffic, peds, police, audio, onEvent) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.muzzle.intensity = this.muzzleT > 0 ? 30 : 0;

    const mouse = input.consumeMouse();
    this.camYaw -= mouse.dx * 0.004;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.003, 0.08, 1.1);

    if (this.inCar) {
      const car = this.inCar;
      const speed = drivePlayerCar(car, input, dt, world, (impact) => {
        audio.crash();
        onEvent('crash', { impact });
        if (impact > 22) this.damage(8);
      });
      this.speed = speed;
      this.x = car.x;
      this.z = car.z;
      this.heading = car.heading;
      audio.setEngine(clamp(Math.abs(speed) / 42, 0, 1), true);
      if (input.wasPressed('KeyE')) this.exitCar(traffic, onEvent);
      return;
    }

    audio.setEngine(0, false);
    const axes = input.moveAxes();
    const running = input.held('ShiftLeft') || input.held('ShiftRight');
    const moveSpeed = running ? 9 : 5;
    // Move relative to camera yaw.
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    let mx = 0;
    let mz = 0;
    if (axes.forward !== 0 || axes.strafe !== 0) {
      mx = sin * axes.forward + cos * axes.strafe;
      mz = cos * axes.forward - sin * axes.strafe;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      this.heading = Math.atan2(mx, mz);
      this.speed = moveSpeed;
      this.x += mx * moveSpeed * dt;
      this.z += mz * moveSpeed * dt;
      const fixed = world.collideCircle(this.x, this.z, 0.7);
      this.x = fixed.x;
      this.z = fixed.z;
    } else {
      this.speed = 0;
    }

    // Sync the visible figure: walk cycle via leg swing.
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const phase = performance.now() * 0.012 * (this.speed > 0 ? 1 : 0);
    const swing = Math.sin(phase) * 0.5 * (this.speed > 0 ? 1 : 0);
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.userData.armL.rotation.x = -swing * 0.8;
    this.mesh.userData.armR.rotation.x = swing * 0.8;

    // Enter a car.
    if (input.wasPressed('KeyE')) {
      const car = traffic.nearestCar(this.x, this.z, 5);
      if (car) {
        this.enterCar(car, onEvent);
      }
    }
    // Punch with F; shoot with mouse click or Space while armed.
    if (input.wasPressed('KeyF') && this.punchCooldown <= 0) {
      this.punch(peds, police, audio, onEvent);
    }
    // Shoot: mouse click or Space, only when armed.
    if ((mouse.clicked || input.wasPressed('Space')) && this.hasPistol && this.shootCooldown <= 0) {
      this.shoot(peds, police, audio, onEvent);
    }
  }

  enterCar(car, onEvent) {
    car.driver = 'player';
    this.inCar = car;
    this.mesh.visible = false;
    onEvent('enter-car', { car });
  }

  exitCar(traffic, onEvent) {
    const car = this.inCar;
    if (!car) return;
    car.driver = null;
    this.inCar = null;
    // Step out to the driver's side.
    const f = car.forward();
    this.x = car.x - f.z * 2.4;
    this.z = car.z + f.x * 2.4;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    onEvent('exit-car', { car });
  }

  punch(peds, police, audio, onEvent) {
    this.punchCooldown = 0.45;
    audio.punch();
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const ped = peds.nearest(this.x + fx * 1.5, this.z + fz * 1.5, 2.2);
    if (ped) {
      ped.health -= 35;
      if (ped.health <= 0) {
        peds.kill(ped);
        onEvent('kill', { kind: 'ped', ref: ped });
      } else {
        peds.panicNear(ped.x, ped.z, 8);
      }
    }
    // Punching a cop is a crime like any other.
    const officer = police.officers.find((o) => distance2D(this.x, this.z, o.x, o.z) < 2.2);
    if (officer) {
      police.addHeat(1.5, 'assault');
      onEvent('crime', { kind: 'assault' });
    }
  }

  shoot(peds, police, audio, onEvent) {
    if (this.ammo <= 0) {
      audio.blip(180, 0.08, 'square', 0.1);
      return;
    }
    this.ammo -= 1;
    this.shootCooldown = 0.28;
    this.muzzleT = 0.08;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.muzzle.position.set(this.x + fx * 1.2, 1.4, this.z + fz * 1.2);
    audio.gunshot();
    peds.panicNear(this.x, this.z, 26);
    police.addHeat(0.6, 'gunfire');
    // Hit scan: nearest target within a forward cone and 40 m.
    let best = null;
    let bestScore = Infinity;
    const consider = (tx, tz, ref) => {
      const dx = tx - this.x;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 42 || d < 0.5) return;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.86) return;
      const score = d + (1 - dot) * 20;
      if (score < bestScore) {
        bestScore = score;
        best = ref;
      }
    };
    for (const ped of peds.peds) if (ped.alive) consider(ped.x, ped.z, { type: 'ped', ref: ped });
    for (const o of police.officers) consider(o.x, o.z, { type: 'officer', ref: o });
    for (const car of police.cars) consider(car.x, car.z, { type: 'copcar', ref: car });
    if (best) {
      if (best.type === 'ped') {
        best.ref.health -= 55;
        if (best.ref.health <= 0) {
          peds.kill(best.ref);
          onEvent('kill', { kind: 'ped', ref: best.ref });
        }
      } else if (best.type === 'officer') {
        best.ref.alive = false;
        best.ref.mesh.rotation.z = Math.PI / 2;
        best.ref.mesh.position.y = 0.25;
        police.addHeat(1.5, 'cop-down');
        onEvent('kill', { kind: 'officer', ref: best.ref });
      } else {
        best.ref.health -= 30;
      }
    }
    onEvent('shot', {});
  }

  // Third-person camera: behind and above the player or the car.
  updateCamera(camera, dt) {
    const px = this.inCar ? this.inCar.x : this.x;
    const pz = this.inCar ? this.inCar.z : this.z;
    const dist = this.inCar ? 13 : 9;
    const height = this.inCar ? 5.2 : 4.2;
    const yaw = this.inCar ? this.inCar.heading + Math.PI : this.camYaw;
    const tx = px + Math.sin(yaw) * dist;
    const tz = pz + Math.cos(yaw) * dist;
    const ty = height + this.camPitch * 6;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 6);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 6);
    camera.lookAt(px, this.inCar ? 1.6 : 1.5, pz);
  }

  save() {
    return {
      x: this.x, z: this.z, cash: this.cash, ammo: this.ammo,
      health: this.health, hasPistol: this.hasPistol,
    };
  }

  load(data) {
    if (!data) return;
    this.x = data.x ?? this.x;
    this.z = data.z ?? this.z;
    this.cash = data.cash ?? this.cash;
    this.ammo = data.ammo ?? this.ammo;
    this.health = data.health ?? this.health;
    this.hasPistol = data.hasPistol ?? true;
  }
}
