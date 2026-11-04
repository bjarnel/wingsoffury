import * as THREE from 'three';
import { clamp, _v1, _q1, UP } from '../core/utils.js';
import { scene } from '../render/scene.js';

// ---------------------------------------------------------------------------------------------
//  Tracer renderer — all projectiles share one instanced mesh and one draw call.
// ---------------------------------------------------------------------------------------------
class TracerRenderer {
  constructor() {
    const geo = new THREE.CylinderGeometry(0.11, 0.11, 1, 5, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.92,
      blending: THREE.NormalBlending, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, 180);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }
  update(bullets) {
    let n = 0;
    for (let i = 0; i < bullets.length && n < 180; i++) {
      const b = bullets[i];
      if (b.dead) continue;
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (sp < 1) continue;
      const dir = _v1.set(b.vx, b.vy, b.vz).multiplyScalar(1 / sp);
      const len = clamp(sp * 0.035, 1.5, 7.2);
      this.dummy.position.set(b.x, b.y, b.z).addScaledVector(dir, -len * 0.5);
      _q1.setFromUnitVectors(UP, dir);
      this.dummy.quaternion.copy(_q1);
      this.dummy.scale.set(1, len, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.color.setHex(b.color || 0xffc66b);
      this.mesh.setColorAt(n, this.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}


const tracers = new TracerRenderer();

export { TracerRenderer, tracers };
