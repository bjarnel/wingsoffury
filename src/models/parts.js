import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { _e1, _m1, _c1 } from '../core/utils.js';

// ---------------------------------------------------------------------------------------------
//  Geometry assembly helpers. Static multi-colour parts are merged into one mesh per object.
// ---------------------------------------------------------------------------------------------
function addPart(parts, geometry, color, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  let g = geometry.clone();
  geometry.dispose();
  if (g.index) {
    const flat = g.toNonIndexed();
    g.dispose();
    g = flat;
  }
  g.scale(scale[0], scale[1], scale[2]);
  if (rotation[0] || rotation[1] || rotation[2]) {
    _e1.set(rotation[0], rotation[1], rotation[2]);
    _m1.makeRotationFromEuler(_e1);
    g.applyMatrix4(_m1);
  }
  g.translate(position[0], position[1], position[2]);
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  _c1.setHex(color);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = _c1.r; arr[i * 3 + 1] = _c1.g; arr[i * 3 + 2] = _c1.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  parts.push(g);
  return g;
}

function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  parts.forEach(g => g.dispose());
  if (!merged) throw new Error('Geometry merge failed');
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function coloredMesh(parts, material, cast = true, receive = false) {
  const geo = mergeParts(parts);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function makeStarGeometry(outer = 1, inner = 0.45) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + i * Math.PI / 5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

const playerMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.2, flatShading: true });
const enemyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.05, flatShading: true });
const propsMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.38, flatShading: true });
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2425, roughness: 0.7, metalness: 0.2, flatShading: true });

export {
  addPart, mergeParts, coloredMesh, makeStarGeometry,
  playerMaterial, enemyMaterial, propsMaterial, darkMaterial,
};
