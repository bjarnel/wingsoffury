import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { TAU, rand, pick, _v1 } from '../core/utils.js';
import { scene } from '../render/scene.js';
import { deckTexture } from '../render/textures.js';
import { addPart, mergeParts, coloredMesh } from './parts.js';

// ---------------------------------------------------------------------------------------------
//  Aircraft carrier Wasp — one merged static mesh, one textured flight deck, one set of lights.
// ---------------------------------------------------------------------------------------------
function createCarrier() {
  const carrier = new THREE.Group();
  carrier.position.set(CONFIG.carrierX, 0, 0);
  const parts = [];

  // Hull silhouette in the x/y plane, extruded across the beam.
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-76, 2.1);
  hullShape.lineTo(46, 2.1);
  hullShape.quadraticCurveTo(72, 2.1, 82, 10.2);
  hullShape.lineTo(72, 12.2);
  hullShape.lineTo(-76, 12.2);
  hullShape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 25, bevelEnabled: false });
  hullGeo.translate(0, 0, -12.5);
  addPart(parts, hullGeo, 0x687275, [0, 0, 0]);
  // Red anti-fouling waterline.
  addPart(parts, new THREE.BoxGeometry(154, 2.6, 25.4), 0x6b3534, [3, 1.6, 0]);
  // Flight deck slab, overhanging hull.
  addPart(parts, new THREE.BoxGeometry(160, 0.8, 29), 0x394346, [0, 12.65, 0]);
  addPart(parts, new THREE.BoxGeometry(158, 0.22, 27), 0x333d3e, [-1, 13.1, 0]);
  // Island superstructure on the camera-far side.
  addPart(parts, new THREE.BoxGeometry(31, 4.6, 7.4), 0x4c5556, [-32, 15.2, -9.4]);
  addPart(parts, new THREE.BoxGeometry(25, 4.2, 7.0), 0x5b6464, [-32, 19.4, -9.6]);
  addPart(parts, new THREE.BoxGeometry(21, 1.1, 7.15), 0x122529, [-32, 20.4, -9.6]);
  addPart(parts, new THREE.BoxGeometry(10, 3.2, 6.4), 0x4b5555, [-24, 22.8, -9.6]);
  addPart(parts, new THREE.CylinderGeometry(1.6, 1.85, 7.2, 8), 0x313b3c, [-17.5, 23.2, -10.1]);
  addPart(parts, new THREE.CylinderGeometry(1.75, 1.75, 0.4, 8), 0x1b2627, [-17.5, 26.9, -10.1]);
  addPart(parts, new THREE.CylinderGeometry(0.16, 0.24, 15, 6), 0x3e4748, [-42, 26.6, -9.8]);
  addPart(parts, new THREE.BoxGeometry(8, 0.16, 0.16), 0x3e4748, [-42, 32.6, -9.8]);
  addPart(parts, new THREE.BoxGeometry(3.2, 0.4, 0.6), 0x7f8a87, [-42, 33, -9.8]);
  addPart(parts, new THREE.BoxGeometry(0.9, 1.5, 0.9), 0x2e7c86, [-42, 32.4, -9.8]);
  // Crane aft of the island.
  addPart(parts, new THREE.CylinderGeometry(0.22, 0.3, 12, 5), 0x6b706c, [38, 19.3, -8.8]);
  addPart(parts, new THREE.BoxGeometry(19, 0.4, 0.5), 0x6b706c, [45, 24.2, -8.8], [0, 0, 0.18]);
  addPart(parts, new THREE.BoxGeometry(0.3, 0.35, 5.5), 0x6b706c, [53.5, 22.2, -8.8]);
  // Deck edge gallery and AA sponsons.
  addPart(parts, new THREE.BoxGeometry(152, 0.4, 1.1), 0x3d484a, [0, 12.15, 14.7]);
  for (let i = 0; i < 5; i++) {
    const x = -58 + i * 30;
    addPart(parts, new THREE.CylinderGeometry(2.2, 2.2, 0.4, 10), 0x4a5555, [x, 12.2, 15.5]);
    addPart(parts, new THREE.BoxGeometry(0.2, 1.2, 0.2), 0x242c2d, [x, 12.9, 15.2], [0, 0, -0.4]);
    addPart(parts, new THREE.BoxGeometry(2.2, 0.2, 0.2), 0x242c2d, [x + 1, 13.4, 15.2]);
  }
  // Deck elevators and catapult tracks (very readable from the side).
  addPart(parts, new THREE.BoxGeometry(22, 0.08, 17), 0x465052, [25, 13.24, 0]);
  addPart(parts, new THREE.BoxGeometry(90, 0.055, 0.3), 0x1e2729, [-15, 13.26, 3.2]);
  addPart(parts, new THREE.BoxGeometry(90, 0.055, 0.3), 0x1e2729, [-15, 13.26, -3.2]);
  // Arresting wires across the landing area.
  for (let i = 0; i < 4; i++) {
    addPart(parts, new THREE.CylinderGeometry(0.055, 0.055, 25, 5), 0x1b2022, [8 + i * 8, 13.34, 0], [Math.PI / 2, 0, 0]);
  }
  // A pair of tiny parked aircraft on the far deck edge.
  for (let i = 0; i < 2; i++) {
    const x = -60 + i * 9;
    addPart(parts, new THREE.BoxGeometry(2.8, 0.35, 0.52), 0x39526a, [x, 13.8, -11.5]);
    addPart(parts, new THREE.BoxGeometry(1.2, 0.1, 3.2), 0x39526a, [x, 13.82, -11.5]);
    addPart(parts, new THREE.BoxGeometry(0.6, 1.0, 0.12), 0x39526a, [x - 1.1, 14.2, -11.5]);
  }
  // Tiny deck crew for scale.
  for (let i = 0; i < 5; i++) {
    addPart(parts, new THREE.BoxGeometry(0.28, 0.65, 0.28), pick([0x8f7552, 0x536357, 0x73504c]), [rand(-45, 50), 13.75, rand(-6, 6)]);
  }

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.12, flatShading: true });
  const staticMesh = coloredMesh(parts, mat, true, true);
  carrier.add(staticMesh);

  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(154, 27.5),
    new THREE.MeshStandardMaterial({ map: deckTexture, roughness: 0.9, metalness: 0.02 })
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(-1, 13.34, 0);
  deck.receiveShadow = true;
  carrier.add(deck);

  // Approach lights: one instanced mesh, blinking automatically in update.
  const lightGeo = new THREE.SphereGeometry(0.22, 6, 4);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1ba, transparent: true, opacity: 0.9 });
  const lights = new THREE.InstancedMesh(lightGeo, lightMat, 12);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 12; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    dummy.position.set(45 - Math.floor(i / 2) * 7, 13.62, side * 10.7);
    dummy.updateMatrix();
    lights.setMatrixAt(i, dummy.matrix);
  }
  carrier.add(lights);
  carrier.userData.lights = lightMat;
  carrier.userData.staticMesh = staticMesh;
  carrier.userData.deck = deck;

  scene.add(carrier);
  return carrier;
}


const carrier = createCarrier();

export { createCarrier, carrier };
