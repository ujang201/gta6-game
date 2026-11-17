// peds.js — pedestrians of Solmar Bay: tourists, workers and locals who
// stroll the sidewalks, cross at corners, and run for cover when a gun goes
// off or a car bears down on them. Each is a capsule-ish figure built from
// boxes and spheres, with a shirt colour drawn from the seed.

import * as THREE from 'three';
import { makeStream, clamp, distance2D } from './random.js';

const SHIRTS = [0xe8e4da, 0xd94f3d, 0x3d7bd9, 0xe8c33d, 0x4f9e57, 0x8a5fd0, 0xff8fb0, 0x57b8c4];
const PANTS = [0x2b2b33, 0x3a4a6b, 0x6b4a2f, 0x5a5a5a];

export function makePedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), shirtMat);
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skinMat);
  head.position.y = 1.68;
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.22);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.14, 0.38, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.14, 0.38, 0);
  g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.14, 0.6, 0.16);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.36, 1.15, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.36, 1.15, 0);
  g.add(armR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.armL = armL;
  g.userData.armR = armR;
  return g;
}

export class Ped {
  constructor(mesh, x, z, heading) {
    this.mesh = mesh;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.walkSpeed = 1.4;
    this.target = null;
    this.panicked = false;
    this.panicT = 0;
    this.alive = true;
    this.health = 100;
    this.walkPhase = Math.random() * 6;
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * this.speed * 4;
    const swing = Math.sin(this.walkPhase) * 0.5 * Math.min(1, this.speed);
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.userData.armL.rotation.x = -swing * 0.8;
    this.mesh.userData.armR.rotation.x = swing * 0.8;
  }
}

export class PedCrowd {
  constructor(scene, world, seed, count) {
    this.scene = scene;
    this.world = world;
    this.rng = makeStream(seed + 202);
    this.peds = [];
    for (let i = 0; i < count; i++) {
      this.spawnPed();
    }
  }

  spawnPed() {
    const rng = this.rng;
    const p = this.world.randomSidewalkPoint(rng);
    const mesh = makePedMesh(
      rng.pick(SHIRTS),
      rng.pick(PANTS),
      rng.pick([0xe8b88a, 0xc98a5e, 0x8a5a3a, 0xf0c8a0]),
    );
    const ped = new Ped(mesh, p.x, p.z, rng.range(0, Math.PI * 2));
    ped.walkSpeed = rng.range(1.0, 2.0);
    ped.target = this.world.randomSidewalkPoint(rng);
    ped.speed = ped.walkSpeed;
    this.scene.add(mesh);
    this.peds.push(ped);
    return ped;
  }

  panicNear(x, z, radius) {
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      if (distance2D(ped.x, ped.z, x, z) < radius) {
        ped.panicked = true;
        ped.panicT = 4 + this.rng.next() * 3;
        ped.speed = 4.5;
        // Flee directly away from the scare.
        const dx = ped.x - x;
        const dz = ped.z - z;
        const d = Math.hypot(dx, dz) || 1;
        ped.target = {
          x: clamp(ped.x + (dx / d) * 40, -225, 225),
          z: clamp(ped.z + (dz / d) * 40, -225, 225),
        };
      }
    }
  }

  update(dt, playerX, playerZ) {
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      if (ped.panicked) {
        ped.panicT -= dt;
        if (ped.panicT <= 0) {
          ped.panicked = false;
          ped.speed = ped.walkSpeed;
          ped.target = this.world.randomSidewalkPoint(this.rng);
        }
      }
      const dx = ped.target.x - ped.x;
      const dz = ped.target.z - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) {
        ped.target = ped.panicked
          ? this.world.randomSidewalkPoint(this.rng)
          : this.world.randomSidewalkPoint(this.rng);
        continue;
      }
      const want = Math.atan2(dx, dz);
      let diff = want - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      const fixed = this.world.collideCircle(ped.x, ped.z, 0.6);
      ped.x = fixed.x;
      ped.z = fixed.z;
      ped.syncMesh(dt);
    }
  }

  // Nearest living ped to a point.
  nearest(x, z, range) {
    let best = null;
    let bestD = range;
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      const d = distance2D(x, z, ped.x, ped.z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    return best;
  }

  kill(ped) {
    ped.alive = false;
    ped.mesh.rotation.z = Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }
}
