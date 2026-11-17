// audio.js — all sound in Solmar Bay is synthesised with WebAudio.
// No audio files are shipped: engines are detuned sawtooth oscillators,
// sirens are sweeping sine waves, gunshots are filtered noise bursts,
// and UI clicks are short square blips. The mixer starts lazily on the
// first user gesture so browsers never block it.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineLoop();
    this.startSirenLoop();
    return true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  startEngineLoop() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    sub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    sub.start();
    this.engineSub = sub;
  }

  // speed01: 0 idle .. 1 flat out. Called every frame while driving.
  setEngine(speed01, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speed01 * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const freq = 52 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    if (this.engineSub) this.engineSub.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
  }

  startSirenLoop() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 720;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // wanted01: 0 silent .. 1 full wail, scaled by nearest police distance.
  setSiren(level) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.045, this.ctx.currentTime, 0.15);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  click() {
    this.blip(880, 0.06, 'square', 0.08);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.14);
    setTimeout(() => this.blip(990, 0.12, 'sine', 0.14), 70);
  }

  cash() {
    this.blip(523, 0.08, 'triangle', 0.16);
    setTimeout(() => this.blip(659, 0.08, 'triangle', 0.16), 80);
    setTimeout(() => this.blip(784, 0.16, 'triangle', 0.18), 160);
  }

  punch() {
    this.noiseBurst(0.09, 500, 0.25);
  }

  gunshot() {
    this.noiseBurst(0.14, 1800, 0.4);
    this.blip(160, 0.1, 'square', 0.2);
  }

  crash() {
    this.noiseBurst(0.25, 300, 0.5);
    this.blip(70, 0.25, 'sawtooth', 0.25);
  }

  busted() {
    this.blip(220, 0.4, 'sawtooth', 0.2);
    setTimeout(() => this.blip(174, 0.6, 'sawtooth', 0.2), 350);
  }

  noiseBurst(dur, cutoff, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }
}
