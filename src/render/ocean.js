import * as THREE from 'three';
import { scene, sunDirection } from './scene.js';

// ---------------------------------------------------------------------------------------------
//  Ocean — a single large mesh with procedurally displaced waves and a custom light response.
// ---------------------------------------------------------------------------------------------
class Ocean {
  constructor() {
    const geo = new THREE.PlaneGeometry(8200, 6200, 190, 130);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: sunDirection.clone() },
      uSunColor: { value: new THREE.Color(0xffd09a) },
      uDeep: { value: new THREE.Color(0x062a35) },
      uShallow: { value: new THREE.Color(0x0f5e69) },
      uHorizon: { value: new THREE.Color(0xb9846e) },
    };
    const mat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        uniform float uTime;
        varying vec3 vWorld;
        varying float vCrest;
        void main(){
          vec4 world = modelMatrix * vec4(position, 1.0);
          vec2 p = world.xz;
          float w1 = sin(dot(p, vec2(0.038, 0.019)) + uTime * 0.88) * 0.20;
          float w2 = sin(dot(p, vec2(-0.024, 0.051)) - uTime * 0.73) * 0.16;
          float w3 = sin(dot(p, vec2(0.064, -0.014)) + uTime * 1.18) * 0.08;
          world.y += w1 + w2 + w3;
          vCrest = (w1 + w2 + w3) / 0.44;
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uSunDir, uSunColor, uDeep, uShallow, uHorizon;
        varying vec3 vWorld;
        varying float vCrest;
        float hash21(vec2 p){
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                     mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main(){
          // Analytic wave normals keep the water smooth instead of showing the
          // ocean mesh's triangulation as corrugated bands.
          vec2 p = vWorld.xz;
          float t = uTime;
          vec2 d1 = normalize(vec2(0.88, 0.47));
          vec2 d2 = normalize(vec2(-0.37, 0.93));
          vec2 d3 = normalize(vec2(0.22, -0.98));
          vec2 d4 = normalize(vec2(0.94, 0.34));
          vec2 slope =
            d1 * cos(dot(p, d1) * 0.061 + t * 0.55) * 0.016 +
            d2 * cos(dot(p, d2) * 0.113 - t * 0.78) * 0.009 +
            d3 * cos(dot(p, d3) * 0.241 + t * 1.22) * 0.004 +
            d4 * cos(dot(p, d4) * 0.53 - t * 1.9) * 0.0015;
          float grain = fract(sin(dot(floor(p * 0.12), vec2(12.9898, 78.233))) * 43758.5453);
          slope += (vec2(grain, fract(grain * 7.31)) - 0.5) * 0.0025;
          vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float facing = clamp(dot(n, viewDir), 0.0, 1.0);
          float fresnel = pow(1.0 - facing, 3.0);
          vec3 col = mix(uDeep, uShallow, 0.15 + n.y * 0.55 + vCrest * 0.02);
          float bodyNoise = vnoise(p * 0.028 + vec2(t * 0.017, -t * 0.012));
          float fineNoise = vnoise(p * 0.082 - vec2(t * 0.035, t * 0.026));
          col *= 0.9 + bodyNoise * 0.18 + fineNoise * 0.045;
          col = mix(col, uHorizon, fresnel * 0.36);
          // Warm counter-light from the low sun, with tight sparkling highlights.
          vec3 refl = reflect(-normalize(uSunDir), n);
          float sunAlign = max(dot(refl, viewDir), 0.0);
          float spec = pow(sunAlign, 32.0);
          float glint = pow(sunAlign, 300.0) * (0.6 + 0.4 * sin(p.x * 0.48 + p.y * 0.21 + t * 2.4));
          col += uSunColor * (spec * 0.34 + glint * 0.65);
          float crest = smoothstep(0.45, 0.95, vCrest) * (1.0 - smoothstep(0.05, 0.38, facing));
          col += vec3(0.64, 0.82, 0.79) * crest * 0.035;
          float dist = length(cameraPosition - vWorld);
          float haze = smoothstep(520.0, 3100.0, dist);
          col = mix(col, uHorizon * 0.58, haze * 0.72);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
  }
  update(camera, time) {
    this.uniforms.uTime.value = time;
    this.mesh.position.x = camera.position.x;
    this.mesh.position.z = camera.position.z - 1900;
  }
}


const ocean = new Ocean();

export { Ocean, ocean };
