import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { TAU, clamp, lerp, smoothstep, mulberry32, Perlin } from '../core/utils.js';
import { scene } from '../render/scene.js';
import { addPart, mergeParts } from '../models/parts.js';

// ---------------------------------------------------------------------------------------------
//  Endless island chain. Chunks are deterministic and streamed around the player.
// ---------------------------------------------------------------------------------------------
const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.97, metalness: 0.015, flatShading: true,
});
const backdropMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 1, metalness: 0, flatShading: true,
});
const shoreFoamMaterial = new THREE.MeshBasicMaterial({
  color: 0xe1e5cf, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide,
});

function buildTreeGeometry() {
  const parts = [];
  addPart(parts, new THREE.CylinderGeometry(0.12, 0.26, 3.6, 5), 0x6d4f36, [0, 1.8, 0]);
  addPart(parts, new THREE.ConeGeometry(1.55, 3.2, 6), 0x3e673e, [0, 4.05, 0]);
  addPart(parts, new THREE.ConeGeometry(1.25, 2.7, 6), 0x477544, [0, 5.15, 0]);
  addPart(parts, new THREE.ConeGeometry(0.86, 2.2, 6), 0x557f42, [0, 6.15, 0]);
  return mergeParts(parts);
}
const treeGeometry = buildTreeGeometry();
const treeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });

class IslandWorld {
  constructor() {
    this.noise = new Perlin(93471);
    this.chunks = new Map();
    this.buildBudget = 0;
    this.onLoad = null;
    this.onUnload = null;
    this.nx = 57;
    this.nz = 29;
    this.zMin = -108;
    this.zMax = 48;
    this.treeInstances = [];
  }

  seedFor(index) {
    return (0x9e3779b9 ^ Math.imul(index + 8171, 0x85ebca6b)) >>> 0;
  }

  clear() {
    for (const [, c] of this.chunks) this.disposeChunk(c);
    this.chunks.clear();
  }

  disposeChunk(chunk) {
    if (!chunk) return;
    if (this.onUnload) this.onUnload(chunk);
    scene.remove(chunk.group);
    if (chunk.terrainGeo) chunk.terrainGeo.dispose();
    if (chunk.backdropGeo) chunk.backdropGeo.dispose();
    if (chunk.shoreGeo) chunk.shoreGeo.dispose();
    if (chunk.treeMesh && chunk.treeMesh.dispose) chunk.treeMesh.dispose();
    // Tree geometry and materials are shared, so only the instanced-mesh wrapper is discarded.
  }

  reset() {
    this.clear();
    this.treeInstances = [];
  }

  ensureAround(x, facing = 1, immediate = false) {
    const center = Math.floor(x / CONFIG.chunkWidth);
    const needed = [];
    // Bias the generation window in the direction of travel, but keep some behind and below.
    for (let i = center - 3; i <= center + 4; i++) {
      if (!this.chunks.has(i)) needed.push(i);
    }
    needed.sort((a, b) => {
      const pa = Math.abs(a - center) + (facing > 0 ? (a < center ? 2 : 0) : (a > center ? 2 : 0));
      const pb = Math.abs(b - center) + (facing > 0 ? (b < center ? 2 : 0) : (b > center ? 2 : 0));
      return pa - pb;
    });
    const budget = immediate ? 12 : 2;
    for (let k = 0; k < Math.min(budget, needed.length); k++) {
      if (!this.chunks.has(needed[k])) this.buildChunk(needed[k]);
    }
    for (const [i, chunk] of this.chunks) {
      if (i < center - 5 || i > center + 5) {
        this.chunks.delete(i);
        this.disposeChunk(chunk);
      }
    }
  }

