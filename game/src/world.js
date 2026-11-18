// The city of Solmar Bay: a seeded procedural grid, built once at boot.
// 10x10 blocks, roads between them, a beach and ocean on the west edge,
// sunset sky, palm trees and canvas-painted building windows. No image
// assets anywhere — every texture is drawn at runtime.
import * as THREE from 'three';
import { makeRng } from './random.js';

export const BLOCK = 24;
export const ROAD = 10;
export const GRID = 10;
export const HALF = (GRID * BLOCK + (GRID + 1) * ROAD) / 2; // 175
export const WORLD_SEED = 1337;

// Road centre lines, one per gap between block rows/columns.
export function roadCentres() {
  const out = [];
  for (let i = 0; i <= GRID; i++) out.push(-HALF + ROAD / 2 + i * (BLOCK + ROAD));
  return out;
}

// Push a circle (player, car, ped) out of an axis-aligned box collider.
export function resolveCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre is inside the box: push out along the smallest penetration.
      const pl = pos.x - c.minX;
      const pr = c.maxX - pos.x;
      const pt = pos.z - c.minZ;
      const pb = c.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = c.minX - radius;
      else if (m === pr) pos.x = c.maxX + radius;
      else if (m === pt) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
}

function windowTexture(rng, base) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const cols = 5;
  const rows = 10;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(0.42);
      g.fillStyle = lit ? (rng.chance(0.5) ? '#ffd98a' : '#ffeec2') : '#1d2733';
      g.fillRect(10 + x * 22, 12 + y * 24, 14, 15);
    }
  }
  // Darker roof band so the top reads as a roofline.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 128, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene) {
  const rng = makeRng(WORLD_SEED);
  const group = new THREE.Group();
  const colliders = [];
  const centres = roadCentres();

  // Sunset: warm directional sun plus a soft orange hemisphere wash.
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-60, 90, -40);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xff9a5c, 0x3a2a3a, 0.85));
  scene.fog = new THREE.Fog(0xe2603a, 120, 420);

  // Sky dome: a big sphere painted with a vertical sunset gradient.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2b1a4d');
  grad.addColorStop(0.35, '#c94b2d');
  grad.addColorStop(0.62, '#ff7a33');
  grad.addColorStop(0.8, '#ffb347');
  grad.addColorStop(1, '#ffd9a0');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  group.add(sky);

  // The sun disc, low on the horizon to the west over the ocean.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false }),
  );
  sunDisc.position.set(-420, 70, -40);
  sunDisc.lookAt(0, 70, -40);
  group.add(sunDisc);

  // Ground slab for the whole city.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2 + 130, 0.5, HALF * 2 + 20),
    new THREE.MeshLambertMaterial({ color: 0x8a7a68 }),
  );
  ground.position.set(-55, -0.25, 0);
  group.add(ground);

  // Roads: dark asphalt strips with pale centre dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e2a33 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c4 });
  for (const c of centres) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.1, ROAD), roadMat);
    h.position.set(0, 0.02, c);
    group.add(h);
    const v = new THREE.Mesh(new THREE.BoxGeometry(ROAD, 0.1, HALF * 2), roadMat);
    v.position.set(c, 0.02, 0);
    group.add(v);
    for (let d = -HALF + 14; d < HALF - 10; d += 18) {
      const dashH = new THREE.Mesh(new THREE.BoxGeometry(7, 0.05, 0.9), dashMat);
      dashH.position.set(d, 0.08, c);
      group.add(dashH);
      const dashV = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 7), dashMat);
      dashV.position.set(c, 0.08, d);
      group.add(dashV);
    }
  }

  // Beach strip and ocean on the west edge.
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.3, HALF * 2 + 20),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }),
  );
  sand.position.set(-HALF - 23, 0.05, 0);
  group.add(sand);
  const oceanMat = new THREE.MeshLambertMaterial({ color: 0x1d5f7a });
  const ocean = new THREE.Mesh(new THREE.BoxGeometry(120, 0.2, HALF * 2 + 20), oceanMat);
  ocean.position.set(-HALF - 46 - 60, 0.0, 0);
  group.add(ocean);

  // Building facades: a few shared window textures, tinted per building.
  const bases = ['#7a6a58', '#6b5f52', '#84755f', '#5d6b73', '#8a5f4a', '#4f5a52'];
  const facadeTex = bases.map((b) => windowTexture(rng, b));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3230 });

  // Special spots get reserved blocks so nothing is built on them.
  const spots = {
    safehouse: { x: centres[1], z: centres[8] },
    paynspray: { x: centres[8], z: centres[2] },
    harbor: { x: centres[1], z: centres[1] },
    bank: { x: centres[5], z: centres[5] },
    meet: { x: centres[7], z: centres[7] },
    deal: { x: centres[3], z: centres[8] },
    drop: { x: centres[8], z: centres[8] },
    hospital: { x: centres[2], z: centres[4] },
  };
  const reserved = new Set();
  for (const s of Object.values(spots)) {
    const bi = Math.round((s.x + HALF - ROAD / 2) / (BLOCK + ROAD) - 0.5);
    const bj = Math.round((s.z + HALF - ROAD / 2) / (BLOCK + ROAD) - 0.5);
    reserved.add(`${bi},${bj}`);
  }

  // One building per block (some blocks stay parks or empty lots).
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const cx = -HALF + ROAD + BLOCK / 2 + i * (BLOCK + ROAD);
      const cz = -HALF + ROAD + BLOCK / 2 + j * (BLOCK + ROAD);
      if (reserved.has(`${i},${j}`)) continue;
      if (rng.chance(0.14)) {
        // Park: a few palms and a bench-sized slab, no collider.
        for (let p = 0; p < 3; p++) {
          const px = cx + rng.range(-8, 8);
          const pz = cz + rng.range(-8, 8);
          group.add(makePalm(px, pz, rng));
        }
        continue;
      }
      const w = rng.range(13, 20);
      const d = rng.range(13, 20);
      const h = rng.range(9, 42);
      const tex = rng.pick(facadeTex);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(cx + rng.range(-1.5, 1.5), h / 2, cz + rng.range(-1.5, 1.5));
      group.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
      roof.position.set(b.position.x, h + 0.4, b.position.z);
      group.add(roof);
      colliders.push({
        minX: b.position.x - w / 2,
        maxX: b.position.x + w / 2,
        minZ: b.position.z - d / 2,
        maxZ: b.position.z + d / 2,
      });
      // A palm or two on the block corner.
      if (rng.chance(0.6)) {
        group.add(makePalm(cx + w / 2 + 2.5, cz + d / 2 + 2.5, rng));
      }
    }
  }

  // Palms lining the beach.
  for (let z = -HALF + 12; z < HALF - 8; z += 26) {
    group.add(makePalm(-HALF - 12, z + rng.range(-4, 4), rng));
  }

  // Safehouse: a low green-roofed house with a glowing marker ring.
  addSpotBuilding(group, colliders, spots.safehouse, 0x3f7a4a, 7);
  // Pay-N-Spray: blue bay with a striped awning.
  addSpotBuilding(group, colliders, spots.paynspray, 0x2b5f8a, 6);
  // Harbor: crates near the docks.
  for (let k = 0; k < 5; k++) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, 3),
      new THREE.MeshLambertMaterial({ color: [0xa8763e, 0x7a8a99, 0x9a6a3e][k % 3] }),
    );
    crate.position.set(spots.harbor.x + rng.range(-8, 8), 1.5, spots.harbor.z + rng.range(-8, 8));
    group.add(crate);
    colliders.push({
      minX: crate.position.x - 1.5,
      maxX: crate.position.x + 1.5,
      minZ: crate.position.z - 1.5,
      maxZ: crate.position.z + 1.5,
    });
  }
  // Bank: a tall pale tower with columns.
  const bankTower = new THREE.Mesh(
    new THREE.BoxGeometry(18, 46, 18),
    new THREE.MeshLambertMaterial({ map: facadeTex[3], color: 0xcfc4ae }),
  );
  bankTower.position.set(spots.bank.x, 23, spots.bank.z);
  group.add(bankTower);
  colliders.push({
    minX: spots.bank.x - 9,
    maxX: spots.bank.x + 9,
    minZ: spots.bank.z - 9,
    maxZ: spots.bank.z + 9,
  });

  scene.add(group);

  function isRoad(x, z) {
    const onX = centres.some((c) => Math.abs(z - c) < ROAD / 2 + 0.5);
    const onZ = centres.some((c) => Math.abs(x - c) < ROAD / 2 + 0.5);
    return onX || onZ;
  }

  return {
    group,
    colliders,
    centres,
    spots,
    oceanMat,
    isRoad,
    clampToBounds(x, z, margin) {
      const m = margin || 0;
      return {
        x: Math.max(-HALF - 40 + m, Math.min(HALF - m, x)),
        z: Math.max(-HALF + m, Math.min(HALF - m, z)),
      };
    },
    update(dt, t) {
      // Gentle ocean swell so the water is not a dead slab.
      oceanMat.color.setHSL(0.55, 0.62, 0.32 + Math.sin(t * 0.7) * 0.02);
    },
  };
}

function makePalm(x, z, rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.55, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  );
  trunk.position.y = 3.5;
  g.add(trunk);
  const top = new THREE.Mesh(
    new THREE.ConeGeometry(3.4, 4.5, 7),
    new THREE.MeshLambertMaterial({ color: 0x2f7a3a }),
  );
  top.position.y = 8.6;
  g.add(top);
  const tilt = rng ? rng.range(-0.12, 0.12) : 0;
  g.rotation.z = tilt;
  g.position.set(x, 0, z);
  return g;
}

function addSpotBuilding(group, colliders, spot, color, height) {
  const b = new THREE.Mesh(
    new THREE.BoxGeometry(12, height, 10),
    new THREE.MeshLambertMaterial({ color }),
  );
  b.position.set(spot.x + 14, height / 2, spot.z);
  group.add(b);
  colliders.push({
    minX: b.position.x - 6,
    maxX: b.position.x + 6,
    minZ: b.position.z - 5,
    maxZ: b.position.z + 5,
  });
}
