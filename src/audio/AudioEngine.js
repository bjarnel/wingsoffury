import screamUrl from '../assets/wilhelm_scream.ogg?url';
import { clamp, rand } from '../core/utils.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.muted = false;
    this.started = false;
    this.lastMG = 0;
    this.lastEnemy = 0;
    this.lastWarn = 0;
    this.lastWhine = 0;
    this.lastScream = -1;
    this.noiseBuffer = null;
    this.screamBuffer = null;
    this.screamPromise = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.loadScream();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const master = this.master = ctx.createGain();
    master.gain.value = 0.38;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    master.connect(comp);
    comp.connect(ctx.destination);

    // Generated reverb impulse: sparse decaying stereo noise.
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.3) * (Math.random() < 0.026 ? 1 : 0.34);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.23;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(master);

    // Reusable noise bed.
    const nlen = Math.floor(ctx.sampleRate * 2);
    const nb = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuffer = nb;

    this.buildEngine();
    this.started = true;
    this.loadScream();
  }

  loadScream() {
    if (this.screamBuffer || this.screamPromise || !this.ctx) return;
    this.screamPromise = fetch(screamUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Wilhelm scream asset returned ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => new Promise((resolve, reject) => {
        this.ctx.decodeAudioData(buffer, resolve, reject);
      }))
      .then((decoded) => {
        this.screamBuffer = decoded;
      })
      .catch((err) => {
        // A missing or unsupported sample must never stop the rest of the audio engine.
        console.warn('Wilhelm scream sample unavailable:', err);
      });
  }

  buildEngine() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 1.1;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.78;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.17;
    lfo.connect(lfoGain);
    lfoGain.connect(pulse.gain);
    lfo.start();

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 74;
    osc2.detune.value = 11;
    const g1 = ctx.createGain(); g1.gain.value = 0.17;
    const g2 = ctx.createGain(); g2.gain.value = 0.075;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 190; nf.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.value = 0.12;
    osc1.connect(g1); osc2.connect(g2); g1.connect(filter); g2.connect(filter);
    noise.connect(nf); nf.connect(ng); ng.connect(filter);
    filter.connect(pulse); pulse.connect(out); out.connect(this.master);
    osc1.start(); osc2.start(); noise.start();

    this.engineNodes = { out, filter, osc1, osc2, lfo, ng };
  }

  updateEngine(speed, throttle, active, damaged) {
    if (!this.engineNodes || !this.ctx) return;
    const n = this.engineNodes;
    const t = this.ctx.currentTime;
    const targetGain = active ? (this.muted ? 0 : 0.085 + throttle * 0.075) : 0;
    n.out.gain.setTargetAtTime(targetGain, t, 0.15);
    const freq = 37 + throttle * 43 + speed * 0.28;
    n.osc1.frequency.setTargetAtTime(freq, t, 0.09);
    n.osc2.frequency.setTargetAtTime(freq * 1.53, t, 0.11);
    n.filter.frequency.setTargetAtTime(330 + throttle * 620 + speed * 2.2, t, 0.1);
    n.lfo.frequency.setTargetAtTime(7 + throttle * 15, t, 0.2);
    n.ng.gain.setTargetAtTime(damaged ? 0.22 : 0.09, t, 0.3);
  }

  noiseBurst(duration, gainVal, filterType, freq, dest = this.master, pan = 0) {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rand(0.86, 1.15);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let node = src.connect(filter).connect(gain);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      gain.connect(p);
      node = p;
    }
    node.connect(dest);
    src.start(t);
    src.stop(t + duration + 0.03);
  }

  mg() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastMG < 0.055) return;
    this.lastMG = now;
    const dur = 0.075;
    this.noiseBurst(dur, 0.18, 'highpass', 1750, this.master, rand(-0.12, 0.12));
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(rand(110, 150), now);
    osc.frequency.exponentialRampToValueAtTime(52, now + dur);
    g.gain.setValueAtTime(0.045, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(this.master);
    osc.start(now); osc.stop(now + dur + 0.01);
  }

  enemyShot(volume = 0.06, pan = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastEnemy < 0.04) return;
    this.lastEnemy = now;
    this.noiseBurst(0.055, volume, 'bandpass', 1100, this.master, pan);
  }

  explosion(size = 1, pan = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = 0.75 + size * 0.55;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rand(0.35, 0.58);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100 * Math.min(size, 1.4), t);
    lp.frequency.exponentialRampToValueAtTime(50, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * Math.min(size, 1.5), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    shaper.curve = curve;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.master); p.connect(this.reverb); }
    else { g.connect(this.master); g.connect(this.reverb); }
    src.connect(lp).connect(shaper).connect(g);
    src.start(t); src.stop(t + dur + 0.1);

    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(78, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 0.65);
    sg.gain.setValueAtTime(0.35 * size, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    sub.connect(sg).connect(this.master);
    sub.start(t); sub.stop(t + 0.85);
  }

  whine(pan = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastWhine < 0.8) return;
    this.lastWhine = now;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(rand(1550, 2100), now);
    osc.frequency.exponentialRampToValueAtTime(410, now + 0.52);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.048, now + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(g);
    if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    osc.start(now); osc.stop(now + 0.58);
  }

  thud() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(72, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.22);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.33);
    this.noiseBurst(0.18, 0.14, 'lowpass', 420);
  }

  chime(success = true) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.02;
    const notes = success ? [392, 523.25, 659.25, 783.99] : [523.25, 392, 311.13];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const t0 = now + i * 0.11;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.075, t0 + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(g).connect(this.master);
      osc.start(t0); osc.stop(t0 + 0.35);
    });
  }

  warning() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastWarn < 1.1) return;
    this.lastWarn = now;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.setValueAtTime(580, now + 0.1);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.025, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g).connect(this.master);
    osc.start(now); osc.stop(now + 0.24);
  }

  scream(pan = 0, volume = 1) {
    if (!this.ctx || this.muted || !this.screamBuffer) return;
    const now = this.ctx.currentTime;
    // One unfortunate soldier at a time is plenty when a stick of bombs lands.
    if (now - this.lastScream < 0.55) return;
    this.lastScream = now;

    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.screamBuffer;
    src.playbackRate.value = 0.96 + Math.random() * 0.08;

    const gain = ctx.createGain();
    const end = now + this.screamBuffer.duration / src.playbackRate.value;
    const level = 0.58 * clamp(volume, 0, 1.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.018);
    gain.gain.setValueAtTime(level, Math.max(now + 0.02, end - 0.09));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    src.connect(gain);
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      gain.connect(panner);
      panner.connect(this.master);
      panner.connect(this.reverb);
    } else {
      gain.connect(this.master);
      gain.connect(this.reverb);
    }

    src.start(now);
    src.stop(end + 0.05);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0.0001 : 0.38, this.ctx.currentTime, 0.05);
  }
}

export { AudioEngine };
