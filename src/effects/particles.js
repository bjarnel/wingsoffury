import * as THREE from 'three';
import { TAU, rand, pick, _c1 } from '../core/utils.js';
import { scene, renderer } from '../render/scene.js';
import { puffTexture } from '../render/textures.js';

// ---------------------------------------------------------------------------------------------
//  GPU point particle system: separate normal-blended smoke and additive fire/spark layers.
// ---------------------------------------------------------------------------------------------
class ParticleLayer {
  constructor({ additive = false, max = 900 }) {
    this.max = max;
    this.particles = [];
    this.free = [];
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: puffTexture },
        uViewportH: { value: Math.min(window.innerHeight * renderer.getPixelRatio(), 2400) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uViewportH;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uViewportH * 0.5 / max(1.0, -mv.z), 1.0, 520.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float a = tex.a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);
  }

  spawn(o) {
    let p;
    if (this.particles.length >= this.max) {
      p = this.particles[(Math.random() * this.particles.length) | 0];
      p.age = 0;
    } else {
      p = {};
      this.particles.push(p);
    }
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
    p.r = o.r; p.g = o.g; p.b = o.b;
    p.size = o.size; p.growth = o.growth ?? 0;
    p.life = o.life; p.age = 0;
    p.alpha = o.alpha ?? 1;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.fade = o.fade ?? 1.4;
  }

  update(dt) {
    const parts = this.particles;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      p.vy += p.gravity * dt;
      const dragF = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragF; p.vy *= dragF; p.vz *= dragF;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.growth * dt;
    }
    const n = parts.length;
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      const k = p.age / p.life;
      const a = p.alpha * Math.pow(1 - k, p.fade);
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.colors[i * 3] = p.r;
      this.colors[i * 3 + 1] = p.g;
      this.colors[i * 3 + 2] = p.b;
      this.sizes[i] = p.size;
      this.alphas[i] = Math.max(0, a);
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aColor.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

class ParticleSystem {
  constructor() {
    this.smokeLayer = new ParticleLayer({ additive: false, max: 1000 });
    this.fireLayer = new ParticleLayer({ additive: false, max: 900 });
    this.shockwaves = [];
    this.shockGeo = new THREE.RingGeometry(0.78, 1, 32);
    this.volumetric = [];
  }

