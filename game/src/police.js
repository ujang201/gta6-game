// The Solmar Bay Police Department: a wanted level from 0 to 5 stars,
// cruisers that hunt the player down and ram, and foot officers who try
// to make an arrest up close.
import * as THREE from 'three';
import { makeCarMesh } from './vehicles.js';
import { resolveCircle } from './world.js';

export function createPolice(world, scene) {
  return {
    wanted: 0,
    heat: 0,
    quietTimer: 0,
    cars: [],
    cops: [],
    world,
    scene,
    addHeat(n) {
      this.heat = Math.min(100, this.heat + n);
      this.quietTimer = 0;
      const next = this.heat < 8 ? 0 : this.heat < 22 ? 1 : this.heat < 40 ? 2 : this.heat < 62 ? 3 : this.heat < 85 ? 4 : 5;
      if (next > this.wanted) {
        this.wanted = next;
      } else if (next < this.wanted && this.quietTimer > 14) {
        this.wanted = next;
      }
    },
    setWanted(n) {
      this.wanted = n;
      this.heat = [0, 12, 30, 50, 72, 92][n] || 0;
      this.quietTimer = 0;
    },
    clearWanted() {
      this.wanted = 0;
      this.heat = 0;
      this.quietTimer = 0;
    },
    spawnCar(x, z) {
      const mesh = makeCarMesh(0x1c1c22, false, true);
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      const car = { mesh, pos: mesh.position, heading: 0, speed: 0, ramCooldown: 0 };
      this.cars.push(car);
      return car;
    },
    spawnCop(x, z) {
      const g = new THREE.Group();
      const uniform = new THREE.MeshLambertMaterial({ color: 0x1e3a5f });
      const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.95, 0.36), uniform);
      body.position.y = 1.05;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
      head.position.y = 1.75;
      g.add(head);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x14263e }));
      cap.position.y = 1.95;
      g.add(cap);
      g.position.set(x, 0, z);
      this.scene.add(g);
      const cop = { mesh: g, pos: g.position, heading: 0, grabTimer: 0 };
      this.cops.push(cop);
      return cop;
    },
    removeAll() {
      for (const c of this.cars) this.scene.remove(c.mesh);
      for (const c of this.cops) this.scene.remove(c.mesh);
      this.cars = [];
      this.cops = [];
    },
    update(dt, t, player, onBusted, onRam) {
      // Heat cools off when the player keeps their nose clean.
      this.quietTimer += dt;
      if (this.quietTimer > 6 && this.heat > 0) {
        this.heat = Math.max(0, this.heat - dt * 1.4);
        const next = this.heat < 8 ? 0 : this.heat < 22 ? 1 : this.heat < 40 ? 2 : this.heat < 62 ? 3 : this.heat < 85 ? 4 : 5;
        if (next < this.wanted) this.wanted = next;
      }
      const wantCars = Math.min(this.wanted, 4);
      while (this.cars.length < wantCars) {
        const a = Math.random() * Math.PI * 2;
        this.spawnCar(player.pos.x + Math.cos(a) * 55, player.pos.z + Math.sin(a) * 55);
      }
      while (this.cars.length > wantCars) {
        const c = this.cars.pop();
        this.scene.remove(c.mesh);
      }
      const wantCops = this.wanted >= 3 ? Math.min(3, this.wanted - 1) : 0;
      while (this.cops.length < wantCops) {
        const a = Math.random() * Math.PI * 2;
        this.spawnCop(player.pos.x + Math.cos(a) * 22, player.pos.z + Math.sin(a) * 22);
      }
      while (this.cops.length > wantCops) {
        const c = this.cops.pop();
        this.scene.remove(c.mesh);
      }
      // Cruisers chase and ram.
      for (const c of this.cars) {
        const dx = player.pos.x - c.pos.x;
        const dz = player.pos.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        const wantHeading = Math.atan2(dx, dz);
        let diff = wantHeading - c.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        c.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        c.speed = Math.min(30, c.speed + 14 * dt);
        c.pos.x += Math.sin(c.heading) * c.speed * dt;
        c.pos.z += Math.cos(c.heading) * c.speed * dt;
        resolveCircle(c.pos, 1.9, this.world.colliders);
        c.mesh.position.set(c.pos.x, 0, c.pos.z);
        c.mesh.rotation.y = c.heading;
        // Flashing light bar, frozen in shot mode by the fixed clock.
        const phase = Math.floor(t * 4) % 2 === 0;
        if (c.mesh.userData.lampL) {
          c.mesh.userData.lampL.material.color.setHex(phase ? 0xff2222 : 0x551111);
          c.mesh.userData.lampR.material.color.setHex(phase ? 0x111155 : 0x2244ff);
        }
        c.ramCooldown -= dt;
        if (d < 3.4 && c.ramCooldown <= 0) {
          c.ramCooldown = 1.2;
          c.speed *= 0.4;
          if (onRam) onRam(d);
        }
      }
      // Foot officers run the player down and try to grab them.
      for (const cop of this.cops) {
        const dx = player.pos.x - cop.pos.x;
        const dz = player.pos.z - cop.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.4) {
          cop.heading = Math.atan2(dx, dz);
          cop.pos.x += Math.sin(cop.heading) * 4.4 * dt;
          cop.pos.z += Math.cos(cop.heading) * 4.4 * dt;
          cop.grabTimer = 0;
        } else {
          cop.grabTimer += dt;
          if (cop.grabTimer > 1.6 && onBusted) {
            cop.grabTimer = 0;
            onBusted();
          }
        }
        resolveCircle(cop.pos, 0.5, this.world.colliders);
        cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
        cop.mesh.rotation.y = cop.heading;
      }
    },
  };
}
