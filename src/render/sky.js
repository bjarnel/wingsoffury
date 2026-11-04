import * as THREE from 'three';
import { scene, sunColor, sunDirection } from './scene.js';

// ---------------------------------------------------------------------------------------------
//  Sunset sky dome — a shader gradient with a low sun, haze and a few early stars.
// ---------------------------------------------------------------------------------------------
class SkyDome {
  constructor() {
    this.uniforms = {
      uTop: { value: new THREE.Color(0x172b53) },
      uMid: { value: new THREE.Color(0x8f6079) },
      uHorizon: { value: new THREE.Color(0xf1a76f) },
      uLow: { value: new THREE.Color(0x3b4f61) },
      uSun: { value: sunColor.clone() },
      uSunDir: { value: sunDirection.clone() },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uTop, uMid, uHorizon, uLow, uSun, uSunDir;
        float hash21(vec2 p){
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        void main(){
          vec3 dir = normalize(vDir);
          float h = dir.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
          col = mix(col, uTop, smoothstep(0.15, 0.72, h));
          col = mix(uLow, col, smoothstep(-0.18, 0.015, h));
          float sd = max(dot(dir, normalize(uSunDir)), 0.0);
          // Broad atmospheric glow, then the actual disc.
          col += uSun * (pow(sd, 5.0) * 0.2 + pow(sd, 44.0) * 0.55);
          float disc = smoothstep(0.9972, 0.9994, sd);
          col = mix(col, uSun * 1.9 + vec3(0.22, 0.08, 0.0), disc);
          col += uHorizon * (1.0 - smoothstep(0.0, 0.13, abs(h))) * 0.1;
          // Faint star dust high in the cooler sky.
          vec2 sp = dir.xz / max(0.12, dir.y + 0.45) * 170.0;
          float star = step(0.9973, hash21(floor(sp))) * smoothstep(0.22, 0.7, h);
          col += vec3(star) * 0.7;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(3200, 40, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }
  update(camera) {
    this.mesh.position.copy(camera.position);
  }
}

const sky = new SkyDome();

export { SkyDome, sky };
