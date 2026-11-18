// Cars of Solmar Bay: boxy low-poly rides, traffic AI that loops the road
// grid, and arcade driving physics for the player's stolen wheels.
import * as THREE from 'three';
import { makeRng } from './random.js';
import { resolveCircle } from './world.js';

export const CAR_NAMES = ['Vento', 'Onda', 'Cometa', 'Brisa', 'Falco', 'Toro', 'Lobo', 'Marlin'];
export const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xd9a441, 0x3f8a4f, 0x7a4a9a, 0xcccccc, 0x222831, 0xd96a2e];

export function makeCarMesh(color, isTruck, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1c1c22 : color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18222e });
  const bodyLen = isTruck ? 5.6 : 4.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.85, bodyLen), paint);
  body.position.y = 0.75;
  g.add(body);
  if (isTruck) {
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 3.2), new THREE.MeshLambertMaterial({ color: 0x8a7a3e }));
    cargo.position.set(0, 1.5, -1.1);
    g.add(cargo);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 1.4), glass);
    cab.position.set(0, 1.5, 1.5);
    g.add(cab);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.1), glass);
    cabin.position.set(0, 1.45, -0.2);
    g.add(cabin);
  }
  if (isPolice) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.4, 1.6), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    door.position.set(0, 0.8, 0);
    g.add(door);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), headMat);
    h.position.set(sx, 0.8, bodyLen / 2 + 0.02);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
  for (const sx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tailMat);
    t.position.set(sx, 0.8, -bodyLen / 2 - 0.02);
    g.add(t);
  }
  // Police light bar: two lamps the police system flashes red/blue.
  let lampL = null;
  let lampR = null;
  if (isPolice) {
    lampL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    lampL.position.set(-0.45, 1.95, 0);
    g.add(lampL);
    lampR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    lampR.position.set(0.45, 1.95, 0);
    g.add(lampR);
  }
  g.userData = { wheels, lampL, lampR, bodyLen };
  return g;
}

export function createTraffic(world, scene, count) {
  const rng = makeRng(4242);
  const cars = [];
  const centres = world.centres;
  for (let i = 0; i < count; i++) {
    const horizontal = rng.chance(0.5);
    const road = rng.pick(centres);
    const along = rng.range(-160, 160);
    const mesh = makeCarMesh(rng.pick(CAR_COLORS), false, false);
    const heading = horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    mesh.position.set(horizontal ? along : road, 0, horizontal ? road : along);
    mesh.rotation.y = heading;
    scene.add(mesh);
    cars.push({
      mesh,
      name: rng.pick(CAR_NAMES),
      horizontal,
      road,
      dir: Math.sign(Math.cos(heading)) || 1,
      speed: rng.range(7, 12),
      maxSpeed: rng.range(9, 14),
      heading,
      stolen: false,
    });
  }
  return cars;
}

function roadIndexNear(centres, v) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < centres.length; i++) {
    const d = Math.abs(centres[i] - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, dist: bestD };
}

export function updateTraffic(cars, world, dt) {
  const centres = world.centres;
  for (const c of cars) {
    if (c.stolen) continue;
    const mesh = c.mesh;
    // Move along the current road.
    const step = c.speed * dt;
    if (c.horizontal) mesh.position.x += Math.cos(c.heading) * step;
    else mesh.position.z -= Math.sin(c.heading) * step;
    mesh.rotation.y = c.heading;
    // At an intersection, sometimes turn onto the crossing road.
    const near = c.horizontal
      ? roadIndexNear(centres, mesh.position.x)
      : roadIndexNear(centres, mesh.position.z);
    if (near.dist < 1.2 && Math.random() < dt * 0.35) {
      const cross = centres[near.index];
      const turnLeft = Math.random() < 0.5;
      if (c.horizontal) {
        mesh.position.x = cross;
        c.horizontal = false;
        c.heading = turnLeft ? Math.PI / 2 : -Math.PI / 2;
      } else {
        mesh.position.z = cross;
        c.horizontal = true;
        c.heading = turnLeft ? Math.PI : 0;
      }
    }
    // Loop back inside the city if it drifted past the edge.
    if (mesh.position.x > 178) mesh.position.x = -178;
    if (mesh.position.x < -178) mesh.position.x = 178;
    if (mesh.position.z > 178) mesh.position.z = -178;
    if (mesh.position.z < -178) mesh.position.z = 178;
  }
}

// Arcade driving: accelerate, brake/reverse, steer, handbrake slide.
// The car's mesh position is the source of truth for where it is.
export function updateDrive(car, input, dt, world) {
  const accel = input.down('KeyW') || input.down('ArrowUp') ? 1 : 0;
  const brake = input.down('KeyS') || input.down('ArrowDown') ? 1 : 0;
  const handbrake = input.down('Space');
  const steer = (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0)
    - (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);
  const top = 34;
  if (accel) car.speed += 22 * dt;
  if (brake) {
    car.speed -= car.speed > 0.5 ? 30 * dt : 8 * dt;
    if (car.speed < -9) car.speed = -9;
  }
  if (!accel && !brake) car.speed *= Math.max(0, 1 - 0.9 * dt);
  if (handbrake) car.speed *= Math.max(0, 1 - 2.2 * dt);
  if (car.speed > top) car.speed = top;
  const grip = handbrake ? 0.45 : 1;
  const turnRate = steer * (1.9 - Math.min(0.9, Math.abs(car.speed) / 40)) * grip;
  car.heading += turnRate * dt * Math.sign(car.speed || 1);
  const pos = car.mesh.position;
  pos.x += Math.sin(car.heading) * car.speed * dt;
  pos.z += Math.cos(car.heading) * car.speed * dt;
  resolveCircle(pos, 1.9, world.colliders);
  const clamped = world.clampToBounds(pos.x, pos.z, 2);
  pos.x = clamped.x;
  pos.z = clamped.z;
  // Spin the wheels to match the road speed.
  const spin = (car.speed * dt) / 0.42;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  car.mesh.rotation.y = car.heading;
  return { speed: car.speed };
}
