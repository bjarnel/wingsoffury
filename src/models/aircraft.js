import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { TAU } from '../core/utils.js';
import { scene } from '../render/scene.js';
import {
  addPart, mergeParts, coloredMesh, makeStarGeometry,
  playerMaterial, enemyMaterial, propsMaterial, darkMaterial,
} from './parts.js';

// ---------------------------------------------------------------------------------------------
//  Low-poly WWII fighter (F6F Hellcat flavour)
// ---------------------------------------------------------------------------------------------
function createFighterModel(palette, isPlayer = false) {
  const root = new THREE.Group();
  const bank = new THREE.Group();
  const pitch = new THREE.Group();
  root.add(bank); bank.add(pitch);

  const parts = [];
  const body = palette.body;
  const wing = palette.wing;
  const accent = palette.accent;
  const dark = palette.dark;
  const glass = palette.glass;

  // Fuselage and tail cone. Local +X is forward.
  addPart(parts, new THREE.CylinderGeometry(0.29, 0.51, 5.8, 8, 1), body, [0, 0, 0], [0, 0, -Math.PI / 2]);
  addPart(parts, new THREE.ConeGeometry(0.51, 1.45, 8), body, [-3.38, 0, 0], [0, 0, Math.PI / 2]);
  addPart(parts, new THREE.CylinderGeometry(0.34, 0.47, 0.52, 8, 1), accent, [2.77, 0, 0], [0, 0, Math.PI / 2]);
  addPart(parts, new THREE.TorusGeometry(0.44, 0.07, 5, 12), dark, [2.89, 0, 0], [0, Math.PI / 2, 0], [1, 1, 1]);
  // Main wing (slightly flattened box gives the chunky low-poly silhouette).
  addPart(parts, new THREE.BoxGeometry(2.35, 0.15, 9.2), wing, [-0.32, -0.18, 0]);
  addPart(parts, new THREE.BoxGeometry(2.1, 0.11, 0.26), accent, [-0.3, -0.17, 4.28]);
  addPart(parts, new THREE.BoxGeometry(2.1, 0.11, 0.26), accent, [-0.3, -0.17, -4.28]);
  addPart(parts, new THREE.BoxGeometry(0.24, 0.16, 6.1), body, [-0.15, -0.11, 0]);
  // Tailplane and fin.
  addPart(parts, new THREE.BoxGeometry(1.1, 0.11, 3.3), wing, [-2.87, 0.08, 0]);
  addPart(parts, new THREE.BoxGeometry(0.95, 1.25, 0.13), body, [-2.82, 0.65, 0]);
  addPart(parts, new THREE.BoxGeometry(0.18, 0.9, 0.14), accent, [-2.7, 0.72, 0]);
  addPart(parts, new THREE.BoxGeometry(0.8, 0.3, 0.12), dark, [-3.1, 1.35, 0]);
  // Cockpit and armoured glass.
  addPart(parts, new THREE.SphereGeometry(0.55, 8, 6), glass, [-0.15, 0.4, 0], [0, 0, 0], [1.55, 0.72, 0.92]);
  addPart(parts, new THREE.BoxGeometry(0.15, 0.55, 0.66), dark, [-1.05, 0.35, 0]);
  // Exhaust stacks along the engine cowl.
  for (let i = 0; i < 5; i++) {
    addPart(parts, new THREE.BoxGeometry(0.15, 0.12, 0.45), dark, [1.55 + i * 0.24, 0.22, 0.42]);
  }
  // Wing gun barrels.
  addPart(parts, new THREE.CylinderGeometry(0.035, 0.035, 1.06, 5), dark, [1.05, -0.16, 3.1], [0, 0, Math.PI / 2]);
  addPart(parts, new THREE.CylinderGeometry(0.035, 0.035, 1.06, 5), dark, [1.05, -0.16, -3.1], [0, 0, Math.PI / 2]);
  // Tail wheel.
  addPart(parts, new THREE.CylinderGeometry(0.14, 0.14, 0.16, 8), dark, [-2.75, -0.5, 0], [Math.PI / 2, 0, 0]);
  if (isPlayer) {
    // Star-and-bar insignia, visible from the camera-facing side.
    addPart(parts, makeStarGeometry(0.38, 0.16), 0xeee2bf, [-0.45, 0.03, 0.515], [0, 0, 0], [1, 1, 1]);
    addPart(parts, new THREE.BoxGeometry(0.9, 0.04, 0.03), 0x1b3550, [-0.45, 0.03, 0.53]);
  } else {
    addPart(parts, new THREE.BoxGeometry(0.23, 0.9, 0.14), 0xb85745, [-2.65, 0.7, 0.02]);
  }

  const mainMesh = coloredMesh(parts, isPlayer ? playerMaterial : enemyMaterial, true, false);
  pitch.add(mainMesh);

  // Spinning propeller + translucent blur disc.
  const prop = new THREE.Group();
  prop.position.set(3.34, 0, 0);
  const propParts = [];
  addPart(propParts, new THREE.ConeGeometry(0.22, 0.64, 8), dark, [0, 0, 0], [0, 0, -Math.PI / 2]);
  for (let i = 0; i < 3; i++) {
    addPart(propParts, new THREE.BoxGeometry(0.08, 1.16, 0.18), 0x202526, [0, 0.6, 0], [i * TAU / 3, 0, 0]);
  }
  const propMesh = new THREE.Mesh(mergeParts(propParts), propsMaterial);
  propMesh.castShadow = true;
  prop.add(propMesh);
  const blurMat = new THREE.MeshBasicMaterial({
    color: isPlayer ? 0xf3d8ac : 0xe0b29b,
    transparent: true, opacity: 0.12, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(1.23, 20), blurMat);
  blur.rotation.y = Math.PI / 2;
  prop.add(blur);
  pitch.add(prop);

  // Deployable landing gear (simple and readable at gameplay distance).
  const gear = new THREE.Group();
  const gearParts = [];
  addPart(gearParts, new THREE.BoxGeometry(0.08, 0.8, 0.08), 0x2b2f2d, [0.65, -0.65, 0.66]);
  addPart(gearParts, new THREE.BoxGeometry(0.08, 0.8, 0.08), 0x2b2f2d, [0.65, -0.65, -0.66]);
  addPart(gearParts, new THREE.CylinderGeometry(0.24, 0.24, 0.16, 9), 0x171a1a, [0.65, -1.02, 0.75], [Math.PI / 2, 0, 0]);
  addPart(gearParts, new THREE.CylinderGeometry(0.24, 0.24, 0.16, 9), 0x171a1a, [0.65, -1.02, -0.75], [Math.PI / 2, 0, 0]);
  const gearMesh = coloredMesh(gearParts, darkMaterial, true, false);
  gear.add(gearMesh);
  gear.visible = false;
  pitch.add(gear);

  root.scale.setScalar(1.45);
  root.userData = { bank, pitch, prop, blur, gear, mainMesh, propMesh };
  return root;
}

const playerPalette = { body: 0x416b8a, wing: 0x315575, accent: 0xffcf73, dark: 0x1a2d36, glass: 0x78cbd2 };
const enemyPalette = { body: 0x5a6048, wing: 0x48503c, accent: 0xc25b45, dark: 0x232b25, glass: 0x7ca29a };
const acePalette = { body: 0x6d4d38, wing: 0x513b2d, accent: 0xe04b35, dark: 0x2a211c, glass: 0x9ac9c0 };

function createPlayerAircraft() {
  const root = createFighterModel(playerPalette, true);
  root.position.set(-57, CONFIG.deckY + 2.2, 0);
  scene.add(root);
  return root;
}


const playerModel = createPlayerAircraft();

export { createFighterModel, playerPalette, enemyPalette, acePalette, createPlayerAircraft, playerModel };