  buildChunk(index) {
    const rng = mulberry32(this.seedFor(index));
    const start = index * CONFIG.chunkWidth;
    const group = new THREE.Group();
    group.position.x = start;
    // Gulf of open water around the carrier so the deck and approach are always clear.
    const homeWater = index === -1 || index === 0;
    const present = !homeWater && (index === 1 || index === -3 || rng() < 0.83);
    const chunk = {
      index, start, group, targets: [], island: null, heightData: null,
    };

    if (present) {
      const W = CONFIG.chunkWidth;
      const cx = start + W * (0.45 + rng() * 0.1);
      const cz = -20 + (rng() - 0.5) * 15;
      const rx = 92 + rng() * 28;
      const rz = 44 + rng() * 17;
      const localCX = cx - start;
      const lobeCount = 3 + ((rng() * 2) | 0);
      const lobes = [];
      for (let i = 0; i < lobeCount; i++) {
        lobes.push({
          dx: localCX + (rng() - 0.5) * rx * 1.0,
          dz: cz + (rng() - 0.5) * rz * 1.25,
          sx: 19 + rng() * 35,
          sz: 17 + rng() * 28,
          h: 11 + rng() * 25,
        });
      }
      const detailSeed = rng() * 1000;
      chunk.island = { cx, cz, rx, rz, localCX, lobes, detailSeed };
      const nx = this.nx, nz = this.nz;
      const heightData = new Float32Array(nx * nz);
      const slopeData = new Float32Array(nx * nz);
      const dxGrid = W / (nx - 1);
      const dzGrid = (this.zMax - this.zMin) / (nz - 1);

      const shapeHeight = (lx, z) => {
        const dx = lx - localCX;
        const dz = z - cz;
        const r = Math.sqrt((dx / rx) ** 2 + (dz / rz) ** 2);
        if (r > 1.04) return 0;
        const shore = smoothstep(1.04, 0.62, r);
        let hills = 0;
        for (let i = 0; i < lobes.length; i++) {
          const l = lobes[i];
          const ex = lx - l.dx, ez = z - l.dz;
          hills += l.h * Math.exp(-(ex * ex) / (2 * l.sx * l.sx) - (ez * ez) / (2 * l.sz * l.sz));
        }
        const n = this.noise.fbm((lx + start + detailSeed) * 0.018, (z + index * 71) * 0.021, 4) * 4.6;
        const ridge = this.noise.fbm((lx + start) * 0.052, z * 0.043 + 8, 2) * 1.8;
        let h = (hills + n + ridge) * shore + (1 - r) * 2.8 - 1.75;
        // Flatten extreme spikes so the silhouette stays readable.
        h = Math.min(h, 49);
        return Math.max(0, h);
      };

      // Sample the heightfield, then compute a central-difference slope for colouring.
      for (let iz = 0; iz < nz; iz++) {
        const z = this.zMin + iz * dzGrid;
        for (let ix = 0; ix < nx; ix++) {
          const lx = ix * dxGrid;
          heightData[iz * nx + ix] = shapeHeight(lx, z);
        }
      }
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const hL = heightData[iz * nx + Math.max(0, ix - 1)];
          const hR = heightData[iz * nx + Math.min(nx - 1, ix + 1)];
          const hD = heightData[Math.max(0, iz - 1) * nx + ix];
          const hU = heightData[Math.min(nz - 1, iz + 1) * nx + ix];
          slopeData[iz * nx + ix] = Math.hypot((hR - hL) / (dxGrid * 2), (hU - hD) / (dzGrid * 2));
        }
      }
      chunk.heightData = heightData;
      chunk.slopeData = slopeData;
      chunk.dxGrid = dxGrid;
      chunk.dzGrid = dzGrid;

