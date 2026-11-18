// Cars for SOLMAR BAY: traffic AI that loops the road grid, plus the
// drivable car physics the player uses (accel, steering, handbrake).
import * as THREE from 'three';
import { clamp, angleDiff } from './random.js';

const CAR_COLORS = [0xc0392b, 0x2471a3, 0xd4ac0d, 0x1e8449, 0x7d3c98, 0xd35400, 0x95a5a6, 0x2c3e50, 0xca6f1e];

export function makeCarMesh(color, police) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.2, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 2.0), paint);
  body.position.y = 0.75;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.8), dark);
  cabin.position.set(-0.2, 1.55, 0);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
  for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  // headlights
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xaa9955, emissiveIntensity: 0.7 });
  for (const wz of [0.6, -0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.4), lampMat);
    lamp.position.set(2.25, 0.8, wz);
    g.add(lamp);
  }
  if (police) {
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 1.2), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 1 }));
    barR.position.set(-0.2, 2.05, 0.55);
    g.add(barR);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 1.2), new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0000aa, emissiveIntensity: 1 }));
    barB.position.set(-0.2, 2.05, -0.55);
    g.add(barB);
  }
  return g;
}

export class Traffic {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.cars = [];
    for (let i = 0; i < 14; i++) {
      const color = CAR_COLORS[i % CAR_COLORS.length];
      const mesh = makeCarMesh(color, false);
      scene.add(mesh);
      const axis = rng.chance(0.5) ? 'x' : 'z';
      const road = world.roads[rng.int(0, world.roads.length - 1)];
      const dir = rng.chance(0.5) ? 1 : -1;
      this.cars.push({
        mesh, axis, road, dir, color,
        s: rng.range(-250, 250),
        speed: rng.range(9, 14),
        baseSpeed: rng.range(9, 14),
      });
    }
  }

  // lane offset for right-hand traffic
  laneOffset(car) {
    if (car.axis === 'x') return car.dir > 0 ? 2.6 : -2.6;
    return car.dir > 0 ? -2.6 : 2.6;
  }

  update(dt) {
    for (const car of this.cars) {
      // car-following: slow if a car is close ahead on the same lane
      let want = car.baseSpeed;
      for (const other of this.cars) {
        if (other === car || other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
        const ahead = (other.s - car.s) * car.dir;
        if (ahead > 0 && ahead < 9) want = Math.min(want, Math.max(0, ahead - 4) * 0.8);
      }
      car.speed += (want - car.speed) * Math.min(1, dt * 2);
      car.s += car.dir * car.speed * dt;
      // wrap at the city edge
      if (car.s > 258) car.s = -258;
      if (car.s < -258) car.s = 258;
      // turn at intersections sometimes
      const nearCross = Math.abs(((car.s % 52) + 52) % 52) < car.speed * dt + 0.4 ||
        Math.abs(((car.s % 52) + 52) % 52 - 52) < car.speed * dt + 0.4;
      if (nearCross && this.rng.f() < 0.02) {
        const crossRoad = Math.round(car.s / 52) * 52;
        if (Math.abs(crossRoad) <= 260) {
          const oldRoad = car.road;
          car.road = crossRoad;
          car.s = oldRoad;
          car.axis = car.axis === 'x' ? 'z' : 'x';
          car.dir = this.rng.chance(0.5) ? 1 : -1;
        }
      }
      const off = this.laneOffset(car);
      if (car.axis === 'x') {
        car.mesh.position.set(car.s, 0, car.road + off);
        car.mesh.rotation.y = car.dir > 0 ? 0 : Math.PI;
      } else {
        // forward = (cos h, 0, -sin h): moving +z needs h = -PI/2, -z needs +PI/2
        car.mesh.position.set(car.road + off, 0, car.s);
        car.mesh.rotation.y = car.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    }
  }

  // nearest traffic car to a point (for stealing / collisions)
  nearest(x, z, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const car of this.cars) {
      const dx = car.mesh.position.x - x;
      const dz = car.mesh.position.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best ? { car: best, dist: bd } : null;
  }
}

// A car the player drives: simple arcade physics with collision push-out.
export class Drivable {
  constructor(scene, color, police) {
    this.mesh = makeCarMesh(color, police);
    scene.add(this.mesh);
    this.x = 0;
    this.z = 0;
    this.heading = 0; // radians, 0 = +x (east)
    this.speed = 0; // m/s, forward positive
    this.active = false; // false = parked (traffic) / hidden
    this.cruise = false; // shot mode: hold speed instead of coasting down
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.mesh.position.set(x, 0, z);
    // mesh forward is +x; rotation.y = heading gives forward (cos h, 0, -sin h)
    this.mesh.rotation.y = heading;
    this.mesh.visible = true;
    this.active = true;
  }

  // repaint the body (children[0]) to match a stolen traffic car
  setColor(color) {
    const body = this.mesh.children[0];
    if (body && body.material && body.material.color) body.material.color.setHex(color);
  }

  hide() {
    this.mesh.visible = false;
    this.active = false;
  }

  update(dt, input, world, onCrash) {
    if (!this.active) return;
    const ax = input.axes();
    const target = ax.f;
    // accelerate / brake / reverse
    if (target > 0) this.speed += 14 * dt;
    else if (target < 0) this.speed -= this.speed > 0.5 ? 22 * dt : 8 * dt;
    else if (!this.cruise) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    // handbrake
    if (input.down('Space')) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    this.speed = clamp(this.speed, -9, 26);
    // steering scales with speed; it inverts when reversing (like a real car)
    const steerAmount = ax.s * clamp(Math.abs(this.speed) / 8, 0, 1) * 1.9 * dt;
    this.heading += this.speed >= 0 ? -steerAmount : steerAmount;
    const nx = this.x + Math.cos(this.heading) * this.speed * dt;
    const nz = this.z - Math.sin(this.heading) * this.speed * dt;
    const fixed = world.collide(nx, nz, 2.2);
    if ((fixed.x !== nx || fixed.z !== nz) && Math.abs(this.speed) > 4) {
      if (onCrash) onCrash(Math.abs(this.speed));
      this.speed *= 0.4;
    }
    this.x = fixed.x;
    this.z = fixed.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}
