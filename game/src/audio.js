// Procedural WebAudio for SOLMAR BAY — no audio files at all.
// Engine hum (oscillator tied to speed), siren, gunshot noise bursts,
// pickup blips and UI clicks are all synthesized on the fly.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.enabled = true;
    this.unlocked = false;
  }

  // must be called from a user gesture at least once (menu click / key)
  unlock() {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // low engine drone, pitch follows speed
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      this.engineOsc.connect(filt);
      filt.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.unlocked = true;
    } catch {
      // audio is optional; the game plays fine silent
      this.ctx = null;
    }
  }

  setEngine(speed01, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + 0.09 * speed01 : 0.0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + 130 * speed01, t, 0.1);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || !this.enabled) return;
    try {
      const o = this.ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol ?? 0.2, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.master);
      o.start();
      o.stop(this.ctx.currentTime + dur + 0.02);
    } catch { /* ignore */ }
  }

  // short filtered noise burst (gunshot, crash, explosion)
  noise(dur, vol, cutoff) {
    if (!this.ctx || !this.enabled) return;
    try {
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = cutoff || 1800;
      const g = this.ctx.createGain();
      g.gain.value = vol ?? 0.3;
      src.connect(filt);
      filt.connect(g);
      g.connect(this.master);
      src.start();
    } catch { /* ignore */ }
  }

  shoot() {
    this.noise(0.14, 0.5, 2600);
  }
  crash() {
    this.noise(0.3, 0.4, 900);
  }
  pickup() {
    this.blip(660, 0.09, 'sine', 0.25);
    setTimeout(() => this.blip(990, 0.12, 'sine', 0.25), 70);
  }
  click() {
    this.blip(880, 0.05, 'square', 0.12);
  }
  // two-tone police siren wail (one cycle)
  siren() {
    if (!this.ctx || !this.enabled) return;
    try {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(700, this.ctx.currentTime);
      o.frequency.linearRampToValueAtTime(1050, this.ctx.currentTime + 0.4);
      o.frequency.linearRampToValueAtTime(700, this.ctx.currentTime + 0.8);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.07, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.85);
      o.connect(g);
      g.connect(this.master);
      o.start();
      o.stop(this.ctx.currentTime + 0.9);
    } catch { /* ignore */ }
  }
}