      // Build the low-poly terrain mesh, vertex-coloured by height, slope and a little noise.
      const positions = new Float32Array(nx * nz * 3);
      const colors = new Float32Array(nx * nz * 3);
      const indices = [];
      const cSand = new THREE.Color(0xe3cb8c);
      const cWet = new THREE.Color(0xbfb07e);
      const cGrass = new THREE.Color(0x679b52);
      const cGrassDark = new THREE.Color(0x447742);
      const cRock = new THREE.Color(0x85806b);
      const tmpColor = new THREE.Color();
      for (let iz = 0; iz < nz; iz++) {
        const z = this.zMin + iz * dzGrid;
        for (let ix = 0; ix < nx; ix++) {
          const lx = ix * dxGrid;
          const h = heightData[iz * nx + ix];
          const slope = slopeData[iz * nx + ix];
          const idx = iz * nx + ix;
          positions[idx * 3] = lx;
          // Sink sea-level vertices under the opaque ocean so the island mesh has a
          // clean submerged skirt instead of coplanar sandy rectangles.
          positions[idx * 3 + 1] = h < 0.55 ? -4.5 : h;
          positions[idx * 3 + 2] = z;
          const n = this.noise.noise2((lx + start) * 0.095, z * 0.095) * 0.5 + 0.5;
          if (h < 0.9) tmpColor.copy(cWet);
          else if (h < 1.8) tmpColor.copy(cSand);
          else if (h > 33 || slope > 1.35) tmpColor.copy(cRock).lerp(cGrassDark, n * 0.22);
          else {
            tmpColor.copy(cSand).lerp(cGrass, smoothstep(1.4, 5.6, h));
            if (h > 14) tmpColor.lerp(cGrassDark, smoothstep(14, 34, h) * 0.78);
            if (slope > 0.72) tmpColor.lerp(cRock, smoothstep(0.72, 1.25, slope) * 0.58);
            tmpColor.offsetHSL((n - 0.5) * 0.015, (n - 0.5) * 0.06, (n - 0.5) * 0.06);
          }
          colors[idx * 3] = tmpColor.r;
          colors[idx * 3 + 1] = tmpColor.g;
          colors[idx * 3 + 2] = tmpColor.b;
        }
      }
      for (let iz = 0; iz < nz - 1; iz++) {
        for (let ix = 0; ix < nx - 1; ix++) {
          const a = iz * nx + ix;
          const b = a + 1;
          const c = a + nx;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const terrain = new THREE.Mesh(geo, terrainMaterial);
      terrain.castShadow = true;
      terrain.receiveShadow = true;
      group.add(terrain);
      chunk.terrainGeo = geo;

      // Small tree clusters. One instanced mesh per island keeps draw calls low.
      const treeSpots = [];
      const treeCount = 20 + ((rng() * 26) | 0);
      for (let i = 0; i < treeCount; i++) {
        const lx = 10 + rng() * (W - 20);
        const z = this.zMin + 18 + rng() * (this.zMax - this.zMin - 28);
        const h = this.sampleLocal(chunk, lx, z);
        if (h > 3.4 && h < 29) {
          const slope = this.sampleLocalSlope(chunk, lx, z);
          if (slope < 1.2) treeSpots.push({ x: lx, z, h });
        }
      }
      if (treeSpots.length) {
        const inst = new THREE.InstancedMesh(treeGeometry, treeMaterial, treeSpots.length);
        inst.castShadow = false;
        inst.receiveShadow = true;
        const dummy = new THREE.Object3D();
        const tint = new THREE.Color();
        treeSpots.forEach((spot, i) => {
          const s = 0.65 + rng() * 0.7;
          dummy.position.set(spot.x, spot.h + 0.1, spot.z);
          dummy.scale.set(s, s * (0.8 + rng() * 0.4), s);
          dummy.rotation.y = rng() * TAU;
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
          tint.setHSL(0.27 + rng() * 0.05, 0.25 + rng() * 0.15, 0.82 + rng() * 0.2);
          inst.setColorAt(i, tint);
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        chunk.treeMesh = inst;
        group.add(inst);
      }

      // A darker, distant ridge behind the main island gives the coast real depth.
      const bgNZ = 5;
      const bgNX = 17;
      const bgPositions = new Float32Array(bgNX * bgNZ * 3);
      const bgColors = new Float32Array(bgNX * bgNZ * 3);
      const bgIndices = [];
      const bgColor = new THREE.Color(0x3e5b53);
      for (let iz = 0; iz < bgNZ; iz++) {
        for (let ix = 0; ix < bgNX; ix++) {
          const lx = (ix / (bgNX - 1)) * W;
          const z = -265 + iz * 13;
          const ridge = Math.max(0, this.noise.fbm((lx + start * 0.73) * 0.009 + 9.7, iz * 0.3 + 4.2, 4) * 0.5 + 0.5);
          const edge = smoothstep(0, 0.16, ix / (bgNX - 1)) * smoothstep(1, 0.84, ix / (bgNX - 1));
          const y = ridge * (8 + rng() * 8) * edge;
          const id = iz * bgNX + ix;
          bgPositions[id * 3] = lx;
          bgPositions[id * 3 + 1] = y;
          bgPositions[id * 3 + 2] = z;
          bgColors[id * 3] = bgColor.r;
          bgColors[id * 3 + 1] = bgColor.g;
          bgColors[id * 3 + 2] = bgColor.b;
        }
      }
      for (let iz = 0; iz < bgNZ - 1; iz++) {
        for (let ix = 0; ix < bgNX - 1; ix++) {
          const a = iz * bgNX + ix, b = a + 1, c = a + bgNX, d = c + 1;
          bgIndices.push(a, c, b, b, c, d);
        }
      }
      const bgGeo = new THREE.BufferGeometry();
      bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPositions, 3));
      bgGeo.setAttribute('color', new THREE.BufferAttribute(bgColors, 3));
      bgGeo.setIndex(bgIndices);
      bgGeo.computeVertexNormals();
      const bgMesh = new THREE.Mesh(bgGeo, backdropMaterial);
      bgMesh.receiveShadow = false;
      group.add(bgMesh);
      chunk.backdropGeo = bgGeo;

      // Surf rings around the shoreline.
      const shoreGeo = new THREE.RingGeometry(0.88, 1.0, 40);
      shoreGeo.rotateX(-Math.PI / 2);
      const foam = new THREE.Mesh(shoreGeo, shoreFoamMaterial);
      foam.position.set(localCX, 0.34, cz);
      foam.scale.set(rx * 1.08, 1, rz * 1.14);
      foam.renderOrder = 1;
      group.add(foam);
      chunk.shoreGeo = shoreGeo;
      chunk.foam = foam;

      // Deterministic target layout sampled from flat-ish terrain.
      const pickSpot = (xMin, xMax, zMin, zMax, maxSlope = 1.35) => {
        let best = null;
        for (let attempt = 0; attempt < 32; attempt++) {
          const lx = xMin + rng() * (xMax - xMin);
          const z = zMin + rng() * (zMax - zMin);
          const h = this.sampleLocal(chunk, lx, z);
          if (h < 2.2 || h > 35) continue;
          const slope = this.sampleLocalSlope(chunk, lx, z);
          if (slope > maxSlope) continue;
          const candidate = { x: start + lx, z, y: h, score: slope + Math.abs(h - 10) * 0.002 };
          if (!best || candidate.score < best.score) best = candidate;
        }
        if (!best) {
          const lx = (xMin + xMax) * 0.5;
          const z = (zMin + zMax) * 0.5;
          best = { x: start + lx, z, y: Math.max(1.2, this.sampleLocal(chunk, lx, z)) };
        }
        return best;
      };

      const cxMin = Math.max(40, localCX - 90);
      const cxMax = Math.min(W - 40, localCX + 90);
      let targetIdx = 0;
      const bunker = pickSpot(cxMin + 20, cxMax - 15, -24, 14, 1.5);
      chunk.targets.push({ id: `t${index}-b${targetIdx++}`, type: 'bunker', ...bunker });
      const barracks = pickSpot(cxMin + 4, cxMax - 20, -20, 17, 1.3);
      chunk.targets.push({ id: `t${index}-r${targetIdx++}`, type: 'barracks', ...barracks });
      const aaCount = 1 + (rng() < 0.44 ? 1 : 0);
      for (let i = 0; i < aaCount; i++) {
        const spot = pickSpot(cxMin, cxMax, -30, 18, 1.15);
        chunk.targets.push({ id: `t${index}-a${targetIdx++}`, type: 'aa', ...spot });
      }
      if (rng() < 0.72) {
        const spot = pickSpot(cxMin + 8, cxMax - 8, -24, 16, 0.75);
        chunk.targets.push({ id: `t${index}-k${targetIdx++}`, type: 'tank', ...spot });
      }
      const grunts = 3 + ((rng() * 3) | 0);
      for (let i = 0; i < grunts; i++) {
        const x = clamp(barracks.x + (rng() - 0.5) * 52, start + 20, start + W - 20);
        const z = clamp(barracks.z + (rng() - 0.5) * 26, -32, 22);
        const h = this.sampleLocal(chunk, x - start, z);
        chunk.targets.push({ id: `t${index}-i${targetIdx++}`, type: 'infantry', x, z, y: h });
      }
    }

    this.chunks.set(index, chunk);
    scene.add(group);
    if (this.onLoad) this.onLoad(chunk);
    return chunk;
  }

