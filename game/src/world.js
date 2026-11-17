// world.js — Solmar Bay itself: a procedural sunset city on a fixed seed.
// A 10x10 block grid of roads and sidewalks, buildings with runtime-painted
// window textures (no image files), palm trees along the boulevard, and a
// beach with the sea on the west edge. Also owns the collision boxes and the
// road graph the traffic AI drives on.

import * as THREE from 'three';
import { makeStream, clamp, hashNoise } from './random.js';

export const BLOCK = 46; // block pitch (road centre to road centre)
export const ROAD_W = 13; // road width
export const GRID = 10; // blocks per side
export const CITY_HALF = (GRID * BLOCK) / 2; // 230
export const SEA_X = -CITY_HALF - 34; // shoreline west of the city

const PALETTE = {
  asphalt: 0x2e2a33,
  sidewalk: 0x8d8578,
  sand: 0xd9b380,
  sea: 0x1f6f8b,
  seaDeep: 0x14506b,
  building: [0xc98d6b, 0xb7a284, 0x9fb4c0, 0xd9b48f, 0xa8b0a0, 0xc4a4a4, 0x8fa3b8, 0xe0cfa8],
  glass: 0x2a3f55,
  roof: 0x5c4a3a,
  neon: [0xff5da2, 0x39d0ff, 0xffc94d, 0x7CFC98],
};

