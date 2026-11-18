// Leo Marin on foot and behind the wheel: WASD movement with an orbit
// camera, stealing cars with E, punching with F, and a pistol with hitscan
// shots. The camera chases the car when driving.
import * as THREE from 'three';
import { updateDrive } from './vehicles.js';
import { resolveCircle } from './world.js';

export function createPlayer(world, scene, input) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6f5e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.95, 0.36), jacket);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
  head.position.y = 1.78;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
  hair.position.y = 1.82;
  g.add(hair);
  const legs = [];
  for (const sx of [-0.17, 0.17]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.26), jeans);
    leg.position.set(sx, 0.31, 0);
    g.add(leg);
    legs.push(leg);
  }
  // Pistol in the right hand, only visible while armed.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.42, 1.05, 0.3);
  gun.visible = false;
  g.add(gun);
  g.position.set(0, 0, 40);
  scene.add(g);

  const player = {
    mesh: g,
    pos: g.position,
    heading: 0,
    camYaw: Math.PI,
    camPitch: 0.32,
    onFoot: true,
    car: null,
    speed: 0,
    health: 100,
    cash: 250,
    ammo: 24,
    armed: false,
    punchCooldown: 0,
    shootCooldown: 0,
    hurtTimer: 0,
    walkPhase: 0,
    muzzle: null,
    tracer: null,
    damage(amount) {
      this.health = Math.max(0, this.health - amount);
      this.hurtTimer = 0.5;
      return this.health <= 0;
    },
    heal(amount) {
      this.health = Math.min(100, this.health + amount);
    },
  };

  // Tracer line + muzzle flash, reused for every shot.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  player.tracer = new THREE.Line(
    tracerGeo,
    new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }),
  );
  scene.add(player.tracer);
  player.muzzle = new THREE.PointLight(0xffc861, 0, 14);
  scene.add(player.muzzle);

  function nearestCar(cars, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of cars) {
      if (c.stolen) continue;
      const d = Math.hypot(c.mesh.position.x - player.pos.x, c.mesh.position.z - player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  player.update = function update(dt, ctx) {
    const { camera, audio, hud } = ctx;
    player.punchCooldown = Math.max(0, player.punchCooldown - dt);
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    const mouse = input.takeMouse();
    player.camYaw -= mouse.dx * 0.0042;
    player.camPitch = Math.max(-0.15, Math.min(0.9, player.camPitch + mouse.dy * 0.0032));

    if (player.onFoot) {
      gun.visible = player.armed;
      const run = input.down('ShiftLeft') || input.down('ShiftRight');
      const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0)
        - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
      const strafe = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0)
        - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      const speed = run ? 9.5 : 5.2;
      const sy = Math.sin(player.camYaw);
      const cy = Math.cos(player.camYaw);
      // Camera looks along -Z of its yaw; forward is (-sin, -cos) in world.
      const mx = -sy * fwd + cy * strafe;
      const mz = -cy * fwd - sy * strafe;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        player.pos.x += (mx / len) * speed * dt;
        player.pos.z += (mz / len) * speed * dt;
        player.heading = Math.atan2(mx, mz);
        player.walkPhase += dt * (run ? 13 : 9);
      }
      resolveCircle(player.pos, 0.55, world.colliders);
      const clamped = world.clampToBounds(player.pos.x, player.pos.z, 1);
      player.pos.x = clamped.x;
      player.pos.z = clamped.z;
      player.mesh.position.set(player.pos.x, 0, player.pos.z);
      player.mesh.rotation.y = player.heading;
      const swing = len > 0.01 ? Math.sin(player.walkPhase) * 0.35 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;

      // Enter the nearest car.
      if (input.wasPressed('KeyE')) {
        const car = nearestCar(ctx.traffic, 4.6);
        if (car) {
          player.enterCar(car, ctx);
        } else if (ctx.missionTruck && !ctx.missionTruck.stolen) {
          const d = Math.hypot(ctx.missionTruck.mesh.position.x - player.pos.x, ctx.missionTruck.mesh.position.z - player.pos.z);
          if (d < 5) player.enterCar(ctx.missionTruck, ctx);
        }
      }
      // Punch.
      if (input.wasPressed('KeyF') && player.punchCooldown <= 0) {
        player.punchCooldown = 0.45;
        audio.punch();
        ctx.punch(player);
      }
      // Shoot: click or Space, only while armed.
      const wantShot = input.takeClick() || input.wasPressed('Space');
      if (wantShot && player.shootCooldown <= 0) {
        if (!player.armed) {
          player.armed = true;
          hud.feed('Pistol out — click to shoot, Space also fires');
        } else if (player.ammo > 0) {
          player.shootCooldown = 0.22;
          player.ammo -= 1;
          audio.shot();
          ctx.shoot(player);
        } else {
          audio.click();
          hud.feed('Out of ammo — find the green safehouse to restock');
        }
      }
      // Third-person orbit camera.
      const dist = 8.5;
      const cx = player.pos.x + Math.sin(player.camYaw) * Math.cos(player.camPitch) * dist;
      const cz = player.pos.z + Math.cos(player.camYaw) * Math.cos(player.camPitch) * dist;
      const cy2 = 2.2 + Math.sin(player.camPitch) * dist;
      camera.position.set(cx, cy2, cz);
      camera.lookAt(player.pos.x, 1.7, player.pos.z);
      audio.engine(0);
    } else if (player.car) {
      gun.visible = false;
      updateDrive(player.car, input, dt, world);
      player.pos.x = player.car.mesh.position.x;
      player.pos.z = player.car.mesh.position.z;
      player.heading = player.car.heading;
      player.mesh.visible = false;
      audio.engine(Math.abs(player.car.speed) / 34);
      if (input.wasPressed('KeyE')) {
        player.exitCar(ctx);
      }
      // Chase camera with a little lag so turns feel weighty.
      const back = 11;
      const up = 4.6;
      const tx = player.pos.x - Math.sin(player.car.heading) * back;
      const tz = player.pos.z - Math.cos(player.car.heading) * back;
      camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 5);
      camera.position.y += (up - camera.position.y) * Math.min(1, dt * 5);
      camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 5);
      camera.lookAt(player.pos.x + Math.sin(player.car.heading) * 6, 1.4, player.pos.z + Math.cos(player.car.heading) * 6);
    }
    player.tracer.material.opacity = Math.max(0, player.tracer.material.opacity - dt * 6);
    player.muzzle.intensity = Math.max(0, player.muzzle.intensity - dt * 30);
  };

  player.enterCar = function enterCar(car, ctx) {
    car.stolen = true;
    player.car = car;
    player.onFoot = false;
    player.mesh.visible = false;
    if (!car.isMissionTruck) {
      ctx.police.addHeat(6);
      ctx.hud.feed(`Stole the ${car.name} — the law noticed`);
    } else {
      ctx.hud.feed('Truck taken — get it to the drop point');
    }
    ctx.audio.pickup();
  };

  player.exitCar = function exitCar(ctx) {
    const car = player.car;
    if (!car) return;
    player.car = null;
    player.onFoot = true;
    player.mesh.visible = true;
    const bx = player.pos.x - Math.sin(car.heading) * 3.2;
    const bz = player.pos.z - Math.cos(car.heading) * 3.2;
    player.pos.x = bx;
    player.pos.z = bz;
    player.mesh.position.set(bx, 0, bz);
    player.camYaw = car.heading + Math.PI;
    car.speed = 0;
  };

  return player;
}
