// vehicles.js — cars in Solmar Bay: the mesh factory, the traffic AI that
// loops the road grid, and the arcade driving model the player uses.
// Every car is a small group of boxes: body, cabin, wheels, headlights.
// Traffic cars pick a random road loop and cruise it, slowing for the car
// ahead; the player's car is the same mesh with a physics state.

import * as THREE from 'three';
import { makeStream, clamp, angleLerp, distance2D } from './random.js';

const CAR_COLOURS = [
  0xd94f3d, 0x3d7bd9, 0xe8c33d, 0x4f9e57, 0xe8e4da, 0x2b2b33,
  0xd97b2b, 0x8a5fd0, 0x57b8c4, 0xc0c8d0,
];
const CAR_NAMES = [
  'Vento', 'Cometa', 'Brisa', 'Toro', 'Falco', 'Onda', 'Puma', 'Litoral',
];

export function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2836, roughness: 0.15, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const isTruck = kind === 'truck';
  const isCop = kind === 'cop';
  const len = isTruck ? 6.4 : 4.4;
  const wid = isTruck ? 2.4 : 2.0;
  const bodyH = isTruck ? 1.5 : 0.75;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), bodyMat);
  body.position.y = isTruck ? 1.15 : 0.65;
  group.add(body);
  if (isTruck) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.2, 1.3, 1.6), bodyMat);
    cab.position.set(0, 2.4, len / 2 - 1.1);
    group.add(cab);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.3, 0.9, len - 2.4), darkMat);
    bed.position.set(0, 1.9, -len / 2 + 1.6);
    group.add(bed);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.35, 0.65, len * 0.48), glassMat);
    cabin.position.set(0, 1.3, -len * 0.06);
    group.add(cabin);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [
    [-wid / 2, len / 2 - 0.9], [wid / 2, len / 2 - 0.9],
    [-wid / 2, -len / 2 + 0.9], [wid / 2, -len / 2 + 0.9],
  ]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.36, wz);
    group.add(w);
    wheels.push(w);
  }
  // Headlights + taillights.
  const lightGeo = new THREE.BoxGeometry(0.4, 0.18, 0.08);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(lightGeo, headMat);
    h.position.set(sx * (wid / 2 - 0.3), 0.75, len / 2 + 0.03);
    group.add(h);
    const t = new THREE.Mesh(lightGeo, tailMat);
    t.position.set(sx * (wid / 2 - 0.3), 0.75, -len / 2 - 0.03);
    group.add(t);
  }
  if (isCop) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    bar.position.set(0, 1.75, 0);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.28, 1.76, 0);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.42), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.28, 1.76, 0);
    group.add(blue);
    group.userData.flashRed = red;
    group.userData.flashBlue = blue;
  }
  group.userData.wheels = wheels;
  group.userData.length = len;
  group.userData.width = wid;
  return group;
}

export class Car {
  constructor(mesh, x, z, heading, kind, name) {
    this.mesh = mesh;
    this.x = x;
    this.z = z;
    this.heading = heading; // radians, 0 = facing +Z... forward is -Z in mesh space? see forward()
    this.speed = 0;
    this.kind = kind || 'sedan';
    this.name = name || 'Vento';
    this.health = 100;
    this.driver = null; // 'player' | 'traffic' | 'police' | null (parked/stolen target)
    this.steer = 0;
    this.flashT = 0;
  }

  // Forward unit vector in world space.
  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.4;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin * 0.016;
  }
}

export class Traffic {
  constructor(scene, world, seed, count) {
    this.scene = scene;
    this.world = world;
    this.rng = makeStream(seed + 101);
    this.cars = [];
    for (let i = 0; i < count; i++) {
      this.spawnCar(true);
    }
  }

