// HUD for SOLMAR BAY: DOM overlay (stars, cash, health, speed, objective,
// toasts), a canvas minimap, and the menu / pause / end screens.
// NOTE: method names and property names are kept distinct on purpose
// (a past build broke when a property and a method shared a name).
import { clamp } from './random.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.root.innerHTML = `
      <div id="hud-top">
        <div id="hud-stars"></div>
        <div id="hud-cash">$300</div>
        <div id="hud-health"><div id="hud-health-fill"></div></div>
      </div>
      <div id="hud-speed">0 km/h</div>
      <div id="hud-objective"></div>
      <div id="hud-toasts"></div>
      <div id="hud-hint"></div>
      <canvas id="hud-map" width="180" height="180"></canvas>
      <div id="hud-menu" class="overlay">
        <h1>SOLMAR BAY</h1>
        <p class="tagline">Sun, sand, and five jobs that will make you rich — or get you caught.</p>
        <p class="story">Leo Marin, driver-for-hire, is pulled into a heist crew. Steal cars, outrun the law, pull the Big One.</p>
        <button id="btn-new">New Game</button>
        <button id="btn-continue">Continue</button>
        <div class="controls">WASD move / drive &nbsp;·&nbsp; Shift run &nbsp;·&nbsp; E enter / exit car &nbsp;·&nbsp; Space shoot / handbrake &nbsp;·&nbsp; F punch &nbsp;·&nbsp; Mouse drag orbit &nbsp;·&nbsp; P pause</div>
      </div>
      <div id="hud-pause" class="overlay hidden">
        <h1>Paused</h1>
        <button id="btn-resume">Resume</button>
        <button id="btn-quit">Quit to Menu</button>
      </div>
      <div id="hud-end" class="overlay hidden">
        <h1 id="hud-end-title">Busted</h1>
        <p id="hud-end-text"></p>
        <button id="btn-retry">Retry</button>
        <button id="btn-menu">Main Menu</button>
      </div>`;
    this.starsEl = document.getElementById('hud-stars');
    this.cashEl = document.getElementById('hud-cash');
    this.healthFill = document.getElementById('hud-health-fill');
    this.speedEl = document.getElementById('hud-speed');
    this.objectiveEl = document.getElementById('hud-objective');
    this.toastsEl = document.getElementById('hud-toasts');
    this.hintEl = document.getElementById('hud-hint');
    this.mapCanvas = document.getElementById('hud-map');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.menuEl = document.getElementById('hud-menu');
    this.pauseEl = document.getElementById('hud-pause');
    this.endEl = document.getElementById('hud-end');
    this.endTitle = document.getElementById('hud-end-title');
    this.endText = document.getElementById('hud-end-text');
    this.toastList = [];
    this.onNewGame = null;
    this.onContinue = null;
    this.onResume = null;
    this.onQuit = null;
    this.onRetry = null;
    this.onMenu = null;
    document.getElementById('btn-new').addEventListener('click', () => this.onNewGame && this.onNewGame());
    document.getElementById('btn-continue').addEventListener('click', () => this.onContinue && this.onContinue());
    document.getElementById('btn-resume').addEventListener('click', () => this.onResume && this.onResume());
    document.getElementById('btn-quit').addEventListener('click', () => this.onQuit && this.onQuit());
    document.getElementById('btn-retry').addEventListener('click', () => this.onRetry && this.onRetry());
    document.getElementById('btn-menu').addEventListener('click', () => this.onMenu && this.onMenu());
  }

  setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.starsEl.textContent = s;
    this.starsEl.classList.toggle('hot', n > 0);
  }
  setCash(n) {
    this.cashEl.textContent = '$' + Math.floor(n).toLocaleString('en-US');
  }
  setHealth(n) {
    this.healthFill.style.width = clamp(n, 0, 100) + '%';
    this.healthFill.style.background = n > 50 ? '#3ecf5a' : n > 25 ? '#e8b93e' : '#e83e3e';
  }
  setSpeed(kmh) {
    this.speedEl.textContent = Math.round(kmh) + ' km/h';
  }
  setObjective(text) {
    this.objectiveEl.textContent = text;
  }
  // queue a toast line (top center, fades after a few seconds)
  showToast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastsEl.appendChild(el);
    this.toastList.push({ el, t: 0 });
    while (this.toastsEl.children.length > 3) {
      this.toastsEl.removeChild(this.toastsEl.firstChild);
      this.toastList.shift();
    }
  }
  updateToasts(dt) {
    for (let i = this.toastList.length - 1; i >= 0; i--) {
      const item = this.toastList[i];
      item.t += dt;
      if (item.t > 5) {
        item.el.remove();
        this.toastList.splice(i, 1);
      }
    }
  }
  setHint(text) {
    this.hintEl.textContent = text;
  }

  showMenu(canContinue) {
    this.menuEl.classList.remove('hidden');
    document.getElementById('btn-continue').style.display = canContinue ? '' : 'none';
    this.pauseEl.classList.add('hidden');
    this.endEl.classList.add('hidden');
  }
  hideMenu() {
    this.menuEl.classList.add('hidden');
  }
  showPause() {
    this.pauseEl.classList.remove('hidden');
  }
  hidePause() {
    this.pauseEl.classList.add('hidden');
  }
  showEnd(kind, text) {
    this.endTitle.textContent = kind === 'busted' ? 'Busted!' : kind === 'wasted' ? 'Wasted' : 'The Big One!';
    this.endText.textContent = text;
    this.endEl.classList.remove('hidden');
  }
  hideEnd() {
    this.endEl.classList.add('hidden');
  }

  // top-down minimap: roads, beach, player arrow, mission marker, police + traffic dots
  drawMap(px, pz, heading, missionTarget, policeDots, trafficDots) {
    const ctx = this.mapCtx;
    const S = 180;
    const toMap = (x, z) => [((x + 280) / 580) * S, ((z + 280) / 580) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#20242e';
    ctx.fillRect(0, 0, S, S);
    // ocean (east strip)
    const [ox] = toMap(298, 0);
    ctx.fillStyle = '#1a5a8a';
    ctx.fillRect(ox, 0, S - ox, S);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(toMap(266, 0)[0], 0, ox - toMap(266, 0)[0], S);
    // roads
    ctx.strokeStyle = '#5a5a66';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 10; i++) {
      const r = -260 + i * 52;
      const [x1] = toMap(r, -260);
      const [, y1] = toMap(-260, r);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.lineTo(S, y1);
      ctx.stroke();
    }
    // traffic dots
    ctx.fillStyle = '#9aa0aa';
    for (const d of trafficDots) {
      const [mx, my] = toMap(d.x, d.z);
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    // police dots
    ctx.fillStyle = '#3a7bff';
    for (const d of policeDots) {
      const [mx, my] = toMap(d.x, d.z);
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // mission marker (yellow diamond, pulsing)
    if (missionTarget) {
      const [mx, my] = toMap(missionTarget.x, missionTarget.z);
      const pulse = 5 + Math.sin(performance.now() * 0.005) * 1.5;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse);
      ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse);
      ctx.lineTo(mx - pulse, my);
      ctx.closePath();
      ctx.fill();
    }
    // player arrow
    const [pxm, pzm] = toMap(px, pz);
    ctx.save();
    ctx.translate(pxm, pzm);
    ctx.rotate(-heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4.5);
    ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
