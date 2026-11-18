// All sound in Solmar Bay is synthesised live with WebAudio — no audio files
// are shipped. Everything stays silent until the player first interacts,
// because browsers block audio before a gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenTimer = null;
  let sirenOn = false;
  let muted = false;
  try {
    muted = localStorage.getItem('solmarbay-muted') === '1';
  } catch (e) {
    muted = false;
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function burst(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  return {
    get muted() {
      return muted;
    },
    ensure,
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem('solmarbay-muted', muted ? '1' : '0');
      } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) this.engine(0);
      return muted;
    },
    click() {
      blip(660, 0.07, 'square', 0.12);
    },
    pickup() {
      blip(520, 0.09, 'sine', 0.22, 780);
      setTimeout(() => blip(780, 0.12, 'sine', 0.22, 1040), 80);
    },
    cash() {
      blip(880, 0.08, 'triangle', 0.2);
      setTimeout(() => blip(1174, 0.08, 'triangle', 0.2), 70);
      setTimeout(() => blip(1568, 0.16, 'triangle', 0.22), 140);
    },
    punch() {
      burst(0.12, 0.4, 500);
      blip(90, 0.12, 'sine', 0.35, 55);
    },
    shot() {
      burst(0.16, 0.5, 2600);
      blip(160, 0.1, 'square', 0.25, 60);
    },
    // Engine hum: speed 0..1. Call every frame; 0 turns it off.
    engine(speed) {
      if (muted || speed <= 0.01) {
        if (engineOsc) {
          try {
            engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          } catch (e) {}
        }
        return;
      }
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + speed * 130, t, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed * 0.06, t, 0.08);
    },
    siren(on) {
      if (on === sirenOn) return;
      sirenOn = on;
      if (!on) {
        if (sirenTimer) {
          clearInterval(sirenTimer);
          sirenTimer = null;
        }
        return;
      }
      if (!ensure()) return;
      let high = false;
      sirenTimer = setInterval(() => {
        if (muted) return;
        blip(high ? 950 : 700, 0.34, 'sine', 0.07);
        high = !high;
      }, 340);
    },
    sting() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.2), i * 110));
    },
    fail() {
      blip(220, 0.25, 'sawtooth', 0.18, 110);
      setTimeout(() => blip(165, 0.35, 'sawtooth', 0.18, 82), 200);
    },
  };
}
