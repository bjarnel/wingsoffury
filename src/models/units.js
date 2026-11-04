import * as THREE from 'three';
import { TAU } from '../core/utils.js';
import { addPart, mergeParts, coloredMesh } from './parts.js';

// ---------------------------------------------------------------------------------------------
//  Enemy ground assets — built from merged, vertex-coloured primitives.
// ---------------------------------------------------------------------------------------------
const unitMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.88, metalness: 0.04, flatShading: true,
});
const officerGreen = 0x61705a;
const bunkerGrey = 0x77796e;

function createAAGun() {
  const group = new THREE.Group();
  const baseParts = [];
  // Sandbag ring and concrete pedestal.
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU;
    addPart(baseParts, new THREE.SphereGeometry(0.75, 6, 4), 0x9e8f6b,
      [Math.cos(a) * 2.5, 0.45, Math.sin(a) * 2.5], [0, a, 0], [1.25, 0.65, 0.8]);
  }
  addPart(baseParts, new THREE.CylinderGeometry(1.55, 1.9, 1.25, 8), 0x6e6f62, [0, 0.85, 0]);
  addPart(baseParts, new THREE.CylinderGeometry(1.3, 1.3, 0.25, 8), 0x444b47, [0, 1.55, 0]);
  addPart(baseParts, new THREE.BoxGeometry(2.4, 1.25, 0.22), 0x4f5a50, [0.4, 2.05, 0.1]);
  addPart(baseParts, new THREE.BoxGeometry(0.2, 0.75, 0.9), 0x343b38, [-0.7, 1.8, 0]);
  // Red range flag.
  addPart(baseParts, new THREE.CylinderGeometry(0.04, 0.04, 4.4, 4), 0x4d4534, [-2.8, 2.2, 0.3]);
  addPart(baseParts, new THREE.BoxGeometry(1.35, 0.7, 0.04), 0xb24e3b, [-2.15, 3.9, 0.3]);
  const base = coloredMesh(baseParts, unitMaterial, true, true);
  group.add(base);

  const pivot = new THREE.Group();
  pivot.position.y = 1.7;
  const gunParts = [];
  addPart(gunParts, new THREE.CylinderGeometry(0.5, 0.62, 0.55, 8), 0x47534b, [0, 0, 0]);
  addPart(gunParts, new THREE.BoxGeometry(1.1, 1.0, 1.35), 0x5b6659, [0.3, 0.1, 0]);
  addPart(gunParts, new THREE.CylinderGeometry(0.12, 0.14, 3.1, 6), 0x303631, [1.9, 0.12, 0.33], [0, 0, Math.PI / 2]);
  addPart(gunParts, new THREE.CylinderGeometry(0.12, 0.14, 3.1, 6), 0x303631, [1.9, 0.12, -0.33], [0, 0, Math.PI / 2]);
  addPart(gunParts, new THREE.BoxGeometry(0.5, 0.45, 0.42), 0x252c29, [3.48, 0.12, 0.33]);
  addPart(gunParts, new THREE.BoxGeometry(0.5, 0.45, 0.42), 0x252c29, [3.48, 0.12, -0.33]);
  const gun = coloredMesh(gunParts, unitMaterial, true, false);
  pivot.add(gun);
  group.add(pivot);
  return { group, pivot, muzzle: new THREE.Vector3(3.4, 0.1, 0) };
}

function createBunker() {
  const group = new THREE.Group();
  const parts = [];
  addPart(parts, new THREE.BoxGeometry(11, 3.7, 7.4), bunkerGrey, [0, 1.85, 0]);
  addPart(parts, new THREE.CylinderGeometry(6.1, 6.5, 1.0, 4), 0x66685f, [0, 4.0, 0], [0, Math.PI / 4, 0], [1, 1, 0.72]);
  addPart(parts, new THREE.BoxGeometry(4.1, 1.3, 0.28), 0x141b1b, [0.7, 2.2, 3.75]);
  addPart(parts, new THREE.BoxGeometry(0.25, 3.3, 7.4), 0x5b5e56, [5.45, 1.7, 0]);
  addPart(parts, new THREE.BoxGeometry(1.1, 0.3, 8.6), 0x5b5e56, [0, 3.8, 0]);
  for (let i = 0; i < 4; i++) {
    addPart(parts, new THREE.SphereGeometry(0.72, 6, 4), 0x9c8c65,
      [-4.5 + i * 1.2, 0.45, 4.0], [0, 0, 0], [1.3, 0.62, 0.8]);
  }
  addPart(parts, new THREE.CylinderGeometry(0.06, 0.06, 6.4, 4), 0x5a4a35, [3.2, 6.0, -2.4]);
  addPart(parts, new THREE.BoxGeometry(2.0, 1.05, 0.06), 0xa14837, [2.2, 8.55, -2.4]);
  addPart(parts, new THREE.BoxGeometry(1.0, 0.45, 0.16), 0x2e322b, [0.8, 2.2, 3.92]);
  const mesh = coloredMesh(parts, unitMaterial, true, true);
  group.add(mesh);
  return { group };
}

