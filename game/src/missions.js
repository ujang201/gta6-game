// missions.js — Leo Marin's story: five chained jobs for the Marlin Crew.
// Each mission is a small state machine: a briefing, a chain of objectives
// (go here, do that), a waypoint marker in the world, and a cash payout.
// The manager owns the current mission, its stage, and the waypoint the
// HUD and minimap draw. Failing (busted / wasted) restarts the mission.

import { distance2D } from './random.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: '1 — First Wheels',
    giver: 'Rosa, the fixer',
    brief: 'Rosa needs a clean ride for the crew. Lift the red Cometa parked on Coral Row and bring it to the meet point. No cops, no fuss.',
    reward: 400,
    stages: [
      { type: 'steal', text: 'Steal a car — any car will do', target: null },
      { type: 'goto', text: 'Drive to the meet point', x: 120, z: -90, radius: 10 },
    ],
  },
  {
    id: 'getaway',
    title: '2 — Getaway',
    giver: 'Rosa, the fixer',
    brief: 'That Cometa was hot. The cops are onto you — two stars and climbing. Lose them and get to the safehouse on Palm Row.',
    reward: 600,
    stages: [
      { type: 'lose-heat', text: 'Lose the cops — wanted level must drop to 0', target: null },
      { type: 'goto', text: 'Reach the safehouse', x: -40, z: 206, radius: 12 },
    ],
  },
  {
    id: 'the-pickup',
    title: '3 — The Pickup',
    giver: 'Marco, the driver',
    brief: 'Marco is waiting at the docks with a package. A rival crew wants it too — they will come at you. Grab the package and bring it back.',
    reward: 900,
    stages: [
      { type: 'goto', text: 'Pick up the package at the docks', x: -180, z: 120, radius: 10 },
      { type: 'shootout', text: 'Fight off the rival crew (take down 3)', target: null },
      { type: 'goto', text: 'Deliver the package to Marco', x: 60, z: 60, radius: 10 },
    ],
  },
  {
    id: 'harbor-heist',
    title: '4 — Harbor Heist',
    giver: 'The Marlin Crew',
    brief: 'A cargo truck full of imported goods is sitting in the harbour yard. Take it, and drive it to the lockup on the east side. Expect company.',
    reward: 1400,
    stages: [
      { type: 'steal-truck', text: 'Steal the cargo truck at the harbour', x: -190, z: -150, radius: 14 },
      { type: 'goto', text: 'Deliver the truck to the lockup', x: 200, z: 150, radius: 12 },
    ],
  },
  {
    id: 'the-big-one',
    title: '5 — The Big One',
    giver: 'Rosa, the fixer',
    brief: 'The Solmar Bay Bank. One job, one vault, one clean exit. Grab the cash inside, then lose a three-star response and reach the safehouse. This is the one Leo.',
    reward: 3000,
    stages: [
      { type: 'goto', text: 'Reach the Solmar Bay Bank', x: 0, z: 0, radius: 12 },
      { type: 'grab-cash', text: 'Grab the vault cash', x: 0, z: 0, radius: 12 },
      { type: 'lose-heat', text: 'Lose the three-star heat', target: null },
      { type: 'goto', text: 'Reach the safehouse', x: -40, z: 206, radius: 12 },
    ],
  },
];

export class MissionManager {
  constructor(onEvent) {
    this.onEvent = onEvent; // (type, payload) -> HUD banner, sound, cash
    this.index = 0;
    this.stage = 0;
    this.active = false;
    this.completed = 0;
    this.earned = 0;
    this.killsNeeded = 0;
    this.killsDone = 0;
    this.grabTimer = 0;
    this.startedAt = 0;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  get currentStage() {
    const m = this.current;
    return m ? m.stages[this.stage] : null;
  }

  get done() {
    return this.index >= MISSIONS.length;
  }

  start() {
    if (this.done) return;
    this.active = true;
    this.stage = 0;
    this.killsDone = 0;
    const m = this.current;
    this.onEvent('brief', { mission: m });
  }

  // Advance to the next stage, or finish the mission.
  advance() {
    const m = this.current;
    this.stage += 1;
    if (this.stage >= m.stages.length) {
      this.complete();
      return;
    }
    this.onEvent('stage', { mission: m, stage: this.currentStage });
  }

  complete() {
    const m = this.current;
    this.earned += m.reward;
    this.completed += 1;
    this.active = false;
    this.onEvent('complete', { mission: m, reward: m.reward });
    this.index += 1;
    this.stage = 0;
  }

  fail(reason) {
    this.active = false;
    this.onEvent('fail', { mission: this.current, reason });
  }

  restart() {
    this.start();
  }

  // Waypoint for the HUD/minimap, or null when the stage has no location.
  waypoint() {
    if (!this.active) return null;
    const s = this.currentStage;
    if (!s) return null;
    if (s.type === 'goto' || s.type === 'steal-truck' || s.type === 'grab-cash') {
      return { x: s.x, z: s.z, radius: s.radius, label: s.text };
    }
    return null;
  }

  objectiveText() {
    if (this.done) return 'All jobs done — Solmar Bay is yours, Leo.';
    if (!this.active) return 'Press M to start the next job.';
    return this.currentStage ? this.currentStage.text : '';
  }

  // Called every frame with the live game state; returns nothing, fires events.
  update(dt, state) {
    if (!this.active || this.done) return;
    const s = this.currentStage;
    const m = this.current;
    if (s.type === 'goto') {
      if (distance2D(state.px, state.pz, s.x, s.z) < s.radius) {
        this.onEvent('arrive', { stage: s });
        this.advance();
      }
    } else if (s.type === 'steal') {
      if (state.inCar) {
        this.onEvent('arrive', { stage: s });
        this.advance();
      }
    } else if (s.type === 'steal-truck') {
      if (state.inCar && state.carKind === 'truck' && distance2D(state.px, state.pz, s.x, s.z) < 40) {
        this.onEvent('arrive', { stage: s });
        this.advance();
      }
    } else if (s.type === 'lose-heat') {
      if (state.wanted === 0) {
        this.onEvent('arrive', { stage: s });
        this.advance();
      }
    } else if (s.type === 'shootout') {
      if (this.killsNeeded === 0) {
        this.killsNeeded = 3;
        this.killsDone = 0;
        this.onEvent('spawn-rivals', { count: 3 });
      }
      if (this.killsDone >= this.killsNeeded) {
        this.killsNeeded = 0;
        this.advance();
      }
    } else if (s.type === 'grab-cash') {
      if (distance2D(state.px, state.pz, s.x, s.z) < s.radius) {
        this.grabTimer += dt;
        if (this.grabTimer > 2.5) {
          this.grabTimer = 0;
          this.onEvent('arrive', { stage: s });
          this.onEvent('alarm', {});
          this.advance();
        }
      } else {
        this.grabTimer = 0;
      }
    }
  }

  noteKill() {
    if (this.active && this.currentStage && this.currentStage.type === 'shootout') {
      this.killsDone += 1;
    }
  }

  // Serialisable progress for localStorage saves.
  save() {
    return { index: this.index, earned: this.earned, completed: this.completed };
  }

  load(data) {
    if (!data) return;
    this.index = data.index || 0;
    this.earned = data.earned || 0;
    this.completed = data.completed || 0;
    this.active = false;
    this.stage = 0;
  }
}
