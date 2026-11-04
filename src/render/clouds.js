import * as THREE from 'three';
import { TAU, mulberry32 } from '../core/utils.js';
import { scene, renderer } from './scene.js';

// ---------------------------------------------------------------------------------------------
//  Volumetric-feeling cloud banks made from layered soft point sprites.
// ---------------------------------------------------------------------------------------------

function makeCloudCanvasTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const rng = mulberry32(7741);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';

  const drawBlob = (cx, cy, rx, ry, alpha, warm = 1) => {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grad.addColorStop(0, `rgba(255,244,232,${alpha})`);
    grad.addColorStop(0.38, `rgba(255,233,216,${alpha * 0.88})`);
    grad.addColorStop(0.7, `rgba(241,211,201,${alpha * 0.42})`);
    grad.addColorStop(0.9, `rgba(215,192,192,${alpha * 0.12})`);
    grad.addColorStop(1, 'rgba(205,183,185,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  };

  // Dense cumulus core with torn, feathered edges.
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    drawBlob(118 + t * 275 + (rng() - 0.5) * 26, 143 - Math.sin(t * Math.PI) * (22 + rng() * 22), 74 + rng() * 54, 34 + rng() * 26, 0.16 + rng() * 0.13);
  }
  for (let i = 0; i < 56; i++) {
    const t = i / 55;
    const shoulder = Math.sin(t * Math.PI);
    const cx = 60 + t * 392 + (rng() - 0.5) * 34;
    const cy = 145 - shoulder * (28 + rng() * 74) + (rng() - 0.5) * (20 + shoulder * 18);
    const rx = 31 + rng() * 57 - Math.abs(t - 0.5) * 16;
    const ry = 13 + rng() * 28;
    drawBlob(cx, cy, rx, ry, 0.08 + rng() * 0.16);
  }
  // A few darker underbellies and wispy tails.
  for (let i = 0; i < 13; i++) {
    const x = 80 + rng() * 350;
    drawBlob(x, 168 + rng() * 26, 65 + rng() * 80, 12 + rng() * 13, 0.045 + rng() * 0.06);
  }
  ctx.strokeStyle = 'rgba(255,229,214,.12)';
  for (let i = 0; i < 12; i++) {
    const x = 70 + rng() * 380, y = 92 + rng() * 80;
    ctx.lineWidth = 1 + rng() * 3.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 40 + rng() * 80, y - 5 + rng() * 16, x + 90 + rng() * 130, y + (rng() - 0.5) * 9);
    ctx.stroke();
  }
  // Lift the very low-alpha overlaps into a visible but still soft cloud body.
  const img = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < img.data.length; i += 4) {
    img.data[i] = Math.min(255, img.data[i] * 2.6);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
class CloudField {
  constructor() {
    this.texture = makeCloudCanvasTexture();
    this.rng = mulberry32(33911);
    this.clouds = [];
    const count = 26;
    for (let i = 0; i < count; i++) {
      this.clouds.push({
        x: (this.rng() - 0.5) * 3000,
        y: 48 + this.rng() * 190,
        z: -170 - this.rng() * 820,
        width: 155 + this.rng() * 310,
        height: 58 + this.rng() * 145,
        roll: (this.rng() - 0.5) * 0.14,
        speed: 0.6 + this.rng() * 1.3,
        tint: 0.9 + this.rng() * 0.16,
      });
    }
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -4;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    this.clouds.forEach((cloud, i) => {
      dummy.position.set(cloud.x, cloud.y, cloud.z);
      dummy.rotation.set(0, 0, cloud.roll);
      dummy.scale.set(cloud.width, cloud.height, 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      color.setRGB(cloud.tint, cloud.tint * 0.87, cloud.tint * 0.8);
      this.mesh.setColorAt(i, color);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);

    // Chunky low-poly cumulus banks add volume and readable shape to the sky.
    this.puffClusters = [];
    const totalPuffs = [];
    for (let ci = 0; ci < 13; ci++) {
      const cluster = {
        x: (this.rng() - 0.5) * 3000,
        y: 58 + this.rng() * 155,
        z: -165 - this.rng() * 440,
        speed: 0.35 + this.rng() * 0.9,
        phase: this.rng() * TAU,
        puffs: [],
      };
      const n = 7 + ((this.rng() * 7) | 0);
      for (let i = 0; i < n; i++) {
        cluster.puffs.push({
          ox: (this.rng() - 0.5) * (60 + this.rng() * 100),
          oy: (this.rng() - 0.5) * (18 + this.rng() * 34),
          oz: (this.rng() - 0.5) * (28 + this.rng() * 65),
          sx: 12 + this.rng() * 27,
          sy: 8 + this.rng() * 19,
          sz: 10 + this.rng() * 22,
          rot: this.rng() * TAU,
          shade: 0.88 + this.rng() * 0.16,
        });
        totalPuffs.push(cluster.puffs[cluster.puffs.length - 1]);
      }
      this.puffClusters.push(cluster);
    }
    this.puffGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.puffMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, metalness: 0,
      flatShading: true, emissive: 0x3d2d2a, emissiveIntensity: 0.12,
    });
    this.puffMesh = new THREE.InstancedMesh(this.puffGeometry, this.puffMaterial, totalPuffs.length);
    this.puffMesh.castShadow = false;
    this.puffMesh.receiveShadow = false;
    this.puffMesh.frustumCulled = false;
    this.puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < totalPuffs.length; i++) {
      const p = totalPuffs[i];
      c.setRGB(p.shade, p.shade * 0.9, p.shade * 0.84);
      this.puffMesh.setColorAt(i, c);
    }
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;
    scene.add(this.puffMesh);

    this.dummy = new THREE.Object3D();
    this.q = new THREE.Quaternion();
    this.qRoll = new THREE.Quaternion();
    this.rollAxis = new THREE.Vector3(0, 0, 1);
    this.uniforms = {};
    this.time = 0;
  }
  update(dt, camera, playerX) {
    this.time += dt;
    const camX = camera.position.x;
    this.mesh.material.opacity = 0.72;
    // Update the chunky cumulus clouds.
    let index = 0;
    for (let ci = 0; ci < this.puffClusters.length; ci++) {
      const cluster = this.puffClusters[ci];
      cluster.x += cluster.speed * dt;
      if (cluster.x > camX + 1800) cluster.x -= 3600;
      else if (cluster.x < camX - 1800) cluster.x += 3600;
      for (let i = 0; i < cluster.puffs.length; i++) {
        const puff = cluster.puffs[i];
        this.dummy.position.set(cluster.x + puff.ox, cluster.y + puff.oy + Math.sin(this.time * 0.05 + cluster.phase) * 1.2, cluster.z + puff.oz);
        this.dummy.rotation.set(0, puff.rot, puff.rot * 0.2);
        this.dummy.scale.set(puff.sx, puff.sy, puff.sz);
        this.dummy.updateMatrix();
        this.puffMesh.setMatrixAt(index++, this.dummy.matrix);
      }
    }
    this.puffMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.x += c.speed * dt;
      if (c.x > camX + 1800) c.x -= 3600;
      else if (c.x < camX - 1800) c.x += 3600;
      // Billboards face the camera, with a tiny natural roll.
      this.dummy.position.set(c.x, c.y + Math.sin(this.time * 0.04 + i) * 1.4, c.z);
      this.dummy.quaternion.copy(camera.quaternion);
      this.qRoll.setFromAxisAngle(this.rollAxis, c.roll);
      this.dummy.quaternion.multiply(this.qRoll);
      this.dummy.scale.set(c.width, c.height, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}


const clouds = new CloudField();

export { CloudField, clouds };
