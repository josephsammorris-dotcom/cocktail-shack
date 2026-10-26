// TV sound (Handbook Section 14): mellow marimba-ish triangle lead with a soft echo, all from the Web Audio API.
const N = { G3: 196, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.26, G5: 783.99 };
const RIFF = [
  ['C5', 1], ['E5', 1], ['G5', 1], ['E5', 1], ['D5', 2], ['B4', 1], ['G4', 1],
  ['C5', 1], ['E5', 1], ['G5', 1], ['E5', 1], ['D5', 1], ['B4', 1], ['C5', 2],
  ['A4', 1], ['C5', 1], ['E5', 1], ['C5', 1], ['D5', 2], ['B4', 2],
  ['G4', 1], ['B4', 1], ['D5', 1], ['B4', 1], ['C5', 3],
];
const BASS = ['C4', 'G3', 'A3', 'G3', 'C4', 'G3', 'F4', 'G3'];
const BEAT = 0.17;

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.rainNode = null; this.waves = null; this.murmur = null; }

  enable() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    this.master.connect(lp); lp.connect(ctx.destination);
    // echo send
    this.dry = ctx.createGain(); this.dry.connect(this.master);
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.24;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    this.send = ctx.createGain(); this.send.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }
  get on() { return !!this.ctx && this.ctx.state === 'running'; }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.3, this.ctx.currentTime, 0.05); return this.muted; }

  tone(freq, start, dur, { type = 'triangle', gain = 0.5, attack = 0.015, echo = true, slide = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + start;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.dry); if (echo) g.connect(this.send);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(start, dur, { hp = 5000, lp = 0, gain = 0.25 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + start;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.dry);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  riff(notes = RIFF.length) {
    let t = 0, beat = 0;
    for (const [n, len] of RIFF.slice(0, notes)) {
      this.tone(N[n], t, len * BEAT * 1.6, { gain: 0.42 });
      for (let b = 0; b < len; b++) { this.tone(N[BASS[(beat + b) % 8]] / 2, t + b * BEAT, BEAT * 0.95, { type: 'sine', gain: 0.3, echo: false }); }
      if (beat % 2 === 0) this.noise(t, 0.04, { gain: 0.12 });
      t += len * BEAT; beat += len;
    }
  }
  blip() { this.tone(880, 0, 0.12, { type: 'sine', gain: 0.35 }); }
  till() { this.tone(1318, 0, 0.18, { type: 'sine', gain: 0.3 }); this.tone(1760, 0.09, 0.25, { type: 'sine', gain: 0.3 }); }
  wrong() { this.tone(220, 0, 0.3, { gain: 0.4 }); this.tone(174, 0.22, 0.45, { gain: 0.4 }); }
  shaker() { for (let i = 0; i < 8; i++) this.noise(i * 0.09, 0.06, { gain: 0.22 }); this.tone(1046, 0.75, 0.3, { type: 'sine', gain: 0.3 }); }
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * 0.13, 0.3, { gain: 0.4 })); this.tone(1318, 0.55, 0.8, { gain: 0.42 }); }
  whistle() { this.tone(2600, 0, 0.18, { type: 'sine', gain: 0.18, echo: false }); this.tone(2600, 0.24, 0.5, { type: 'sine', gain: 0.18, echo: false }); }
  gulls() { for (let i = 0; i < 4; i++) this.tone(1400 + Math.random() * 500, i * 0.35 + Math.random() * 0.1, 0.28, { type: 'sawtooth', gain: 0.05, slide: 0.6, echo: false }); }
  jingle() { [659, 784, 880, 784, 659, 523].forEach((f, i) => this.tone(f, i * 0.14, 0.18, { type: 'square', gain: 0.08 })); }
  sting() { this.tone(392, 0, 0.18, { gain: 0.35 }); this.tone(370, 0.18, 0.18, { gain: 0.35 }); this.tone(277, 0.36, 0.5, { gain: 0.35 }); }
  tick() { this.tone(1046, 0, 0.1, { type: 'sine', gain: 0.25 }); this.tone(1568, 0.08, 0.2, { type: 'sine', gain: 0.25 }); }
  cheer() { this.noise(0, 1.2, { lp: 1800, gain: 0.18 }); }
  thunder() { this.noise(0, 1.8, { lp: 180, gain: 0.5 }); }

  loop(lpFreq, gain) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpFreq;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    return g;
  }
  startAmbience() {
    // waves: low noise swelling slowly; crowd murmur rises with sales
    this.waves = this.loop(420, 0.05);
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    lfo.frequency.value = 0.12; lg.gain.value = 0.035; lfo.connect(lg); lg.connect(this.waves.gain); lfo.start();
    this.murmur = this.loop(900, 0);
  }
  setMurmur(level) { if (this.murmur) this.murmur.gain.setTargetAtTime(Math.min(0.12, level), this.ctx.currentTime, 0.4); }
  rain(on) {
    if (!this.ctx) return;
    if (on && !this.rainNode) { this.rainNode = this.loop(800, 0); this.rainNode.gain.setTargetAtTime(0.14, this.ctx.currentTime, 0.5); }
    else if (!on && this.rainNode) { const g = this.rainNode; g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); this.rainNode = null; setTimeout(() => g.disconnect(), 2500); }
  }
}