  addSmokeSprite(position, scale = 1, drift = null) {
    const mat = new THREE.SpriteMaterial({
      map: puffTexture,
      color: 0x6a6b60,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.x += rand(-4, 4) * scale;
    sprite.position.y += rand(-1, 4) * scale;
    sprite.position.z += rand(-3, 3) * scale;
    sprite.scale.setScalar(4 * scale);
    sprite.renderOrder = 2;
    scene.add(sprite);
    this.volumetric.push({
      sprite,
      age: 0,
      life: rand(1.7, 2.7),
      size: 4 * scale,
      growth: rand(5.5, 9.5) * scale,
      vx: (drift?.vx ?? 0) + rand(-2, 2) * scale,
      vy: (drift?.vy ?? 3.5) + rand(0.4, 2.2),
      vz: rand(-1, 1),
      alpha: 0.16 + Math.random() * 0.09,
    });
    if (this.volumetric.length > 28) {
      const old = this.volumetric.shift();
      scene.remove(old.sprite);
      old.sprite.material.dispose();
    }
  }

  addFlash(position, scale = 1, color = 0xffc477) {
    const mat = new THREE.SpriteMaterial({
      map: puffTexture, color, transparent: true, opacity: 0.88,
      depthWrite: false, blending: THREE.NormalBlending, fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.setScalar(3 * scale);
    sprite.renderOrder = 5;
    scene.add(sprite);
    this.volumetric.push({
      sprite, age: 0, life: 0.26, size: 3 * scale, growth: 30 * scale,
      vx: 0, vy: 0, vz: 0, alpha: 0.88, isFlash: true,
    });
  }

  addFireball(position, scale = 1) {
    const mat = new THREE.SpriteMaterial({
      map: puffTexture, color: pick([0xff7b2a, 0xff9c38, 0xff5a1b]),
      transparent: true, opacity: 0.62, depthWrite: false,
      blending: THREE.NormalBlending, fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.x += rand(-3, 3) * scale;
    sprite.position.y += rand(0, 4) * scale;
    sprite.scale.setScalar(3.2 * scale);
    sprite.renderOrder = 4;
    scene.add(sprite);
    this.volumetric.push({
      sprite, age: 0, life: rand(0.45, 0.7), size: 3.2 * scale,
      growth: rand(11, 16) * scale, vx: rand(-1, 1) * scale,
      vy: rand(2.2, 5) * scale, vz: 0, alpha: 0.55,
    });
  }

  smoke(x, y, z, count = 1, opts = {}) {
    const spread = opts.spread ?? 1.2;
    const speed = opts.speed ?? 1.5;
    for (let i = 0; i < count; i++) {
      const c = opts.color ?? 0x71817d;
      _c1.setHex(c);
      const shade = 0.8 + Math.random() * 0.4;
      this.smokeLayer.spawn({
        x: x + rand(-spread, spread), y: y + rand(-spread, spread), z: z + rand(-spread, spread),
        vx: (opts.vx ?? 0) + rand(-speed, speed), vy: (opts.vy ?? 1.2) + rand(-speed * 0.5, speed),
        vz: (opts.vz ?? 0) + rand(-speed, speed),
        r: _c1.r * shade, g: _c1.g * shade, b: _c1.b * shade,
        size: (opts.size ?? 2.5) * rand(0.7, 1.4),
        growth: opts.growth ?? 5.5 * rand(0.7, 1.3),
        life: (opts.life ?? 1.6) * rand(0.7, 1.35),
        alpha: opts.alpha ?? 0.42,
        gravity: opts.gravity ?? 0,
        drag: opts.drag ?? 0.5,
        fade: opts.fade ?? 1.5,
      });
    }
  }

  fire(x, y, z, count = 1, opts = {}) {
    for (let i = 0; i < count; i++) {
      _c1.setHex(pick([0xffb245, 0xff8526, 0xff5d1c, 0xffe08a]));
      this.fireLayer.spawn({
        x: x + rand(-0.5, 0.5), y: y + rand(-0.5, 0.5), z: z + rand(-0.5, 0.5),
        vx: (opts.vx ?? 0) + rand(-2.5, 2.5), vy: (opts.vy ?? 1) + rand(-1.2, 3),
        vz: (opts.vz ?? 0) + rand(-1.5, 1.5),
        r: _c1.r, g: _c1.g, b: _c1.b,
        size: (opts.size ?? 2.1) * rand(0.65, 1.35),
        growth: opts.growth ?? 5.5,
        life: (opts.life ?? 0.42) * rand(0.7, 1.25),
        alpha: opts.alpha ?? 0.92,
        gravity: opts.gravity ?? 1.5,
        drag: 1.1,
        fade: 1.5,
      });
    }
  }

  sparks(x, y, z, count = 10, speed = 18, color = 0xffba61) {
    for (let i = 0; i < count; i++) {
      _c1.setHex(color);
      const a = Math.random() * TAU;
      const v = rand(speed * 0.35, speed);
      this.fireLayer.spawn({
        x, y, z,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v + rand(0, 8),
        vz: rand(-1, 1) * v * 0.4,
        r: _c1.r, g: _c1.g, b: _c1.b,
        size: rand(0.14, 0.36), growth: 0,
        life: rand(0.35, 0.95), alpha: 1,
        gravity: -22, drag: 0.2, fade: 1,
      });
    }
  }

  explosion(position, scale = 1, water = false) {
    const { x, y, z } = position;
    const p = new THREE.Vector3(x, y, z);
    this.addFlash(p, scale * (water ? 0.9 : 1.25), water ? 0xbde8dc : 0xffbf66);
    if (water) {
      this.smoke(x, y + 1, z, Math.round(18 * scale), { color: 0xd8e1d8, size: 6 * scale, spread: 2 * scale, speed: 5, vy: 9, life: 1.9, alpha: 0.55 });
      this.sparks(x, y + 1, z, Math.round(30 * scale), 20 * scale, 0xc8fff1);
      this.fire(x, y + 1, z, Math.round(9 * scale), { size: 4 * scale, life: 0.3, alpha: 0.7 });
      this.addSmokeSprite(p, scale * 1.1, { vy: 4.5 });
    } else {
      this.fire(x, y + 0.5, z, Math.round(30 * scale), { size: 2.8 * scale, growth: 8 * scale, speed: 3.5, vy: 8, life: 0.72, gravity: 2, alpha: 0.6 });
      this.smoke(x, y + 2.5, z, Math.round(16 * scale), { color: pick([0x5f6158, 0x707064, 0x53564f]), size: 5.0 * scale, spread: 2.2 * scale, speed: 4, vy: 6.5, growth: 8 * scale, life: 2.4, alpha: 0.36 });
      this.sparks(x, y + 1, z, Math.round(32 * scale), 28 * scale);
      for (let i = 0; i < 3; i++) this.addFireball(p, scale * (0.8 + Math.random() * 0.4));
      for (let i = 0; i < 3; i++) this.addSmokeSprite(p, scale * (0.75 + Math.random() * 0.45), { vy: 3.4 });
    }
    this.shockwave(p, scale, water ? 0xc8fff1 : 0xffba66);
  }

  shockwave(pos, scale, color) {
    if (this.shockwaves.length > 7) return;
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
      blending: THREE.NormalBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.shockGeo, mat);
    mesh.position.copy(pos);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(2 * scale);
    scene.add(mesh);
    this.shockwaves.push({ mesh, age: 0, life: 0.48, scale: scale });
  }

  dust(position, scale = 1, count = 4) {
    this.smoke(position.x, position.y, position.z, count, {
      color: 0xbca77e, size: 2.2 * scale, spread: 1.7 * scale, speed: 2.6,
      vy: 1.3, life: 1.1, alpha: 0.33, growth: 4 * scale,
    });
  }

  clear() {
    this.smokeLayer.particles.length = 0;
    this.fireLayer.particles.length = 0;
    for (const s of this.shockwaves) {
      scene.remove(s.mesh);
      s.mesh.material.dispose();
    }
    this.shockwaves.length = 0;
    for (const v of this.volumetric) {
      scene.remove(v.sprite);
      v.sprite.material.dispose();
    }
    this.volumetric.length = 0;
    // Push empty draw ranges so old points disappear before the next frame.
    this.smokeLayer.update(0);
    this.fireLayer.update(0);
  }

  update(dt) {
    this.smokeLayer.update(dt);
    this.fireLayer.update(dt);
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.age += dt;
      const k = s.age / s.life;
      s.mesh.scale.setScalar(s.scale * (4 + k * 22));
      s.mesh.material.opacity = Math.max(0, (1 - k) * 0.28);
      if (k >= 1) {
        scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }
    for (let i = this.volumetric.length - 1; i >= 0; i--) {
      const v = this.volumetric[i];
      v.age += dt;
      v.sprite.position.x += v.vx * dt;
      v.sprite.position.y += v.vy * dt;
      v.sprite.position.z += v.vz * dt;
      const k = v.age / v.life;
      const newSize = v.size + v.growth * Math.min(k, 1);
      v.sprite.scale.setScalar(newSize);
      v.sprite.material.opacity = Math.max(0, v.alpha * Math.pow(1 - k, v.isFlash ? 0.45 : 1.3));
      if (k >= 1) {
        scene.remove(v.sprite);
        v.sprite.material.dispose();
        this.volumetric.splice(i, 1);
      }
    }
  }
}


const particles = new ParticleSystem();

export { ParticleLayer, ParticleSystem, particles };
