// The 5 chained missions of SOLMAR BAY. Each mission has a title, a
// briefing, an objective line and a target on the map. The main loop calls
// update() every frame with the player's state; missions report events
// (toasts) and advance when their conditions are met.
import * as THREE from 'three';
import { dist2D } from './random.js';

function makeRivalMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a06a, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), shirt);
  body.position.y = 1.1;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.75;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.32), pants);
  legs.position.y = 0.38;
  g.add(legs);
  return g;
}

export class Missions {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    const L = world.landmarks;
    this.defs = [
      {
        id: 'm1', title: 'First Wheels',
        briefing: 'Leo needs wheels. Steal a car and bring it to the meet.',
        objective: 'Steal a car, then drive to the meet point',
        target: L.meet, radius: 9, reward: 250,
      },
      {
        id: 'm2', title: 'Getaway',
        briefing: 'The crew is hot. Lose the heat and reach the safehouse.',
        objective: 'Reach the safehouse (2-star heat)',
        target: L.safehouse, radius: 10, reward: 300,
      },
      {
        id: 'm3', title: 'The Pickup',
        briefing: 'A deal at the old yard. The rival crew will not let it slide.',
        objective: 'Go to the deal, then take out the rival crew',
        target: L.deal, radius: 10, reward: 500,
      },
      {
        id: 'm4', title: 'Harbor Heist',
        briefing: 'A truck full of goods sits at the marina. Take it to the warehouse.',
        objective: 'Reach the marina, then deliver a car to the warehouse',
        target: L.marina, radius: 10, reward: 800,
      },
      {
        id: 'm5', title: 'The Big One',
        briefing: 'The bank job. Grab the cash and vanish before the city locks down.',
        objective: 'Hit the bank, grab the cash, escape to the safehouse',
        target: L.bank, radius: 10, reward: 1000,
      },
    ];
    // delivery point for mission 4 (a warehouse block on the west side)
    this.delivery = { x: -234, z: -182 };
    this.index = -1; // -1 = not started
    this.stage = 0; // 0 = go to target, 1 = second phase
    this.rivals = [];
    this.done = false;
    this.events = []; // strings for the HUD to show as toasts
    this.onReward = null; // callback(amount)
    this.onWanted = null; // callback(stars)
    this.onDamage = null; // callback(amount) when a rival shoots the player
  }

  start() {
    this.index = 0;
    this.stage = 0;
    this.events.push('Mission 1: ' + this.defs[0].title + ' — ' + this.defs[0].briefing);
  }

  current() {
    if (this.index < 0 || this.index >= this.defs.length) return null;
    return this.defs[this.index];
  }

  // where the minimap marker should point right now
  markerTarget() {
    const cur = this.current();
    if (!cur) return null;
    if (this.index === 3 && this.stage === 1) return this.delivery;
    if (this.index === 4 && this.stage === 1) return this.world.landmarks.safehouse;
    return cur.target;
  }

  // player fired a shot from (ox,oz) along heading; returns true if a rival was hit
  tryHitShot(ox, oz, heading) {
    for (const r of this.rivals) {
      if (r.hp <= 0) continue;
      const dx = r.x - ox;
      const dz = r.z - oz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 34) continue;
      // angle between the shot direction and the rival
      const shotX = Math.cos(heading);
      const shotZ = -Math.sin(heading);
      const dot = (dx * shotX + dz * shotZ) / (d || 1);
      if (dot > 0.86) {
        r.hp -= 34;
        if (r.hp <= 0) {
          r.mesh.visible = false;
          this.events.push('Rival down.');
        }
        return true;
      }
    }
    return false;
  }

  spawnRivals() {
    const L = this.world.landmarks.deal;
    for (let i = 0; i < 3; i++) {
      const mesh = makeRivalMesh();
      const x = L.x + this.rng.range(-8, 8);
      const z = L.z + this.rng.range(-8, 8);
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.rivals.push({ mesh, x, z, hp: 100, shootTimer: this.rng.range(0.5, 1.5) });
    }
    this.events.push('Rival crew! Take them out.');
  }

  clearRivals() {
    for (const r of this.rivals) this.scene.remove(r.mesh);
    this.rivals = [];
  }

  completeMission() {
    const cur = this.defs[this.index];
    if (this.onReward) this.onReward(cur.reward);
    this.events.push('Mission complete: ' + cur.title + ' (+$' + cur.reward + ')');
    this.clearRivals();
    this.index += 1;
    this.stage = 0;
    if (this.index >= this.defs.length) {
      this.done = true;
      this.events.push('THE BIG ONE — Solmar Bay is yours. All missions complete!');
      return;
    }
    const next = this.defs[this.index];
    this.events.push('Mission ' + (this.index + 1) + ': ' + next.title + ' — ' + next.briefing);
    if (this.index === 1 && this.onWanted) this.onWanted(2);
  }

  update(dt, state) {
    // state: {px, pz, inCar}
    const cur = this.current();
    if (!cur || this.done) return;
    // rivals shoot at the player
    for (const r of this.rivals) {
      if (r.hp <= 0) continue;
      r.shootTimer -= dt;
      const d = dist2D(r.x, r.z, state.px, state.pz);
      if (r.shootTimer <= 0 && d < 26) {
        r.shootTimer = 1.4;
        // face the player and fire (a tracer-less hit chance)
        r.mesh.rotation.y = Math.atan2(-(state.pz - r.z), state.px - r.x);
        if (this.rng.f() < 0.45 && this.onDamage) this.onDamage(6);
      }
    }
    if (this.index === 0) {
      if (state.inCar && dist2D(state.px, state.pz, cur.target.x, cur.target.z) < cur.radius) {
        this.completeMission();
      }
    } else if (this.index === 1) {
      if (dist2D(state.px, state.pz, cur.target.x, cur.target.z) < cur.radius) {
        if (this.onWanted) this.onWanted(0);
        this.completeMission();
      }
    } else if (this.index === 2) {
      if (this.stage === 0) {
        if (dist2D(state.px, state.pz, cur.target.x, cur.target.z) < cur.radius) {
          this.stage = 1;
          this.spawnRivals();
        }
      } else if (this.rivals.length > 0 && this.rivals.every((r) => r.hp <= 0)) {
        this.completeMission();
      }
    } else if (this.index === 3) {
      if (this.stage === 0) {
        if (dist2D(state.px, state.pz, cur.target.x, cur.target.z) < cur.radius) {
          this.stage = 1;
          this.events.push('Truck secured. Deliver a car to the warehouse (west side).');
        }
      } else if (state.inCar && dist2D(state.px, state.pz, this.delivery.x, this.delivery.z) < 10) {
        this.completeMission();
      }
    } else if (this.index === 4) {
      if (this.stage === 0) {
        if (dist2D(state.px, state.pz, cur.target.x, cur.target.z) < cur.radius) {
          this.stage = 1;
          if (this.onReward) this.onReward(2000);
          if (this.onWanted) this.onWanted(3);
          this.events.push('Cash grabbed (+$2000)! The whole city is coming — reach the safehouse.');
        }
      } else if (dist2D(state.px, state.pz, this.world.landmarks.safehouse.x, this.world.landmarks.safehouse.z) < 10) {
        if (this.onWanted) this.onWanted(0);
        this.completeMission();
      }
    }
  }

  // drain pending toast events (HUD calls this each frame)
  takeEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