  spawnCar(anywhere) {
    const rng = this.rng;
    const p = this.world.randomRoadPoint(rng);
    const horizontal = Math.abs(p.z - this.world.nearestRoad(p.z)) < 0.1;
    const heading = horizontal
      ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
      : (rng.chance(0.5) ? 0 : Math.PI);
    const kind = rng.chance(0.14) ? 'truck' : 'sedan';
    const mesh = makeCarMesh(rng.pick(CAR_COLOURS), kind);
    const car = new Car(mesh, p.x, p.z, heading, kind, rng.pick(CAR_NAMES));
    car.driver = 'traffic';
    car.cruise = rng.range(7, 12);
    // Traffic follows a rectangular loop: pick the next corner to aim at.
    car.target = this.nextCorner(car);
    car.speed = car.cruise;
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  nextCorner(car) {
    const w = this.world;
    const onHorizontal = Math.abs(car.z - w.nearestRoad(car.z)) < 1;
    const f = car.forward();
    // Aim at the next road intersection ahead, then turn onto a new road.
    const ahead = 60;
    const px = car.x + f.x * ahead;
    const pz = car.z + f.z * ahead;
    const nx = w.nearestRoad(px);
    const nz = w.nearestRoad(pz);
    return { x: onHorizontal ? clamp(px, -230, 230) : nx, z: onHorizontal ? nz : clamp(pz, -230, 230) };
  }

  update(dt, playerCar, policeCars) {
    const w = this.world;
    for (const car of this.cars) {
      if (car.driver !== 'traffic') continue;
      // Slow down if another car is close ahead.
      let desired = car.cruise;
      for (const other of this.cars) {
        if (other === car) continue;
        const d = distance2D(car.x, car.z, other.x, other.z);
        if (d < 12) {
          const f = car.forward();
          const dot = (other.x - car.x) * f.x + (other.z - car.z) * f.z;
          if (dot > 0) desired = Math.min(desired, 3);
        }
      }
      if (playerCar && distance2D(car.x, car.z, playerCar.x, playerCar.z) < 10) {
        desired = Math.min(desired, 2);
      }
      car.speed += (desired - car.speed) * Math.min(1, dt * 1.5);
      // Steer toward the current corner target.
      const wantHeading = Math.atan2(car.target.x - car.x, car.target.z - car.z);
      car.heading = angleLerp(car.heading, wantHeading, Math.min(1, dt * 1.6));
      const f = car.forward();
      car.x += f.x * car.speed * dt;
      car.z += f.z * car.speed * dt;
      const fixed = w.collideCircle(car.x, car.z, 2.2);
      car.x = fixed.x;
      car.z = fixed.z;
      if (distance2D(car.x, car.z, car.target.x, car.target.z) < 6) {
        car.target = this.nextCorner(car);
      }
      // Recycle cars that drifted off the grid.
      if (Math.abs(car.x) > 245 || Math.abs(car.z) > 245) {
        const p = w.randomRoadPoint(this.rng);
        car.x = p.x;
        car.z = p.z;
        car.target = this.nextCorner(car);
      }
      car.syncMesh();
    }
  }

  // Nearest traffic/parked car to a point, within range.
  nearestCar(x, z, range) {
    let best = null;
    let bestD = range;
    for (const car of this.cars) {
      if (car.driver === 'player') continue;
      const d = distance2D(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh);
  }
}

// Arcade driving for the player's car: accelerate, brake/reverse, steering
// that tightens at low speed, handbrake slide, and soft building collisions.
export function drivePlayerCar(car, input, dt, world, onCrash) {
  const axes = input.moveAxes();
  const handbrake = input.held('Space');
  const topSpeed = 42;
  const accel = 26;
  if (axes.forward > 0) car.speed += accel * dt;
  else if (axes.forward < 0) {
    car.speed -= car.speed > 0.5 ? 34 * dt : 12 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  }
  car.speed = clamp(car.speed, -12, topSpeed);
  const steerInput = -axes.strafe; // A turns left
  const speedFactor = clamp(Math.abs(car.speed) / 12, 0, 1);
  const targetSteer = steerInput * 0.55 * speedFactor * (handbrake ? 1.5 : 1);
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);
  car.heading += car.steer * (car.speed / 8) * dt * (car.speed < 0 ? -1 : 1);
  const f = car.forward();
  const nx = car.x + f.x * car.speed * dt;
  const nz = car.z + f.z * car.speed * dt;
  const fixed = world.collideCircle(nx, nz, 2.2);
  const hitWall = Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01;
  if (hitWall && Math.abs(car.speed) > 10 && onCrash) onCrash(Math.abs(car.speed));
  if (hitWall) car.speed *= 0.55;
  car.x = fixed.x;
  car.z = fixed.z;
  car.syncMesh();
  return Math.abs(car.speed);
}