function createBarracks() {
  const group = new THREE.Group();
  const parts = [];
  addPart(parts, new THREE.BoxGeometry(13, 3.3, 7.2), 0x5d6957, [0, 1.65, 0]);
  addPart(parts, new THREE.BoxGeometry(13.6, 1.1, 7.9), 0x4b5548, [0, 3.55, 0], [0, 0, 0.06]);
  addPart(parts, new THREE.BoxGeometry(14.1, 0.22, 8.1), 0x394139, [0, 4.1, 0]);
  addPart(parts, new THREE.BoxGeometry(1.8, 2.6, 0.18), 0x252d27, [-3, 1.35, 3.65]);
  addPart(parts, new THREE.BoxGeometry(1.1, 0.9, 0.2), 0x182323, [3.3, 2.2, 3.65]);
  addPart(parts, new THREE.BoxGeometry(1.1, 0.9, 0.2), 0x182323, [5.0, 2.2, 3.65]);
  // Crates and a fuel drum.
  addPart(parts, new THREE.BoxGeometry(1.3, 1.3, 1.3), 0x74654c, [-7.8, 0.65, 2.2]);
  addPart(parts, new THREE.BoxGeometry(1.1, 1.1, 1.1), 0x74654c, [-6.6, 0.55, 2.9], [0, 0.3, 0]);
  addPart(parts, new THREE.CylinderGeometry(0.55, 0.55, 1.2, 8), 0x6b4b37, [6.7, 0.6, 2.4]);
  addPart(parts, new THREE.CylinderGeometry(0.05, 0.05, 4.6, 4), 0x4c4232, [5.6, 2.3, -2.4]);
  addPart(parts, new THREE.BoxGeometry(1.4, 0.75, 0.05), 0xb04c3a, [4.95, 4.0, -2.4]);
  const mesh = coloredMesh(parts, unitMaterial, true, true);
  group.add(mesh);
  return { group };
}

function createTank() {
  const group = new THREE.Group();
  const baseParts = [];
  addPart(baseParts, new THREE.BoxGeometry(4.8, 0.9, 2.5), 0x39413a, [0, 0.7, 0]);
  addPart(baseParts, new THREE.BoxGeometry(5.5, 0.7, 2.9), 0x28302b, [0, 0.55, 0]);
  for (let i = 0; i < 5; i++) {
    const x = -2.15 + i * 1.08;
    addPart(baseParts, new THREE.CylinderGeometry(0.43, 0.43, 2.95, 8), 0x1e2521, [x, 0.22, 0], [Math.PI / 2, 0, 0]);
    addPart(baseParts, new THREE.CylinderGeometry(0.24, 0.24, 3.0, 6), 0x4a4f42, [x, 0.22, 0], [Math.PI / 2, 0, 0]);
  }
  addPart(baseParts, new THREE.BoxGeometry(5.0, 1.0, 3.1), 0x4f5b48, [0, 1.25, 0]);
  addPart(baseParts, new THREE.BoxGeometry(1.15, 0.48, 2.2), 0x4a5543, [0.7, 1.9, 0]);
  addPart(baseParts, new THREE.BoxGeometry(0.5, 0.35, 0.4), 0x1e2521, [-1.3, 1.95, 0.8]);
  addPart(baseParts, new THREE.CylinderGeometry(0.06, 0.06, 4.8, 4), 0x3b3a2e, [-1.9, 3.2, 0]);
  addPart(baseParts, new THREE.BoxGeometry(1.55, 0.82, 0.05), 0xb34e39, [-2.65, 4.0, 0]);
  const base = coloredMesh(baseParts, unitMaterial, true, true);
  group.add(base);

  const pivot = new THREE.Group();
  pivot.position.set(0, 1.95, 0);
  const turretParts = [];
  addPart(turretParts, new THREE.CylinderGeometry(1.05, 1.25, 0.85, 8), 0x5c6853, [0, 0, 0]);
  addPart(turretParts, new THREE.BoxGeometry(1.8, 0.55, 1.5), 0x59654f, [0.5, 0.2, 0]);
  addPart(turretParts, new THREE.CylinderGeometry(0.11, 0.14, 3.8, 6), 0x2c332b, [2.2, 0.15, 0], [0, 0, Math.PI / 2]);
  addPart(turretParts, new THREE.BoxGeometry(0.42, 0.5, 0.42), 0x272f28, [4.08, 0.15, 0]);
  addPart(turretParts, new THREE.BoxGeometry(0.7, 0.25, 0.7), 0x222a24, [-0.3, 0.65, 0]);
  const turret = coloredMesh(turretParts, unitMaterial, true, false);
  pivot.add(turret);
  group.add(pivot);
  return { group, pivot, muzzle: new THREE.Vector3(4.1, 0.15, 0) };
}

function createSoldierGeometry() {
  const parts = [];
  addPart(parts, new THREE.BoxGeometry(0.32, 0.85, 0.3), 0x59654e, [0, 0.92, 0]);
  addPart(parts, new THREE.BoxGeometry(0.62, 0.22, 0.28), 0x69755f, [0, 1.24, 0]);
  addPart(parts, new THREE.SphereGeometry(0.24, 7, 5), 0xb58b63, [0, 1.52, 0]);
  addPart(parts, new THREE.SphereGeometry(0.31, 7, 4), 0x4f5a43, [0, 1.66, 0], [0, 0, 0], [1, 0.65, 1]);
  addPart(parts, new THREE.BoxGeometry(0.18, 0.56, 0.18), 0x424b3b, [-0.17, 0.3, 0]);
  addPart(parts, new THREE.BoxGeometry(0.18, 0.56, 0.18), 0x424b3b, [0.17, 0.3, 0]);
  addPart(parts, new THREE.BoxGeometry(0.9, 0.08, 0.08), 0x292d26, [0.27, 1.15, 0.08], [0, 0, -0.08]);
  return mergeParts(parts);
}
const soldierGeometry = createSoldierGeometry();

export {
  unitMaterial, officerGreen, bunkerGrey,
  createAAGun, createBunker, createBarracks, createTank, createSoldierGeometry,
  soldierGeometry,
};
