// hud.js — the Solmar Bay HUD: a 2D canvas minimap, wanted stars, cash,
// health bar, speedometer, objective banner, message feed, and the menus
// (start, pause, busted, wasted, mission briefing). All DOM + canvas,
// drawn every frame from the live game state.

import { CITY_HALF, BLOCK, GRID, SEA_X } from './world.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.mapCanvas = document.getElementById('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.starsEl = document.getElementById('stars');
    this.cashEl = document.getElementById('cash');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.speedEl = document.getElementById('speed');
    this.objectiveEl = document.getElementById('objective');
    this.bannerEl = document.getElementById('banner');
    this.feedEl = document.getElementById('feed');
    this.ammoEl = document.getElementById('ammo');
    this.carEl = document.getElementById('car-name');
    this.bannerTimer = 0;
    this.messages = [];
  }

  showBanner(text, sub, dur) {
    this.bannerEl.innerHTML = `<div class="banner-title">${text}</div>` +
      (sub ? `<div class="banner-sub">${sub}</div>` : '');
    this.bannerEl.classList.add('show');
    this.bannerTimer = dur || 3.2;
  }

  hideBanner() {
    this.bannerEl.classList.remove('show');
  }

  feed(text) {
    this.messages.unshift(text);
    if (this.messages.length > 4) this.messages.pop();
    this.feedEl.innerHTML = this.messages.map((m) => `<div>${m}</div>`).join('');
  }

  update(dt, state) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.hideBanner();
    }
    // Wanted stars.
    const stars = state.wantedStars || 0;
    let starHtml = '';
    for (let i = 0; i < 5; i++) {
      starHtml += `<span class="star ${i < stars ? 'lit' : ''}">★</span>`;
    }
    this.starsEl.innerHTML = starHtml;
    this.cashEl.textContent = '$' + Math.floor(state.cash).toLocaleString('en-US');
    this.healthFill.style.width = Math.max(0, state.health) + '%';
    this.healthText.textContent = Math.ceil(state.health) + ' HP';
    this.speedEl.textContent = state.inCar ? Math.round(Math.abs(state.speed) * 2.2) + ' km/h' : '';
    this.objectiveEl.textContent = state.objective || '';
    this.ammoEl.textContent = state.hasPistol ? '🔫 ' + state.ammo : '';
    this.carEl.textContent = state.carName || '';
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 168;
    const scale = S / (CITY_HALF * 2 + 90);
    const toMap = (x, z) => [
      (x + CITY_HALF + 45) * scale,
      (z + CITY_HALF + 45) * scale,
    ];
    ctx.clearRect(0, 0, S, S);
    // Sea on the west.
    const [seaX] = toMap(SEA_X - 30, 0);
    ctx.fillStyle = '#1f6f8b';
    ctx.fillRect(0, 0, Math.max(0, toMap(SEA_X, 0)[0]), S);
    // City base.
    ctx.fillStyle = 'rgba(20, 20, 28, 0.85)';
    ctx.fillRect(0, 0, S, S);
    // Roads.
    ctx.strokeStyle = '#6b6b78';
    ctx.lineWidth = 4;
    for (let i = 0; i <= GRID; i++) {
      const c = -CITY_HALF + i * BLOCK;
      const [x1, y1] = toMap(c, -CITY_HALF);
      const [x2, y2] = toMap(c, CITY_HALF);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const [hx1, hy1] = toMap(-CITY_HALF, c);
      const [hx2, hy2] = toMap(CITY_HALF, c);
      ctx.beginPath();
      ctx.moveTo(hx1, hy1);
      ctx.lineTo(hx2, hy2);
      ctx.stroke();
    }
    // Pay-N-Spray bays.
    ctx.fillStyle = '#3d7bd9';
    for (const bay of state.payNSpray || []) {
      const [bx, by] = toMap(bay.x, bay.z);
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Safehouse.
    if (state.safehouse) {
      const [sx, sy] = toMap(state.safehouse.x, state.safehouse.z);
      ctx.fillStyle = '#4f9e57';
      ctx.fillRect(sx - 4, sy - 4, 8, 8);
    }
    // Mission waypoint.
    if (state.waypoint) {
      const [wx, wy] = toMap(state.waypoint.x, state.waypoint.z);
      const pulse = 6 + Math.sin((state.mapTime ?? performance.now()) / 280) * 2;
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.arc(wx, wy, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx, wy, pulse + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Police dots.
    ctx.fillStyle = '#ff4444';
    for (const p of state.policePositions || []) {
      const [px, py] = toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(state.px, state.pz);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('N', 4, 12);
  }
}

// ---- Menus ---------------------------------------------------------------

export function showMenu(el, visible) {
  el.classList.toggle('hidden', !visible);
}

export function fillStartMenu(saveExists, missionTitle) {
  const el = document.getElementById('start-menu');
  const cont = document.getElementById('continue-btn');
  cont.style.display = saveExists ? 'block' : 'none';
  const next = document.getElementById('next-job');
  next.textContent = saveExists
    ? 'Saved game found — continue your story, Leo.'
    : (missionTitle || '');
}

export function showBriefing(mission) {
  const box = document.getElementById('briefing');
  box.innerHTML =
    `<h2>${mission.title}</h2><p class="giver">${mission.giver}</p>` +
    `<p>${mission.brief}</p><p class="reward">Reward: $${mission.reward}</p>` +
    `<p class="hint">Press any key to start the job</p>`;
  box.classList.remove('hidden');
}

export function hideBriefing() {
  document.getElementById('briefing').classList.add('hidden');
}

export function showEndScreen(kind, text) {
  const box = document.getElementById('end-screen');
  box.innerHTML =
    `<h1 class="${kind}">${kind === 'busted' ? 'BUSTED' : 'WASTED'}</h1>` +
    `<p>${text}</p><p class="hint">Press R to retry the job — Enter to return to the menu</p>`;
  box.classList.remove('hidden');
}

export function hideEndScreen() {
  document.getElementById('end-screen').classList.add('hidden');
}