// Paint a lit-window facade texture on a canvas at runtime.
function facadeTexture(rng, baseColor, floors, cols) {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  g.fillRect(0, 0, w, h);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const cw = w / cols;
  const ch = h / floors;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng.next();
      if (lit < 0.42) {
        g.fillStyle = lit < 0.22 ? '#ffd98a' : '#ffeec0';
      } else if (lit < 0.55) {
        g.fillStyle = '#7fb7d9';
      } else {
        g.fillStyle = '#232c3d';
      }
      g.fillRect(c * cw + cw * 0.22, f * ch + ch * 0.25, cw * 0.56, ch * 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.rng = makeStream(seed);
    this.buildings = []; // {minX,maxX,minZ,maxZ,height}
    this.palms = [];
    this.payNSpray = []; // {x,z,r}
    this.safehouse = null;
    this.roadCentres = [];
    for (let i = 0; i < GRID + 1; i++) {
      this.roadCentres.push(-CITY_HALF + i * BLOCK);
    }
    this.buildSky();
    this.buildGround();
    this.buildCity();
    this.buildBeach();
    this.buildLights();
  }

  buildSky() {
    const scene = this.scene;
    scene.background = new THREE.Color(0xff9e5e);
    scene.fog = new THREE.Fog(0xe88a5a, 120, 620);
    // Gradient dome: warm horizon fading to dusky violet overhead.
    const geo = new THREE.SphereGeometry(900, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3b2a63) },
        mid: { value: new THREE.Color(0xff7e4d) },
        low: { value: new THREE.Color(0xffc27a) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
        void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }`,
    });
    this.skyDome = new THREE.Mesh(geo, mat);
    scene.add(this.skyDome);
    // Low sun disc on the west, over the sea.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(34, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
    );
    sun.position.set(-760, 95, -120);
    sun.lookAt(0, 40, 0);
    scene.add(sun);
  }

  buildLights() {
    const sun = new THREE.DirectionalLight(0xffb37a, 2.4);
    sun.position.set(-260, 190, -140);
    sun.castShadow = false;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xffd9b0, 0x4a3a55, 0.9));
    const dusk = new THREE.PointLight(0xff8a5c, 60, 300);
    dusk.position.set(0, 60, 0);
    this.scene.add(dusk);
  }

  buildGround() {
    const scene = this.scene;
    // One big asphalt slab for the whole city, sidewalks drawn as a grid of
    // slightly raised lighter slabs per block.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 8, CITY_HALF * 2 + 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
    const walkGeo = new THREE.BoxGeometry(BLOCK - ROAD_W + 2, 0.35, BLOCK - ROAD_W + 2);
    const walkMesh = new THREE.InstancedMesh(walkGeo, walkMat, GRID * GRID);
    const m4 = new THREE.Matrix4();
    let idx = 0;
    for (let ix = 0; ix < GRID; ix++) {
      for (let iz = 0; iz < GRID; iz++) {
        const cx = -CITY_HALF + BLOCK / 2 + ix * BLOCK;
        const cz = -CITY_HALF + BLOCK / 2 + iz * BLOCK;
        m4.makeTranslation(cx, 0.18, cz);
        walkMesh.setMatrixAt(idx++, m4);
      }
    }
    walkMesh.receiveShadow = true;
    scene.add(walkMesh);

    // Road centre dashes, instanced thin white boxes.
    const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c0 });
    const dashes = [];
    for (const c of this.roadCentres) {
      for (let t = -CITY_HALF + 8; t < CITY_HALF - 4; t += 9) {
        dashes.push([c, t, 0]);
        dashes.push([t, c, 1]);
      }
    }
    const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    dashes.forEach(([x, z, rot], i) => {
      m4.makeRotationY(rot ? Math.PI / 2 : 0);
      m4.setPosition(x, 0.05, z);
      dashMesh.setMatrixAt(i, m4);
    });
    scene.add(dashMesh);
  }

  buildCity() {
    const rng = this.rng;
    const scene = this.scene;
    const roofMat = new THREE.MeshStandardMaterial({ color: PALETTE.roof, roughness: 1 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 1 });
    const palmTrunk = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
    const palmTop = new THREE.ConeGeometry(3.4, 4.5, 7);

    for (let ix = 0; ix < GRID; ix++) {
      for (let iz = 0; iz < GRID; iz++) {
        const cx = -CITY_HALF + BLOCK / 2 + ix * BLOCK;
        const cz = -CITY_HALF + BLOCK / 2 + iz * BLOCK;
        const distCentre = Math.hypot(cx, cz) / CITY_HALF;
        const downtown = distCentre < 0.45;
        const towerChance = downtown ? 0.5 : 0.08;
        const isTower = rng.chance(towerChance);
        const h = isTower
          ? rng.range(38, 78)
          : rng.range(9, downtown ? 26 : 16);
        const w = rng.range(15, 24);
        const d = rng.range(15, 24);
        const floors = Math.max(2, Math.round(h / 4));
        const cols = Math.max(3, Math.round(w / 4));
        const base = rng.pick(PALETTE.building);
        const tex = facadeTexture(rng, base, floors, cols);
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx, h / 2 + 0.35, cz);
        scene.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1, d + 1), roofMat);
        roof.position.set(cx, h + 0.85, cz);
        scene.add(roof);
        // Rooftop box / antenna on towers.
        if (isTower && rng.chance(0.6)) {
          const ant = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 9, 5),
            new THREE.MeshStandardMaterial({ color: 0x888888 }),
          );
          ant.position.set(cx + w * 0.2, h + 5, cz);
          scene.add(ant);
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff4444 }),
          );
          beacon.position.set(cx + w * 0.2, h + 9.5, cz);
          scene.add(beacon);
        }
        this.buildings.push({
          minX: cx - w / 2, maxX: cx + w / 2,
          minZ: cz - d / 2, maxZ: cz + d / 2,
          height: h,
        });
        // Palms on the block corners.
        if (rng.chance(0.55)) {
          const px = cx + (rng.chance(0.5) ? 1 : -1) * (BLOCK / 2 - 4);
          const pz = cz + (rng.chance(0.5) ? 1 : -1) * (BLOCK / 2 - 4);
          const trunk = new THREE.Mesh(palmTrunk, trunkMat);
          trunk.position.set(px, 3.8, pz);
          trunk.rotation.z = rng.range(-0.08, 0.08);
          scene.add(trunk);
          const top = new THREE.Mesh(palmTop, leafMat);
          top.position.set(px, 8.6, pz);
          scene.add(top);
          this.palms.push({ x: px, z: pz });
        }
      }
    }

    // Pay-N-Spray garage: two glowing bays on the east side.
    const garageMat = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.6 });
    for (const [gx, gz] of [[CITY_HALF - 12, -60], [CITY_HALF - 12, 130]]) {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 12), garageMat);
      bay.position.set(gx, 3.5, gz);
      scene.add(bay);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(14, 2, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xffc94d }),
      );
      sign.position.set(gx, 8, gz - 6.4);
      scene.add(sign);
      this.payNSpray.push({ x: gx, z: gz, r: 12 });
    }

    // Safehouse: a small bungalow with a warm porch light, south edge.
    const sh = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(14, 5, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }),
    );
    walls.position.y = 2.5;
    sh.add(walls);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(10.5, 4, 4),
      new THREE.MeshStandardMaterial({ color: 0xb05a3a, roughness: 1 }),
    );
    roof.position.y = 7;
    roof.rotation.y = Math.PI / 4;
    sh.add(roof);
    const porch = new THREE.PointLight(0xffc27a, 40, 40);
    porch.position.set(0, 4, 6);
    sh.add(porch);
    sh.position.set(-40, 0.35, CITY_HALF - 24);
    scene.add(sh);
    this.safehouse = { x: -40, z: CITY_HALF - 24, r: 12 };
    this.buildings.push({
      minX: -47, maxX: -33, minZ: CITY_HALF - 29, maxZ: CITY_HALF - 19, height: 9,
    });
  }

  buildBeach() {
    const scene = this.scene;
    // Sand strip west of the city, gently rippled by hash noise.
    const sandGeo = new THREE.PlaneGeometry(60, CITY_HALF * 2 + 8, 24, 60);
    const pos = sandGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, hashNoise(x, y, this.seed) * 0.5);
    }
    sandGeo.computeVertexNormals();
    const sand = new THREE.Mesh(
      sandGeo,
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(SEA_X + 8, 0.05, 0);
    scene.add(sand);
    // Sea: two overlapping planes, deep + shallow shimmer.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(320, CITY_HALF * 2 + 200),
      new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.35 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(SEA_X - 150, 0.1, 0);
    scene.add(sea);
    const sea2 = new THREE.Mesh(
      new THREE.PlaneGeometry(60, CITY_HALF * 2 + 200),
      new THREE.MeshStandardMaterial({ color: PALETTE.seaDeep, roughness: 0.2, metalness: 0.4, transparent: true, opacity: 0.7 }),
    );
    sea2.rotation.x = -Math.PI / 2;
    sea2.position.set(SEA_X - 32, 0.15, 0);
    scene.add(sea2);
    // Boardwalk strip between sand and city.
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.4, CITY_HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 1 }),
    );
    walk.position.set(-CITY_HALF - 6, 0.2, 0);
    scene.add(walk);
  }

  // Nearest road centre coordinate on one axis.
  nearestRoad(v) {
    let best = this.roadCentres[0];
    for (const c of this.roadCentres) {
      if (Math.abs(c - v) < Math.abs(best - v)) best = c;
    }
    return best;
  }

  // Is a point on a road (within the asphalt band of either axis)?
  onRoad(x, z) {
    const dx = Math.abs(x - this.nearestRoad(x));
    const dz = Math.abs(z - this.nearestRoad(z));
    return dx < ROAD_W / 2 || dz < ROAD_W / 2;
  }

  // Push a circle (x,z,r) out of every building AABB. Returns corrected pos.
  collideCircle(x, z, r) {
    for (const b of this.buildings) {
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Dead centre: push out along the smallest penetration axis.
          const pl = x - (b.minX - r);
          const pr = b.maxX + r - x;
          const pt = z - (b.minZ - r);
          const pb = b.maxZ + r - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.minX - r;
          else if (m === pr) x = b.maxX + r;
          else if (m === pt) z = b.minZ - r;
          else z = b.maxZ + r;
        }
      }
    }
    // Keep everything out of the sea and inside the map.
    if (x < SEA_X + 6) x = SEA_X + 6;
    if (x > CITY_HALF + 4) x = CITY_HALF + 4;
    if (z < -CITY_HALF - 4) z = -CITY_HALF - 4;
    if (z > CITY_HALF + 4) z = CITY_HALF + 4;
    return { x, z };
  }

  // A point inside a building footprint?
  insideBuilding(x, z) {
    for (const b of this.buildings) {
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  }

  // Random free sidewalk point (not inside a building, not on a road).
  randomSidewalkPoint(rng) {
    for (let tries = 0; tries < 40; tries++) {
      const x = rng.range(-CITY_HALF + 10, CITY_HALF - 10);
      const z = rng.range(-CITY_HALF + 10, CITY_HALF - 10);
      if (!this.onRoad(x, z) && !this.insideBuilding(x, z)) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  // Random point on a road, for traffic spawns.
  randomRoadPoint(rng) {
    const horizontal = rng.chance(0.5);
    const road = rng.pick(this.roadCentres);
    const along = rng.range(-CITY_HALF + 8, CITY_HALF - 8);
    return horizontal ? { x: along, z: road } : { x: road, z: along };
  }
}
