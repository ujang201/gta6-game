// Procedural Solmar Bay: a 10x10 block grid city with roads, sidewalks,
// window-textured buildings, palm trees, a beach and an ocean on the east edge.
// Everything is seeded, so seed 1337 always builds the same city.
import * as THREE from 'three';
import { RNG, clamp } from './random.js';

export const BLOCK = 40; // building block side
export const ROAD = 12; // road width
export const PITCH = BLOCK + ROAD; // 52
export const GRID = 10; // blocks per side
export const CITY_MIN = -266;
export const CITY_MAX = 266;
export const BEACH_X = 266; // sand starts here
export const OCEAN_X = 298; // water starts here

// road center lines (both axes), from -260 to +260 in steps of 52
export function roadCenters() {
  const out = [];
  for (let i = 0; i <= GRID; i++) out.push(-260 + i * PITCH);
  return out;
}

function windowTexture(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  const cols = 4;
  const rows = 8;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = rng.f() < 0.55;
      g.fillStyle = on ? lit : '#20242e';
      g.fillRect(6 + x * 14, 8 + y * 15, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a1a4e');
  grad.addColorStop(0.35, '#7a2d5e');
  grad.addColorStop(0.6, '#e85d4a');
  grad.addColorStop(0.8, '#ffb36b');
  grad.addColorStop(1, '#ffd9a0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene, rng) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const roads = roadCenters();

  // --- sky dome + fog + lights (bright warm sunset) ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe8a06a, 180, 700);

  const hemi = new THREE.HemisphereLight(0xffc98a, 0x4a3550, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.0);
  sun.position.set(-180, 140, -120);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.45);
  fill.position.set(200, 90, 180);
  scene.add(fill);

  // --- ground: asphalt everywhere, sidewalk slabs per block ---
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ color: 0x33343a, roughness: 0.95 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(20, 0, 0);
  scene.add(asphalt);

  // road center dashes (thin white boxes) for readability
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8d8c8, roughness: 0.9 });
  const dashGeo = new THREE.BoxGeometry(4, 0.06, 1.2);
  for (const r of roads) {
    for (let t = -250; t <= 250; t += 16) {
      const d1 = new THREE.Mesh(dashGeo, dashMat);
      d1.position.set(t, 0.03, r);
      scene.add(d1);
      const d2 = new THREE.Mesh(dashGeo, dashMat);
      d2.rotation.y = Math.PI / 2;
      d2.position.set(r, 0.03, t);
      scene.add(d2);
    }
  }

  // --- buildings + sidewalks ---
  const texA = windowTexture(rng, '#8a6f5c', '#ffd98a');
  const texB = windowTexture(rng, '#5c6a7a', '#9fd8ff');
  const texC = windowTexture(rng, '#7a5c6a', '#ffb36b');
  const texD = windowTexture(rng, '#6a7a5c', '#d8ffb0');
  const mats = [texA, texB, texC, texD].map(
    (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }),
  );
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.9 });

  const landmarkSpots = {};
  const landmarkBlocks = new Set(['2,2', '7,7', '8,2', '2,7', '5,5']);
  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const cx = -234 + bx * PITCH;
      const cz = -234 + bz * PITCH;
      // sidewalk slab
      const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.3, BLOCK), slabMat);
      slab.position.set(cx, 0.15, cz);
      scene.add(slab);
      // landmark blocks stay open (no buildings) so targets are reachable
      if (bx === 2 && bz === 2) landmarkSpots.bank = { x: cx, z: cz };
      if (bx === 7 && bz === 7) landmarkSpots.safehouse = { x: cx, z: cz };
      if (bx === 8 && bz === 2) landmarkSpots.marina = { x: cx, z: cz };
      if (bx === 2 && bz === 7) landmarkSpots.deal = { x: cx, z: cz };
      if (bx === 5 && bz === 5) landmarkSpots.meet = { x: cx, z: cz };
      if (landmarkBlocks.has(bx + ',' + bz)) continue;
      // 1-3 buildings per block, kept off the slab edges
      const count = rng.int(1, 3);
      const spots = [];
      if (count === 1) spots.push([0, 0]);
      else if (count === 2) spots.push([-9, -9], [9, 9]);
      else spots.push([-10, -10], [10, -10], [0, 10]);
      for (const [ox, oz] of spots) {
        const w = rng.range(10, 16);
        const d = rng.range(10, 16);
        const h = rng.range(9, 42);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[rng.int(0, 3)]);
        b.position.set(cx + ox, h / 2 + 0.3, cz + oz);
        scene.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
        roof.position.set(cx + ox, h + 0.55, cz + oz);
        scene.add(roof);
        colliders.push({
          minX: cx + ox - w / 2 - 0.4,
          maxX: cx + ox + w / 2 + 0.4,
          minZ: cz + oz - d / 2 - 0.4,
          maxZ: cz + oz + d / 2 + 0.4,
        });
      }
      // remember a few open blocks for landmarks (no buildings there)
      if (bx === 2 && bz === 2) landmarkSpots.bank = { x: cx, z: cz };
      if (bx === 7 && bz === 7) landmarkSpots.safehouse = { x: cx, z: cz };
      if (bx === 8 && bz === 2) landmarkSpots.marina = { x: cx, z: cz };
      if (bx === 2 && bz === 7) landmarkSpots.deal = { x: cx, z: cz };
      if (bx === 5 && bz === 5) landmarkSpots.meet = { x: cx, z: cz };
    }
  }
  // landmark blocks were left open above, so their targets are reachable

  // --- palm trees along sidewalks ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7a3a, roughness: 0.9 });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 7, 6);
  const frondGeo = new THREE.ConeGeometry(1.6, 3.4, 4);
  frondGeo.scale(1, 1, 0.35);
  for (let i = 0; i < 46; i++) {
    const bx = rng.int(0, GRID - 1);
    const bz = rng.int(0, GRID - 1);
    const cx = -234 + bx * PITCH + rng.range(-17, 17);
    const cz = -234 + bz * PITCH + rng.range(-17, 17);
    // keep palms off roads and out of building footprints
    if (colliders.some((c) => cx > c.minX - 1 && cx < c.maxX + 1 && cz > c.minZ - 1 && cz < c.maxZ + 1)) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(cx, 3.5, cz);
    trunk.rotation.z = rng.range(-0.08, 0.08);
    scene.add(trunk);
    for (let f = 0; f < 5; f++) {
      const fr = new THREE.Mesh(frondGeo, leafMat);
      const a = (f / 5) * Math.PI * 2 + rng.f();
      fr.position.set(cx + Math.cos(a) * 1.1, 7.1, cz + Math.sin(a) * 1.1);
      fr.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      scene.add(fr);
    }
  }

  // --- beach + ocean on the east edge ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 560),
    new THREE.MeshStandardMaterial({ color: 0xe8d29a, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + 16, 0.05, 0);
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 700),
    new THREE.MeshStandardMaterial({ color: 0x1a5a8a, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 160, 0.02, 0);
  scene.add(ocean);

  // --- landmark markers (visible beacons, no collision) ---
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85 });
  const beaconGeo = new THREE.CylinderGeometry(0.5, 0.5, 26, 8);
  for (const key of Object.keys(landmarkSpots)) {
    const p = landmarkSpots[key];
    const beam = new THREE.Mesh(beaconGeo, beaconMat);
    beam.position.set(p.x, 13, p.z);
    beam.name = 'beacon-' + key;
    scene.add(beam);
  }
  // Pay-N-Spray garage on the south road
  const garage = new THREE.Mesh(
    new THREE.BoxGeometry(18, 7, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a6ab0, roughness: 0.7 }),
  );
  garage.position.set(-104, 3.5, 252);
  scene.add(garage);
  landmarkSpots.paynspray = { x: -104, z: 244 };
  colliders.push({ minX: -113, maxX: -95, minZ: 246, maxZ: 258 });

  // --- collision helpers ---
  function collide(x, z, radius) {
    let px = x;
    let pz = z;
    for (const c of colliders) {
      if (px + radius > c.minX && px - radius < c.maxX && pz + radius > c.minZ && pz - radius < c.maxZ) {
        const pushL = px + radius - c.minX;
        const pushR = c.maxX - (px - radius);
        const pushU = pz + radius - c.minZ;
        const pushD = c.maxZ - (pz - radius);
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) px = c.minX - radius;
        else if (m === pushR) px = c.maxX + radius;
        else if (m === pushU) pz = c.minZ - radius;
        else pz = c.maxZ + radius;
      }
    }
    px = clamp(px, CITY_MIN, 292);
    pz = clamp(pz, CITY_MIN, CITY_MAX);
    return { x: px, z: pz };
  }

  function onRoad(x, z) {
    for (const r of roads) {
      if (Math.abs(x - r) < ROAD / 2 + 1 || Math.abs(z - r) < ROAD / 2 + 1) return true;
    }
    return false;
  }

  function randomRoadPoint(rng2) {
    const axis = rng2.chance(0.5) ? 'x' : 'z';
    const road = roads[rng2.int(0, roads.length - 1)];
    const along = rng2.range(-250, 250);
    return axis === 'x' ? { x: along, z: road } : { x: road, z: along };
  }

  return { colliders, roads, landmarks: landmarkSpots, collide, onRoad, randomRoadPoint };
}
