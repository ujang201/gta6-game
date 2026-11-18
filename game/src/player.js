// Leo Marin, the player: on-foot movement (WASD relative to the camera),
// running, punching, shooting, and getting in/out of cars.
import * as THREE from 'three';
import { clamp, dist2D } from './random.js';

function makeLeoMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1a6ab0, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), jacket);
  body.position.y = 1.1;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.75;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.32), pants);
  legs.position.y = 0.38;
  g.add(legs);
  // a visible cap so Leo reads on the minimap and in shots
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.48), new THREE.MeshStandardMaterial({ color: 0xd4ac0d, roughness: 0.8 }));
  cap.position.y = 2.0;
  g.add(cap);
  return g;
}

export class Player {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mesh = makeLeoMesh();
    scene.add(this.mesh);
    this.x = 0;
    this.z = 0;
    this.heading = 0; // facing, radians; forward = (cos h, 0, -sin h)
    this.camYaw = 0; // camera orbit yaw
    this.health = 100;
    this.cash = 300;
    this.ammo = 24;
    this.armed = true; // starts with a pistol
    this.inCar = null; // Drivable instance or null
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.bustedTimer = 0;
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.camYaw = heading;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.mesh.visible = true;
  }

  // move on foot; returns nothing. camYaw is updated from mouse orbit.
  updateOnFoot(dt, input, onShoot, onPunch) {
    const orbit = input.takeOrbit();
    this.camYaw -= orbit.dx * 0.005;
    const ax = input.axes();
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = run ? 7.5 : 4.2;
    // move relative to camera yaw
    const fx = Math.cos(this.camYaw);
    const fz = -Math.sin(this.camYaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * ax.f + rx * ax.s;
    let mz = fz * ax.f + rz * ax.s;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      const nx = this.x + mx * speed * dt;
      const nz = this.z + mz * speed * dt;
      const fixed = this.world.collide(nx, nz, 0.6);
      this.x = fixed.x;
      this.z = fixed.z;
      // face movement direction
      this.heading = Math.atan2(-mz, mx);
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // walk bob
    const moving = len > 0.01;
    this.mesh.position.y = moving ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.06 : 0;

    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (input.hit('KeyF') && this.punchCooldown <= 0) {
      this.punchCooldown = 0.45;
      if (onPunch) onPunch(this.x + Math.cos(this.heading) * 1.2, this.z - Math.sin(this.heading) * 1.2);
    }
    if ((input.hit('Space') || input.hit('MouseClick')) && this.armed && this.ammo > 0 && this.shootCooldown <= 0) {
      this.shootCooldown = 0.28;
      this.ammo -= 1;
      if (onShoot) onShoot(this.x, this.z, this.heading);
    }
  }

  // try to get into the nearest car; returns the car or null
  tryEnterCar(traffic, drivable) {
    const near = traffic.nearest(this.x, this.z, 4.5);
    if (!near) return null;
    const car = near.car;
    // take the traffic car over: remove it from traffic, drive it
    const idx = traffic.cars.indexOf(car);
    if (idx >= 0) traffic.cars.splice(idx, 1);
    car.mesh.visible = false;
    drivable.setColor(car.color);
    drivable.place(car.mesh.position.x, car.mesh.position.z, car.dir > 0 ? (car.axis === 'x' ? 0 : -Math.PI / 2) : (car.axis === 'x' ? Math.PI : Math.PI / 2));
    drivable.mesh.visible = true;
    this.inCar = drivable;
    this.mesh.visible = false;
    return drivable;
  }

  exitCar() {
    if (!this.inCar) return;
    const c = this.inCar;
    this.inCar = null;
    // step out to the side of the car
    this.x = c.x - Math.sin(c.heading) * 2.6;
    this.z = c.z - Math.cos(c.heading) * 2.6;
    const fixed = this.world.collide(this.x, this.z, 0.6);
    this.x = fixed.x;
    this.z = fixed.z;
    this.heading = c.heading;
    this.camYaw = c.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    return c;
  }

  // point in front of the player (for shooting)
  muzzle() {
    return {
      x: this.x + Math.cos(this.heading) * 0.8,
      z: this.z - Math.sin(this.heading) * 0.8,
    };
  }

  damage(amount) {
    this.health = clamp(this.health - amount, 0, 100);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, 100);
  }
}
