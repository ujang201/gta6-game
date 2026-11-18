// The HUD: wanted stars, cash, health, speed and the live minimap —
// a top-down canvas of the road grid with the player, the job marker,
// police dots and the safehouse / Pay-N-Spray drawn on it.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    stars: $('stars'),
    cash: $('cash'),
    ammo: $('ammo'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    speed: $('speed'),
    carName: $('car-name'),
    objectiveTitle: $('objective-title'),
    objectiveText: $('objective-text'),
    feed: $('feed'),
    minimap: $('minimap'),
    hint: $('hint'),
    menu: $('menu'),
    pause: $('pause'),
    busted: $('busted'),
    wasted: $('wasted'),
    complete: $('complete'),
    hurt: $('hurt'),
    grab: $('grab'),
    hudBox: $('hud'),
  };
  const mapCtx = els.minimap ? els.minimap.getContext('2d') : null;
  const feedLines = [];
  let feedTimer = null;

  function starsHtml(n) {
    let out = '';
    for (let i = 0; i < 5; i++) out += i < n ? '★' : '☆';
    return out;
  }

  const hud = {
    setStars(n) {
      if (els.stars) {
        els.stars.textContent = starsHtml(n);
        els.stars.classList.toggle('hot', n >= 3);
      }
    },
    setCash(n) {
      if (els.cash) els.cash.textContent = `$${n.toLocaleString('en-US')}`;
    },
    setAmmo(n) {
      if (els.ammo) els.ammo.textContent = `🔫 ${n}`;
    },
    setHealth(n) {
      if (els.healthFill) els.healthFill.style.width = `${Math.max(0, n)}%`;
      if (els.healthText) els.healthText.textContent = `${Math.round(n)} HP`;
    },
    setSpeed(kmh, carName) {
      if (els.speed) els.speed.textContent = `${Math.round(kmh)} km/h`;
      if (els.carName) els.carName.textContent = carName || '';
    },
    setObjective(title, text) {
      if (els.objectiveTitle) els.objectiveTitle.textContent = title;
      if (els.objectiveText) els.objectiveText.textContent = text;
    },
    feed(msg) {
      feedLines.unshift(msg);
      if (feedLines.length > 3) feedLines.pop();
      if (els.feed) els.feed.innerHTML = feedLines.map((m) => `<div>${m}</div>`).join('');
      if (feedTimer) clearTimeout(feedTimer);
      feedTimer = setTimeout(() => {
        feedLines.length = 0;
        if (els.feed) els.feed.innerHTML = '';
      }, 9000);
    },
    hurtFlash() {
      if (!els.hurt) return;
      els.hurt.style.opacity = '0.55';
      setTimeout(() => {
        els.hurt.style.opacity = '0';
      }, 180);
    },
    showOnly(name) {
      for (const key of ['menu', 'pause', 'busted', 'wasted', 'complete']) {
        if (els[key]) els[key].classList.toggle('hidden', key !== name);
      }
      if (els.hint) els.hint.classList.toggle('hidden', !!name);
      // The HUD itself only shows while actually playing.
      if (els.hudBox) els.hudBox.classList.toggle('hidden', !!name);
    },
    drawMinimap(world, player, waypoint, police, time) {
      if (!mapCtx) return;
      const cv = els.minimap;
      const W = cv.width;
      const H = cv.height;
      const half = 185;
      const sx = (x) => ((x + half) / (half * 2)) * W;
      const sz = (z) => ((z + half) / (half * 2)) * H;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = '#101018';
      mapCtx.fillRect(0, 0, W, H);
      // Roads.
      mapCtx.strokeStyle = '#4a4a58';
      mapCtx.lineWidth = 3;
      for (const c of world.centres) {
        mapCtx.beginPath();
        mapCtx.moveTo(sx(c), 0);
        mapCtx.lineTo(sx(c), H);
        mapCtx.stroke();
        mapCtx.beginPath();
        mapCtx.moveTo(0, sz(c));
        mapCtx.lineTo(W, sz(c));
        mapCtx.stroke();
      }
      // Ocean strip on the west edge.
      mapCtx.fillStyle = '#1d5f7a';
      mapCtx.fillRect(0, 0, Math.max(2, sx(-175) - sx(-235)), H);
      // Safehouse (green) and Pay-N-Spray (blue).
      mapCtx.fillStyle = '#3fae5a';
      mapCtx.fillRect(sx(world.spots.safehouse.x) - 3, sz(world.spots.safehouse.z) - 3, 6, 6);
      mapCtx.fillStyle = '#3a8fd9';
      mapCtx.fillRect(sx(world.spots.paynspray.x) - 3, sz(world.spots.paynspray.z) - 3, 6, 6);
      // Waypoint marker, pulsing.
      if (waypoint) {
        const pulse = 4 + Math.sin(time * 5) * 1.5;
        mapCtx.fillStyle = '#ffd94a';
        mapCtx.beginPath();
        mapCtx.arc(sx(waypoint.x), sz(waypoint.z), pulse, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Police dots.
      mapCtx.fillStyle = '#5aa2ff';
      for (const c of police.cars) {
        mapCtx.beginPath();
        mapCtx.arc(sx(c.pos.x), sz(c.pos.z), 2.5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Player arrow, rotated to the heading.
      const px = sx(player.pos.x);
      const py = sz(player.pos.z);
      mapCtx.save();
      mapCtx.translate(px, py);
      mapCtx.rotate(Math.atan2(Math.sin(player.heading), Math.cos(player.heading)) * -1 + Math.PI);
      mapCtx.fillStyle = '#ffffff';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4.5, 5);
      mapCtx.lineTo(-4.5, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
  };
  return hud;
}
