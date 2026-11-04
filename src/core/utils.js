import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------
//  Small math / random helpers
// ---------------------------------------------------------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const fmt = (n) => String(Math.floor(n)).padStart(6, '0');
const isTouch = matchMedia('(pointer: coarse)').matches;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded classic Perlin noise with a couple of fBm helpers.
class Perlin {
  constructor(seed = 1) {
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static lerp(a, b, t) { return a + t * (b - a); }
  static grad(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }
  noise2(x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = Perlin.fade(xf), v = Perlin.fade(yf);
    const p = this.perm;
    const aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1];
    const ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1];
    const x1 = Perlin.lerp(Perlin.grad(aa, xf, yf), Perlin.grad(ba, xf - 1, yf), u);
    const x2 = Perlin.lerp(Perlin.grad(ab, xf, yf - 1), Perlin.grad(bb, xf - 1, yf - 1), u);
    return Perlin.lerp(x1, x2, v);
  }
  fbm(x, y, octaves = 4, lacunarity = 2.02, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x, y) * amp;
      norm += amp;
      x = x * lacunarity + 17.17;
      y = y * lacunarity + 9.31;
      amp *= gain;
    }
    return sum / norm;
  }
}

// Scratch objects reused across the game loop to keep the GC quiet.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _c1 = new THREE.Color();
const _e1 = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export {
  TAU, clamp, lerp, smoothstep, damp, rand, pick, fmt, isTouch, $, $$,
  mulberry32, Perlin,
  _v1, _v2, _v3, _q1, _m1, _c1, _e1, UP,
};
