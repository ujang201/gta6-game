// The Marlin Crew's five jobs: a chained story told through briefings,
// waypoint beacons and cash rewards. Each mission is a list of small steps;
// finish them all and the crew's spree is complete.
import * as THREE from 'three';
import { makeCarMesh } from './vehicles.js';
import { spawnRival } from './peds.js';

const MISSION_DEFS = [
  {
    id: 'wheels',
    title: 'FIRST WHEELS',
    briefing: 'Rosa: Leo, we need wheels. Steal any car and bring it to the meet.',
    reward: 250,
    steps: [
      { type: 'steal', text: 'Steal any car (walk up and press E)' },
      { type: 'goto', at: 'meet', text: 'Drive to the meet point' },
    ],
  },
  {
    id: 'getaway',
    title: 'GETAWAY',
    briefing: 'Rosa: The cops are onto the meet. Two stars — lose them at the safehouse.',
    reward: 400,
    steps: [
      { type: 'escape', text: 'Lose the heat — reach the safehouse or shake the cops' },
    ],
  },
  {
    id: 'pickup',
    title: 'THE PICKUP',
    briefing: 'Rosa: A deal at the docks went sour. The rival crew is waiting — handle it.',
    reward: 600,
    steps: [
      { type: 'goto', at: 'deal', text: 'Drive to the deal at the docks' },
      { type: 'shootout', text: 'Take down the rival crew (3 left)' },
    ],
  },
  {
    id: 'harbor',
    title: 'HARBOR HEIST',
    briefing: 'Rosa: The truck is in the harbour yard. Steal it and bring it to the drop.',
    reward: 1200,
    steps: [
      { type: 'truck', text: 'Steal the cargo truck at the harbour' },
      { type: 'deliver', at: 'drop', text: 'Deliver the truck to the drop point' },
    ],
  },
  {
    id: 'bigone',
    title: 'THE BIG ONE',
    briefing: 'Rosa: The bank. Grab the vault cash and get out clean — or at least get out.',
    reward: 3000,
    steps: [
      { type: 'goto', at: 'bank', text: 'Reach the Solmar Bay Bank' },
      { type: 'grab', text: 'Hold position — crack the vault' },
      { type: 'escape', text: 'Lose the three-star heat — reach the safehouse' },
    ],
  },
];

