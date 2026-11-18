// Pedestrians for SOLMAR BAY: ~20 walkers strolling the sidewalks,
// turning at intersections, fleeing when a gunshot goes off nearby.
import * as THREE from 'three';
import { dist2D } from './random.js';

const SHIRT_COLORS = [0xd64545, 0x45a0d6, 0x45d67a, 0xd6c245, 0x9b59b6, 0xe67e22, 0xecf0f1, 0x1abc9c];

function makePedMesh(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.65;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), pants);
  legs.position.y = 0.35;
  g.add(legs);
  return g;
}

export class Peds {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.list = [];
    for (let i = 0; i < 20; i++) {
      const mesh = makePedMesh(SHIRT_COLORS[i % SHIRT_COLORS.length]);
      scene.add(mesh);
      const p = this.spawnPoint();
      this.list.push({
        mesh,
        x: p.x,
        z: p.z,
        heading: rng.range(0, Math.PI * 2),
        speed: rng.range(1.0, 1.9),
        axis: rng.chance(0.5) ? 'x' : 'z',
        dir: rng.chance(0.5) ? 1 : -1,
        flee: 0, // seconds of fleeing left
        alive: true,
      });
    }
  }

  spawnPoint() {
    // on a sidewalk: just off a road, inside a block edge
    const road = this.world.roads[this.rng.int(0, this.world.roads.length - 1)];
    const along = this.rng.range(-250, 250);
    if (this.rng.chance(0.5)) return { x: along, z: road + (this.rng.chance(0.5) ? 8 : -8) };
    return { x: road + (this.rng.chance(0.5) ? 8 : -8), z: along };
  }

  // a gunshot at (x,z) makes nearby peds run away
  scare(x, z, radius) {
    for (const p of this.list) {
      if (!p.alive) continue;
      if (dist2D(p.x, p.z, x, z) < radius) {
        p.flee = 4;
        p.heading = Math.atan2(-(p.z - z), p.x - x);
      }
    }
  }

  update(dt) {
    for (const p of this.list) {
      if (!p.alive) continue;
      const speed = p.flee > 0 ? 4.2 : p.speed;
      if (p.flee > 0) p.flee -= dt;
      p.x += Math.cos(p.heading) * speed * dt;
      p.z -= Math.sin(p.heading) * speed * dt;
      // turn at intersections when not fleeing
      if (p.flee <= 0) {
        const onCrossX = Math.abs(((p.x % 52) + 52) % 52) < 0.6 || Math.abs(((p.x % 52) + 52) % 52 - 52) < 0.6;
        const onCrossZ = Math.abs(((p.z % 52) + 52) % 52) < 0.6 || Math.abs(((p.z % 52) + 52) % 52 - 52) < 0.6;
        if ((onCrossX || onCrossZ) && this.rng.f() < 0.01) {
          p.heading = this.rng.range(0, Math.PI * 2);
        }
      }
      // keep inside the city; bounce off the edges
      if (p.x < -260 || p.x > 290 || p.z < -260 || p.z > 260) {
        p.heading += Math.PI;
        p.x = Math.max(-260, Math.min(290, p.x));
        p.z = Math.max(-260, Math.min(260, p.z));
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // simple walk bob
      p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.006 + p.x)) * 0.05;
    }
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const p of this.list) {
      if (!p.alive) continue;
      const d = dist2D(p.x, p.z, x, z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { ped: best, dist: bd } : null;
  }

  kill(ped) {
    ped.alive = false;
    ped.mesh.visible = false;
  }
}