  sampleLocal(chunk, localX, z) {
    if (!chunk || !chunk.heightData) return 0;
    const nx = this.nx, nz = this.nz;
    const gx = clamp(localX / chunk.dxGrid, 0, nx - 1);
    const gz = clamp((z - this.zMin) / chunk.dzGrid, 0, nz - 1);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const ix2 = Math.min(nx - 1, ix + 1), iz2 = Math.min(nz - 1, iz + 1);
    const fx = gx - ix, fz = gz - iz;
    const h00 = chunk.heightData[iz * nx + ix];
    const h10 = chunk.heightData[iz * nx + ix2];
    const h01 = chunk.heightData[iz2 * nx + ix];
    const h11 = chunk.heightData[iz2 * nx + ix2];
    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }

  sampleLocalSlope(chunk, localX, z) {
    const d = 3.5;
    const hL = this.sampleLocal(chunk, localX - d, z);
    const hR = this.sampleLocal(chunk, localX + d, z);
    const hD = this.sampleLocal(chunk, localX, z - d);
    const hU = this.sampleLocal(chunk, localX, z + d);
    return Math.hypot((hR - hL) / (d * 2), (hU - hD) / (d * 2));
  }

  sampleWorld(x, z) {
    const index = Math.floor(x / CONFIG.chunkWidth);
    const chunk = this.chunks.get(index);
    if (!chunk || !chunk.heightData) return 0;
    return this.sampleLocal(chunk, x - chunk.start, z);
  }

  // Returns the topmost solid ground at a world point (0 for open water).
  heightAt(x, z) {
    return this.sampleWorld(x, z);
  }

  update(dt, playerX, facing) {
    this.ensureAround(playerX, facing);
    for (const [, chunk] of this.chunks) {
      if (chunk.foam) {
        const pulse = 1 + Math.sin(performance.now() * 0.0012 + chunk.index) * 0.009;
        chunk.foam.scale.x = (chunk.island?.rx ?? 1) * 1.08 * pulse;
      }
    }
  }
}

const world = new IslandWorld();

export { IslandWorld, world };
