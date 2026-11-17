// police.js — the Solmar Bay Police Department: wanted level, pursuit cars
// and foot officers. Heat rises when the player steals, shoots or kills;
// it cools while the player stays out of trouble, and a Pay-N-Spray visit
// or a long hide in the safehouse clears it. Police cars spawn at the map
// edge, chase, and ram; officers on foot appear at high wanted levels.

import * as THREE from 'three';
import { makeStream, clamp, distance2D } from './random.js';
import { makeCarMesh, Car } from './vehicles.js';
import { makePedMesh, Ped } from './peds.js';

const HEAT_DECAY = 0.045; // wanted points per second while quiet
const MAX_CARS = 5;

export class Police {
  constructor(scene, world, seed) {
    this.scene = scene;
    this.world = world;
    this.rng = makeStream(seed + 303);
    this.wanted = 0; // 0..5 stars, fractional internally
    this.heatTimer = 0; // seconds since last crime
    this.cars = [];
    this.officers = [];
    this.spawnTimer = 0;
    this.sirenLevel = 0;
  }

  get stars() {
    return Math.min(5, Math.floor(this.wanted + 0.001));
  }

  addHeat(amount, reason) {
    this.wanted = clamp(this.wanted + amount, 0, 5);
    this.heatTimer = 0;
    return reason;
  }

  clearWanted() {
    this.wanted = 0;
    this.despawnAll();
  }

  despawnAll() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    for (const o of this.officers) this.scene.remove(o.mesh);
    this.cars = [];
    this.officers = [];
  }

  spawnCarNear(px, pz) {
    const rng = this.rng;
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(55, 85);
    let x = clamp(px + Math.cos(angle) * dist, -225, 225);
    let z = clamp(pz + Math.sin(angle) * dist, -225, 225);
    const road = this.world.nearestRoad(x);
    const roadZ = this.world.nearestRoad(z);
    if (Math.abs(x - road) < Math.abs(z - roadZ)) x = road;
    else z = roadZ;
    const mesh = makeCarMesh(0x1c1c22, 'cop');
    // White doors: a thin white box over the body.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.5, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 }),
    );
    door.position.y = 0.72;
    mesh.add(door);
    const car = new Car(mesh, x, z, 0, 'cop', 'Interceptor');
    car.driver = 'police';
    car.speed = 0;
    car.topSpeed = 30 + this.stars * 2.5;
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  spawnOfficer(px, pz) {
    const rng = this.rng;
    const angle = rng.range(0, Math.PI * 2);
    const x = clamp(px + Math.cos(angle) * 14, -225, 225);
    const z = clamp(pz + Math.sin(angle) * 14, -225, 225);
    const mesh = makePedMesh(0x1c3a6b, 0x1c1c22, rng.pick([0xe8b88a, 0xc98a5e]));
    const officer = new Ped(mesh, x, z, 0);
    officer.walkSpeed = 3.2;
    officer.speed = 3.2;
    officer.isOfficer = true;
    this.scene.add(mesh);
    this.officers.push(officer);
    return officer;
  }

  update(dt, px, pz, playerInCar, playerSpeed) {
    this.heatTimer += dt;
    // Wanted cools down when the player has been quiet for a while.
    if (this.heatTimer > 14 && this.wanted > 0) {
      this.wanted = Math.max(0, this.wanted - HEAT_DECAY * dt);
    }
    const stars = this.stars;
    // Desired pursuit strength scales with stars.
    const wantCars = stars === 0 ? 0 : Math.min(MAX_CARS, stars === 1 ? 1 : stars);
    this.spawnTimer -= dt;
    if (this.cars.length < wantCars && this.spawnTimer <= 0) {
      this.spawnCarNear(px, pz);
      this.spawnTimer = 2.5;
    }
    if (stars >= 3 && this.officers.length < 2 && this.spawnTimer <= 0) {
      this.spawnOfficer(px, pz);
      this.spawnTimer = 3;
    }
    // Despawn the pursuit when the heat is gone.
    if (stars === 0) {
      for (const car of this.cars) {
        if (distance2D(car.x, car.z, px, pz) > 120) {
          this.scene.remove(car.mesh);
          this.cars.splice(this.cars.indexOf(car), 1);
        }
      }
    }
    // Chase: steer toward the player, ram when close.
    let nearest = Infinity;
    for (const car of this.cars) {
      const d = distance2D(car.x, car.z, px, pz);
      nearest = Math.min(nearest, d);
      const want = Math.atan2(px - car.x, pz - car.z);
      let diff = want - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += clamp(diff, -1.9 * dt, 1.9 * dt);
      const targetSpeed = d > 6 ? car.topSpeed : car.topSpeed * 0.4;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      const f = car.forward();
      car.x += f.x * car.speed * dt;
      car.z += f.z * car.speed * dt;
      const fixed = this.world.collideCircle(car.x, car.z, 2.2);
      car.x = fixed.x;
      car.z = fixed.z;
      car.flashT += dt;
      const on = Math.floor(car.flashT * 4) % 2 === 0;
      if (car.mesh.userData.flashRed) car.mesh.userData.flashRed.visible = on;
      if (car.mesh.userData.flashBlue) car.mesh.userData.flashBlue.visible = !on;
      car.syncMesh();
    }
    for (const o of this.officers) {
      const d = distance2D(o.x, o.z, px, pz);
      nearest = Math.min(nearest, d);
      o.target = { x: px, z: pz };
      const dx = px - o.x;
      const dz = pz - o.z;
      const dist = Math.hypot(dx, dz) || 1;
      o.heading = Math.atan2(dx, dz);
      o.x += (dx / dist) * o.speed * dt;
      o.z += (dz / dist) * o.speed * dt;
      o.syncMesh(dt);
    }
    // Siren loudness: closer police, louder wail.
    const sirenTarget = stars > 0 ? clamp(1 - nearest / 140, 0.15, 1) : 0;
    this.sirenLevel += (sirenTarget - this.sirenLevel) * Math.min(1, dt * 2);
    return { nearestPolice: nearest, stars };
  }

  // Did a police car ram the player this frame? Returns impact speed.
  checkRam(px, pz, radius) {
    let impact = 0;
    for (const car of this.cars) {
      const d = distance2D(car.x, car.z, px, pz);
      if (d < radius + 2.2) {
        impact = Math.max(impact, Math.abs(car.speed));
        // Bounce the cop off so it does not stick.
        car.speed *= -0.35;
        car.heading += 0.6;
      }
    }
    return impact;
  }
}
