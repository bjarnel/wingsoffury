import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { $, isTouch } from '../core/utils.js';

// ---------------------------------------------------------------------------------------------
//  Renderer, scene, lighting
// ---------------------------------------------------------------------------------------------
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
  stencil: false,
});
const DPR_CAP = isTouch ? 1.35 : 1.85;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0xd49a7e);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.00175);
const camera = new THREE.PerspectiveCamera(CONFIG.baseFov, window.innerWidth / window.innerHeight, 0.2, 4200);

const sunDirection = new THREE.Vector3(-0.62, 0.27, -0.52).normalize();
const sunColor = new THREE.Color(0xffc486);
const hemi = new THREE.HemisphereLight(0xa8c9de, 0x796047, 1.75);
scene.add(hemi);
const fill = new THREE.DirectionalLight(0xb4d0dc, 1.38);
fill.position.set(-30, 90, 220);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xffc18b, 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 370;
sun.shadow.camera.left = -125;
sun.shadow.camera.right = 125;
sun.shadow.camera.top = 105;
sun.shadow.camera.bottom = -105;
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.035;
sun.shadow.radius = 2;
scene.add(sun);
scene.add(sun.target);
const rim = new THREE.DirectionalLight(0x4f8fae, 0.55);
rim.position.set(80, 40, 90);
scene.add(rim);

export { renderer, scene, camera, sunDirection, sunColor, sun, DPR_CAP };
