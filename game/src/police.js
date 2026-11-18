// Wanted level + police for SOLMAR BAY.
// Wanted 0-5 stars. Police cars spawn at wanted >= 1, chase and ram the
// player; on foot they close in and a 2-second grab means Busted.
import * as THREE from 'three';
import { clamp, dist2D } from './random.js';
import { makeCarMesh } from './vehicles.js';

export class Police {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.wanted = 0;
    this.heat = 0; // 0..1, builds while committing crimes, decays otherwise
    this.units = []; // {mesh, x, z, heading, speed, grab}
    this.sirenTimer = 0;
    this.formation = false; // shot mode: units hold speed + heading, no chase
    this.onBusted = null; // callback
  }

  // build one police car mesh (used by the shot stager too)
  spawnUnitMesh() {
    const mesh = makeCarMesh(0x111111, true);
    mesh.children[0].material.color.setHex(0xf0f0f0);
    this.scene.add(mesh);
    return mesh;
  }

  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 1);
    const target = Math.min(5, Math.ceil(this.heat * 5));
    if (target > this.wanted) this.wanted = target;
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    for (const u of this.units) {
      this.scene.remove(u.mesh);
    }
    this.units = [];
  }

  // where the player is (x,z) and whether they are in a car
  update(dt, px, pz, playerSpeed, onRam) {
    // formation mode (staged shots): units hold their speed and heading
    if (this.formation) {
      for (const u of this.units) {
        u.x += Math.cos(u.heading) * u.speed * dt;
        u.z -= Math.sin(u.heading) * u.speed * dt;
        u.mesh.position.set(u.x, 0, u.z);
        u.mesh.rotation.y = u.heading;
      }
      return;
    }
    // decay: wanted fades when the player is quiet and far from police
    if (this.wanted > 0) {
      this.heat = clamp(this.heat - dt * 0.012, 0, 1);
      if (this.heat <= 0.001) this.clearWanted();
    }
    // spawn units up to the wanted level
    while (this.units.length < this.wanted) {
      const mesh = this.spawnUnitMesh();
      const p = this.world.randomRoadPoint(this.rng);
      this.units.push({ mesh, x: p.x, z: p.z, heading: 0, speed: 0, grab: 0 });
    }
    while (this.units.length > this.wanted) {
      const u = this.units.pop();
      this.scene.remove(u.mesh);
    }
    // chase
    for (const u of this.units) {
      const d = dist2D(u.x, u.z, px, pz);
      const wantHeading = Math.atan2(-(pz - u.z), px - u.x);
      let dh = wantHeading - u.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      u.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
      const top = 15 + this.wanted * 1.6;
      const target = d > 6 ? top : top * 0.5;
      u.speed += (target - u.speed) * Math.min(1, dt * 1.5);
      const nx = u.x + Math.cos(u.heading) * u.speed * dt;
      const nz = u.z - Math.sin(u.heading) * u.speed * dt;
      const fixed = this.world.collide(nx, nz, 2.0);
      u.x = fixed.x;
      u.z = fixed.z;
      u.mesh.position.set(u.x, 0, u.z);
      u.mesh.rotation.y = u.heading;
      // ram / grab
      if (d < 3.4) {
        if (playerSpeed !== null && playerSpeed > 1) {
          // ramming a car: damage + slow the player
          if (onRam) onRam(u);
          u.speed *= 0.3;
        } else {
          // on foot: police grab the player
          u.grab += dt;
          if (u.grab > 2 && this.onBusted) this.onBusted();
        }
      } else {
        u.grab = Math.max(0, u.grab - dt);
      }
    }
    // siren wail every few seconds while wanted
    if (this.wanted > 0) {
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.sirenTimer = 3.2;
        if (this.onSiren) this.onSiren();
      }
    }
  }

  // dots for the minimap
  dots() {
    return this.units.map((u) => ({ x: u.x, z: u.z }));
  }
}