export function createMissions(game) {
  const { world, scene, player, police, hud, audio } = game;
  // Waypoint beacon: a shaft of light, a floating diamond and a ground ring.
  const beacon = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  shaft.position.y = 30;
  beacon.add(shaft);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd94a }),
  );
  gem.position.y = 9;
  beacon.add(gem);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.4, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  const m = {
    index: -1, // -1: no job yet; 0..4: job running; 5: all done
    step: 0,
    active: false,
    grabTimer: 0,
    rivals: [],
    truck: null,
    beacon,
    def() {
      return this.index >= 0 && this.index < MISSION_DEFS.length ? MISSION_DEFS[this.index] : null;
    },
    stepDef() {
      const d = this.def();
      return d ? d.steps[this.step] : null;
    },
    startNext() {
      if (this.index >= MISSION_DEFS.length) return false;
      this.index += 1;
      if (this.index >= MISSION_DEFS.length) {
        this.active = false;
        beacon.visible = false;
        hud.setObjective('', 'All five jobs done — Solmar Bay is yours, Leo.');
        return false;
      }
      this.step = 0;
      this.active = true;
      this.grabTimer = 0;
      const d = this.def();
      hud.setObjective(d.title, d.briefing);
      hud.feed(d.briefing);
      audio.sting();
      if (d.id === 'getaway') police.setWanted(2);
      if (d.id === 'bigone') police.setWanted(0);
      this.setupStep();
      return true;
    },
    setupStep() {
      const s = this.stepDef();
      if (!s) return;
      if (s.type === 'goto' || s.type === 'deliver') {
        const spot = world.spots[s.at];
        beacon.position.set(spot.x, 0, spot.z);
        beacon.visible = true;
      } else if (s.type === 'truck') {
        if (!this.truck) {
          const mesh = makeCarMesh(0x8a7a3e, true, false);
          mesh.position.set(world.spots.harbor.x, 0, world.spots.harbor.z);
          scene.add(mesh);
          this.truck = { mesh, pos: mesh.position, heading: 0, speed: 0, stolen: false, isMissionTruck: true, name: 'Cargo Truck' };
          game.missionTruck = this.truck;
        }
        beacon.position.set(world.spots.harbor.x, 0, world.spots.harbor.z);
        beacon.visible = true;
      } else if (s.type === 'grab') {
        beacon.position.set(world.spots.bank.x, 0, world.spots.bank.z);
        beacon.visible = true;
      } else if (s.type === 'shootout') {
        this.rivals = [];
        for (let i = 0; i < 3; i++) {
          const r = spawnRival(world, scene, world.spots.deal.x + (i - 1) * 4, world.spots.deal.z + 6);
          this.rivals.push(r);
          game.peds.push(r);
        }
        beacon.visible = false;
      } else {
        beacon.visible = false;
      }
      const d = this.def();
      if (d) hud.setObjective(d.title, s.text);
    },
    completeStep() {
      const d = this.def();
      this.step += 1;
      audio.pickup();
      if (this.step >= d.steps.length) {
        player.cash += d.reward;
        hud.feed(`${d.title} complete — +$${d.reward}`);
        audio.cash();
        this.active = false;
        beacon.visible = false;
        if (d.id === 'bigone') police.setWanted(3);
        hud.setObjective(d.title, 'Job done. Press M to start the next job.');
      } else {
        this.setupStep();
      }
    },
    waypoint() {
      const s = this.stepDef();
      if (!s) return null;
      if (s.type === 'goto' || s.type === 'deliver' || s.type === 'grab') return world.spots[s.at];
      if (s.type === 'truck') return world.spots.harbor;
      if (s.type === 'escape') return world.spots.safehouse;
      return null;
    },
    update(dt) {
      if (!this.active) return;
      const s = this.stepDef();
      if (!s) return;
      const d = this.def();
      const px = player.pos.x;
      const pz = player.pos.z;
      const near = (x, z, r) => Math.hypot(px - x, pz - z) < r;
      if (s.type === 'steal') {
        if (!player.onFoot) this.completeStep();
      } else if (s.type === 'goto' || s.type === 'deliver') {
        const spot = world.spots[s.at];
        if (near(spot.x, spot.z, s.type === 'deliver' ? 7 : 6)) {
          if (s.type === 'deliver' && player.car !== this.truck) {
            hud.setObjective(d.title, 'Bring the truck — not that car');
          } else {
            this.completeStep();
          }
        }
      } else if (s.type === 'escape') {
        if (near(world.spots.safehouse.x, world.spots.safehouse.z, 8) || police.wanted === 0) {
          this.completeStep();
        }
      } else if (s.type === 'shootout') {
        const alive = this.rivals.filter((r) => r.hp > 0).length;
        hud.setObjective(d.title, `Take down the rival crew (${alive} left)`);
        if (alive === 0) this.completeStep();
      } else if (s.type === 'truck') {
        if (player.car === this.truck) this.completeStep();
      } else if (s.type === 'grab') {
        if (near(world.spots.bank.x, world.spots.bank.z, 8)) {
          this.grabTimer += dt;
          hud.setObjective(d.title, `Cracking the vault… ${Math.ceil(3 - this.grabTimer)}s`);
          if (this.grabTimer >= 3) {
            player.cash += 3000;
            hud.feed('Vault cash secured: $3,000');
            this.completeStep();
          }
        } else {
          this.grabTimer = 0;
        }
      }
      // The beacon's diamond bobs so the eye finds it. The clock is the
      // game's own clock, frozen in screenshot staging for determinism.
      if (beacon.visible) {
        gem.position.y = 9 + Math.sin((this.clock || 0) * 2.8) * 0.8;
        gem.rotation.y += dt * 1.5;
      }
    },
  };
  return m;
}
