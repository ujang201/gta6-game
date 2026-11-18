// Pedestrians of Solmar Bay: locals strolling the sidewalks, scattering
// when shots ring out, and the odd rival crew member with a gun.
import * as THREE from 'three';
import { makeRng } from './random.js';
import { resolveCircle } from './world.js';

const SHIRTS = [0x3f7a4a, 0xc2a23e, 0x7a4a8a, 0x2e6f8a, 0xb05a2e, 0x8a2e3e, 0x4a5a6a, 0xd9d9d9];
const SKINS = [0xe8b98a, 0xc98a5a, 0x8a5a35, 0xf0c8a0];

export function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.34), shirt);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.75;
  g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  for (const sx of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.24), legMat);
    leg.position.set(sx, 0.3, 0);
    g.add(leg);
  }
  return g;
}

export function createPeds(world, scene, count) {
  const rng = makeRng(777);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = makePedMesh(rng);
    const x = rng.range(-165, 165);
    const z = rng.range(-165, 165);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh,
      pos: mesh.position,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.1, 1.9),
      target: null,
      state: 'walk',
      hp: 100,
      rival: false,
      shootCooldown: 0,
      fleeTimer: 0,
    });
  }
  return peds;
}

export function spawnRival(world, scene, x, z) {
  const rng = makeRng(Math.floor(Math.random() * 100000) + 5);
  const mesh = makePedMesh(rng);
  mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x8a1f1f });
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const rival = {
    mesh,
    pos: mesh.position,
    heading: 0,
    speed: 2.6,
    target: null,
    state: 'rival',
    hp: 60,
    rival: true,
    shootCooldown: rng.range(0.5, 1.5),
    fleeTimer: 0,
  };
  return rival;
}

function pickTarget(p, world) {
  // A nearby point on a sidewalk: offset from a road centre line.
  const centres = world.centres;
  const road = centres[Math.floor(Math.random() * centres.length)];
  const along = (Math.random() * 2 - 1) * 160;
  const horizontal = Math.random() < 0.5;
  const off = (Math.random() < 0.5 ? -1 : 1) * (5.5 + Math.random() * 2);
  return horizontal ? { x: along, z: road + off } : { x: road + off, z: along };
}

export function updatePeds(peds, world, dt, playerPos, gunshotPos) {
  for (const p of peds) {
    if (p.hp <= 0) continue;
    if (p.state === 'rival') {
      // Rivals close in on the player and are handled by the mission system.
      const dx = playerPos.x - p.pos.x;
      const dz = playerPos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 6) {
        p.heading = Math.atan2(dx, dz);
        p.pos.x += Math.sin(p.heading) * p.speed * dt;
        p.pos.z += Math.cos(p.heading) * p.speed * dt;
        resolveCircle(p.pos, 0.5, world.colliders);
      }
      p.mesh.rotation.y = p.heading;
      continue;
    }
    if (gunshotPos) {
      const dx = p.pos.x - gunshotPos.x;
      const dz = p.pos.z - gunshotPos.z;
      if (dx * dx + dz * dz < 30 * 30) {
        p.state = 'flee';
        p.fleeTimer = 3;
        p.heading = Math.atan2(dx, dz);
      }
    }
    if (p.state === 'flee') {
      p.fleeTimer -= dt;
      p.pos.x += Math.sin(p.heading) * 5.2 * dt;
      p.pos.z += Math.cos(p.heading) * 5.2 * dt;
      if (p.fleeTimer <= 0) p.state = 'walk';
    } else {
      if (!p.target) p.target = pickTarget(p, world);
      const dx = p.target.x - p.pos.x;
      const dz = p.target.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        p.target = null;
      } else {
        p.heading = Math.atan2(dx, dz);
        p.pos.x += Math.sin(p.heading) * p.speed * dt;
        p.pos.z += Math.cos(p.heading) * p.speed * dt;
      }
    }
    resolveCircle(p.pos, 0.5, world.colliders);
    const clamped = world.clampToBounds(p.pos.x, p.pos.z, 1);
    p.pos.x = clamped.x;
    p.pos.z = clamped.z;
    p.mesh.position.set(p.pos.x, 0, p.pos.z);
    p.mesh.rotation.y = p.heading;
    // Simple walk bob so they do not glide like statues.
    const bob = Math.sin((p.state === 'flee' ? 14 : 8) * (p.pos.x + p.pos.z)) * 0.05;
    p.mesh.children[0].position.y = 1.05 + Math.abs(bob);
  }
}
