import * as THREE from 'three';
import { CONFIG } from './config.js';
import { TAU, clamp, damp, rand, _v2 } from './core/utils.js';
import { scene } from './render/scene.js';
import { particles } from './effects/particles.js';
import { tracers } from './effects/tracers.js';
import { world } from './world/IslandWorld.js';
import {
  addPart, mergeParts, playerMaterial, enemyMaterial, propsMaterial, darkMaterial,
} from './models/parts.js';
import { createFighterModel, enemyPalette, acePalette } from './models/aircraft.js';
import {
  unitMaterial, soldierGeometry,
  createAAGun, createBunker, createBarracks, createTank,
} from './models/units.js';

function createEnemyFighterMesh(ace = false) {
  const fighter = createFighterModel(ace ? acePalette : enemyPalette, false);
  fighter.userData.bank = fighter.userData.bank;
  fighter.scale.setScalar(ace ? 1.3 : 1.12);
  return fighter;
}

// ---------------------------------------------------------------------------------------------
//  Combat simulation: targets, projectiles, enemy aircraft, damage and persistence.
// ---------------------------------------------------------------------------------------------
const UNIT_STATS = {
  bunker: { health: 170, radius: 6.2, score: 700, name: 'BUNKER', elevation: 2.4 },
  barracks: { health: 125, radius: 7.0, score: 450, name: 'BARRACKS', elevation: 2.2 },
  aa: { health: 85, radius: 4.0, score: 350, name: 'FLAK BATTERY', elevation: 2.0 },
  tank: { health: 115, radius: 4.2, score: 500, name: 'TANK', elevation: 1.8 },
  infantry: { health: 14, radius: 1.4, score: 50, name: 'INFANTRY', elevation: 1.2 },
};

class CombatSystem {
  constructor() {
    this.game = null;
    this.units = [];
    this.unitsByChunk = new Map();
    this.bullets = [];
    this.bombs = [];
    this.rockets = [];
    this.fighters = [];
    this.states = new Map();
    this.time = 0;
    this.banditTimer = 16;
    this.banditWave = 0;
    this.rocketGeometry = new THREE.CylinderGeometry(0.18, 0.24, 1.8, 6, 1);
    this.rocketGeometry.rotateZ(-Math.PI / 2);
    this.rocketMaterial = new THREE.MeshStandardMaterial({ color: 0x5d5645, roughness: 0.7, metalness: 0.2, flatShading: true });
    this.bombGeometry = new THREE.SphereGeometry(0.45, 7, 5);
    this.bombGeometry.scale(1, 1, 1);
    this.bombMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4036, roughness: 0.8, metalness: 0.25, flatShading: true });
    this.finGeometry = new THREE.BoxGeometry(0.72, 0.45, 0.06);
    this.finMaterial = new THREE.MeshStandardMaterial({ color: 0x2e332c, roughness: 0.8, flatShading: true });
  }

  setGame(game) {
    this.game = game;
    this.banditTimer = 21;
  }

  spawnChunk(chunk) {
    if (!chunk || !chunk.targets?.length) return;
    const arr = [];
    for (const desc of chunk.targets) {
      const saved = this.states.get(desc.id);
      if (saved?.destroyed) continue;
      const unit = this.spawnUnit(desc, chunk);
      if (!unit) continue;
      arr.push(unit);
      this.units.push(unit);
    }
    this.unitsByChunk.set(chunk.index, arr);
  }

  spawnUnit(desc, chunk) {
    const stats = UNIT_STATS[desc.type];
    if (!stats) return null;
    let model;
    if (desc.type === 'aa') model = createAAGun();
    else if (desc.type === 'bunker') model = createBunker();
    else if (desc.type === 'barracks') model = createBarracks();
    else if (desc.type === 'tank') model = createTank();
    else if (desc.type === 'infantry') {
      const mesh = new THREE.Mesh(soldierGeometry, unitMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.add(mesh);
      model = { group, sharedGeometry: true };
    } else return null;

    const group = model.group;
    group.position.set(desc.x, desc.y + 0.04, desc.z);
    group.rotation.y = desc.type === 'infantry' ? Math.PI : 0;
    scene.add(group);

    const saved = this.states.get(desc.id);
    const health = saved ? clamp(saved.health, 1, stats.health) : stats.health;
    const unit = {
      id: desc.id,
      type: desc.type,
      chunkIndex: chunk.index,
      group,
      pivot: model.pivot || null,
      muzzle: model.muzzle || null,
      sharedGeometry: !!model.sharedGeometry,
      x: desc.x,
      y: desc.y,
      z: desc.z,
      groundY: desc.y,
      baseX: desc.x,
      baseZ: desc.z,
      health,
      maxHealth: stats.health,
      radius: stats.radius,
      score: stats.score,
      elevated: stats.elevation,
      alive: true,
      fireTimer: rand(1.2, 3.8),
      aimAngle: 0,
      patrolDir: Math.random() < 0.5 ? -1 : 1,
      patrolPhase: rand(0, TAU),
      walkPhase: rand(0, TAU),
      smokeTimer: rand(0.2, 0.9),
    };
    this.states.set(unit.id, { health, destroyed: false });
    return unit;
  }

  unloadChunk(chunk) {
    const arr = this.unitsByChunk.get(chunk.index);
    if (!arr) return;
    for (const unit of arr) {
      if (unit.alive) {
        this.states.set(unit.id, { health: unit.health, destroyed: false });
        this.removeUnit(unit, true);
      }
    }
    this.unitsByChunk.delete(chunk.index);
  }

  removeUnit(unit, dispose = true) {
    if (!unit.group) return;
    scene.remove(unit.group);
    if (dispose && !unit.sharedGeometry) {
      unit.group.traverse(o => { if (o.isMesh && o.geometry && o.geometry !== soldierGeometry) o.geometry.dispose(); });
    }
    const idx = this.units.indexOf(unit);
    if (idx >= 0) this.units.splice(idx, 1);
    unit.group = null;
    unit.alive = false;
  }

  killUnit(unit, source = 'bomb') {
    if (!unit.alive) return;
    const p = new THREE.Vector3(unit.x, unit.y + unit.elevated, unit.z);
    if (unit.type === 'infantry') {
      particles.dust(p, 1.1, 5);
      particles.fire(p.x, p.y, p.z, 3, { size: 1.2, life: 0.25 });
      // The greatest scream in cinema history, for the greatest anti-infantry run in the Pacific.
      this.game.audio.scream(clamp((unit.x - this.game.player.x) / 260, -1, 1), 1);
    } else if (unit.type === 'tank') {
      particles.explosion(p, 1.2);
      this.game.audio.explosion(1.0, clamp((unit.x - this.game.player.x) / 260, -1, 1));
    } else {
      particles.explosion(p, unit.type === 'bunker' ? 2.0 : 1.55);
      this.game.audio.explosion(unit.type === 'bunker' ? 1.35 : 1.05, clamp((unit.x - this.game.player.x) / 260, -1, 1));
    }
    this.states.set(unit.id, { health: 0, destroyed: true });
    unit.alive = false;
    this.game.onEnemyDestroyed(unit);
    const idx = this.units.indexOf(unit);
    if (idx >= 0) this.units.splice(idx, 1);
    scene.remove(unit.group);
    if (!unit.sharedGeometry) {
      unit.group.traverse(o => { if (o.isMesh && o.geometry && o.geometry !== soldierGeometry) o.geometry.dispose(); });
    }
    unit.group = null;
  }

  damageUnit(unit, amount, source = 'mg', hitPos = null) {
    if (!unit || !unit.alive) return;
    unit.health -= amount;
    this.states.set(unit.id, { health: Math.max(0, unit.health), destroyed: false });
    if (hitPos) particles.sparks(hitPos.x, hitPos.y, hitPos.z, 4, 9, 0xffc878);
    if (unit.health <= 0) {
      this.killUnit(unit, source);
    } else if (amount > 20) {
      particles.smoke(unit.x, unit.y + unit.elevated, unit.z, 3, { color: 0x3d403c, size: 2.2, life: 1.2, alpha: 0.35, vy: 2 });
    }
  }

  updateUnits(dt) {
    const player = this.game.player;
    const canFight = this.game.mode === 'flying';
    this.time += dt;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (!u.alive) continue;

      if (u.type === 'tank') {
        const range = 34;
        u.x += u.patrolDir * dt * 3.2;
        if (u.x > u.baseX + range) { u.x = u.baseX + range; u.patrolDir = -1; }
        else if (u.x < u.baseX - range) { u.x = u.baseX - range; u.patrolDir = 1; }
        const h = world.heightAt(u.x, u.z);
        if (Math.abs(h - u.groundY) < 4.5) {
          u.groundY = damp(u.groundY, h, 5, dt);
        } else {
          u.x -= u.patrolDir * dt * 3.2;
          u.patrolDir *= -1;
        }
        u.y = u.groundY;
        u.group.position.x = u.x;
        u.group.position.y = u.y + 0.04;
        const ahead = world.heightAt(u.x + u.patrolDir * 4, u.z);
        const behind = world.heightAt(u.x - u.patrolDir * 4, u.z);
        u.group.rotation.z = damp(u.group.rotation.z, clamp(Math.atan2(ahead - behind, 8), -0.28, 0.28), 4, dt);
      } else if (u.type === 'infantry') {
        u.walkPhase += dt * (0.8 + (u.baseX % 5) * 0.02);
        u.x = u.baseX + Math.sin(u.walkPhase * 0.6 + u.patrolPhase) * 5.2;
        u.y = world.heightAt(u.x, u.z);
        u.group.position.x = u.x;
        u.group.position.y = u.y + Math.abs(Math.sin(u.walkPhase * 2.3)) * 0.09 + 0.02;
        u.group.rotation.y = player.x > u.x ? Math.PI : 0;
      }

      // Rotate AA/tank barrels toward the player.
      if ((u.type === 'aa' || u.type === 'tank') && u.pivot) {
        const dx = player.x - u.x;
        const dy = (player.y + 1.5) - (u.y + u.elevated + (u.type === 'aa' ? 1.6 : 0.8));
        const angle = Math.atan2(dy, dx);
        u.aimAngle = angle;
        u.pivot.rotation.z = damp(u.pivot.rotation.z, angle, 5, dt);
      }

      if (canFight) {
        u.fireTimer -= dt;
        const dist = Math.abs(player.x - u.x);
        if (u.fireTimer <= 0) {
          let canHit = false;
          if (u.type === 'aa') canHit = dist < 380 && player.y < 190;
          else if (u.type === 'tank') canHit = dist < 330;
          else if (u.type === 'bunker') canHit = dist < 240 && player.y < 130;
          else if (u.type === 'infantry') canHit = dist < 175 && player.y < 70;
          if (canHit) {
            this.fireEnemyAtPlayer(u);
            u.fireTimer = u.type === 'aa' ? rand(1.7, 3.4) : u.type === 'tank' ? rand(3.1, 5.2) : u.type === 'bunker' ? rand(1.4, 2.6) : rand(2.6, 4.8);
          } else {
            u.fireTimer = rand(0.35, 0.8);
          }
        }
        if (player.health < 45) {
          u.smokeTimer -= dt;
          if (u.smokeTimer <= 0 && Math.random() < 0.08) {
            particles.smoke(u.x, u.y + u.elevated + 1, u.z, 1, { color: 0x454a44, size: 2.4, life: 2.4, alpha: 0.25, growth: 4, vy: 2 });
            u.smokeTimer = rand(0.7, 1.5);
          }
        }
      }
    }
  }

  update(dt) {
    if (!this.game) return;
    this.time += dt;
    this.updateUnits(dt);
    if (this.updateProjectiles) this.updateProjectiles(dt);
    if (this.updateFighters) this.updateFighters(dt);
    if (this.updateBombs) this.updateBombs(dt);
    if (this.updateRockets) this.updateRockets(dt);
    if (this.game.mode === 'flying') {
      this.banditTimer -= dt;
      const maxBandits = this.game.score > 12000 ? 3 : 2;
      if (this.banditTimer <= 0 && this.fighters.length < maxBandits) {
        this.spawnEnemyFighter();
        this.banditTimer = rand(18, 29);
      }
    }
  }

  clearAll() {
    for (const u of [...this.units]) this.removeUnit(u, true);
    this.units.length = 0;
    this.unitsByChunk.clear();
    this.states.clear();
    for (const b of this.bullets) { /* pooled data only */ }
    this.bullets.length = 0;
    for (const b of this.bombs) if (b.mesh) scene.remove(b.mesh);
    this.bombs.length = 0;
    for (const r of this.rockets) if (r.mesh) scene.remove(r.mesh);
    this.rockets.length = 0;
    for (const f of [...this.fighters]) this.removeFighter(f);
    this.fighters.length = 0;
    this.banditTimer = 21;
    this.banditWave = 0;
    tracers.update([]);
  }
}

const combat = new CombatSystem();

// --- combat method extensions (kept outside the class for readable, focused sections) ----------
CombatSystem.prototype.getUnitMuzzle = function (unit) {
  if (unit.pivot && unit.muzzle) {
    unit.pivot.updateWorldMatrix(true, false);
    return _v2.copy(unit.muzzle).applyMatrix4(unit.pivot.matrixWorld);
  }
  if (unit.type === 'bunker') {
    return _v2.set(unit.x + (this.game.player.x > unit.x ? 3 : -3), unit.y + 2.2, unit.z + 2.0);
  }
  if (unit.type === 'infantry') {
    return _v2.set(unit.x + (this.game.player.x > unit.x ? 0.45 : -0.45), unit.y + 1.22, unit.z + 0.18);
  }
  return _v2.set(unit.x, unit.y + unit.elevated, unit.z);
};

CombatSystem.prototype.fireEnemyAtPlayer = function (unit) {
  if (!this.game.player || this.game.player.invulnerable > 0) return;
  const player = this.game.player;
  const muzzle = this.getUnitMuzzle(unit).clone();
  const speed = unit.type === 'aa' ? 220 : unit.type === 'tank' ? 180 : unit.type === 'bunker' ? 240 : 185;
  const lead = Math.hypot(player.x - muzzle.x, player.y - muzzle.y) / speed;
  const tx = player.x + (player.vx || 0) * lead * 0.52;
  const ty = player.y + 1.2 + (player.vy || 0) * lead * 0.28;
  const baseAngle = Math.atan2(ty - muzzle.y, tx - muzzle.x);
  const spread = unit.type === 'aa' ? 0.055 : unit.type === 'tank' ? 0.045 : unit.type === 'bunker' ? 0.078 : 0.11;
  const angle = baseAngle + rand(-spread, spread);
  const z = clamp(muzzle.z, -8, 8);
  this.bullets.push({
    x: muzzle.x, y: muzzle.y, z,
    prevX: muzzle.x, prevY: muzzle.y, prevZ: z,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    vz: 0,
    life: unit.type === 'infantry' ? 1.5 : 2.8,
    owner: 'enemy',
    damage: unit.type === 'aa' ? 7 : unit.type === 'tank' ? 13 : unit.type === 'bunker' ? 4.5 : 3,
    color: unit.type === 'aa' ? 0xff9b55 : unit.type === 'tank' ? 0xff6f45 : 0xffc26a,
    radius: 0.16,
    age: 0,
  });
  const pan = clamp((unit.x - player.x) / 280, -1, 1);
  this.game.audio.enemyShot(unit.type === 'aa' ? 0.08 : 0.035, pan);
  if (unit.type === 'aa') this.game.audio.whine(pan);
  particles.fire(muzzle.x, muzzle.y, muzzle.z, unit.type === 'aa' ? 4 : 2, {
    size: unit.type === 'aa' ? 1.6 : 0.9, life: 0.16, vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4,
  });
  if (unit.type === 'aa' && Math.random() < 0.35) {
    // A distant flak blossom adds danger to the airspace without changing hit geometry.
    const flakX = player.x + rand(-35, 35);
    const flakY = player.y + rand(4, 35);
    particles.smoke(flakX, flakY, rand(-18, 18), 5, { color: 0x323737, size: 2.5, spread: 1.8, speed: 2.4, growth: 6, life: 1.8, alpha: 0.4 });
    particles.fire(flakX, flakY, 0, 2, { size: 1.3, life: 0.18 });
  }
};

CombatSystem.prototype.firePlayerGuns = function () {
  const player = this.game.player;
  if (player.ammo <= 0) return;
  const alternating = player.gunSide = -(player.gunSide || 1);
  // During a bank the nose projects a shorter horizontal vector. Keep a small
  // minimum so rounds still leave the aircraft when it is nearly edge-on.
  const projected = player.facingX ?? player.dir;
  const sign = Math.sign(projected) || player.dir;
  const facing = Math.abs(projected) >= 0.18 ? projected : sign * 0.18;
  const muzzleX = player.x + facing * 5.25;
  const muzzleY = player.y - 0.06 + alternating * 0.15;
  const muzzleZ = player.z + alternating * 1.3;
  const speed = 360;
  this.bullets.push({
    x: muzzleX, y: muzzleY, z: muzzleZ,
    prevX: muzzleX, prevY: muzzleY, prevZ: muzzleZ,
    vx: player.vx * 0.22 + facing * Math.cos(player.pitch) * speed,
    vy: player.vy * 0.2 + Math.sin(player.pitch) * speed,
    vz: 0,
    life: 0.95,
    owner: 'player',
    damage: 15,
    color: alternating > 0 ? 0xffe0a0 : 0xffcf74,
    radius: 0.1,
    age: 0,
  });
  particles.fire(muzzleX, muzzleY, muzzleZ, 2, { size: 2.1, life: 0.1, vx: facing * 14, vy: 0.6, alpha: 0.85 });
  this.game.audio.mg();
  this.game.shake(0.1);
};

CombatSystem.prototype.spawnBomb = function () {
  const player = this.game.player;
  if (player.bombs <= 0) return false;
  if (!this.bombPrototype) {
    const parts = [];
    addPart(parts, new THREE.SphereGeometry(0.36, 8, 6), 0x353a33, [0, 0, 0], [0, 0, 0], [2.7, 1, 1]);
    addPart(parts, new THREE.BoxGeometry(0.06, 0.65, 0.42), 0x262b26, [-0.86, 0, 0]);
    addPart(parts, new THREE.BoxGeometry(0.06, 0.42, 0.65), 0x262b26, [-0.86, 0, 0]);
    addPart(parts, new THREE.CylinderGeometry(0.08, 0.12, 0.4, 5), 0x5d5142, [1.08, 0, 0], [0, 0, Math.PI / 2]);
    this.bombPrototype = mergeParts(parts);
  }
  const mesh = new THREE.Mesh(this.bombPrototype, unitMaterial);
  mesh.castShadow = true;
  const facing = player.facingX ?? player.dir;
  mesh.position.set(player.x + facing * 0.8, player.y - 1.8, player.z);
  mesh.rotation.z = Math.atan2(player.vy, player.vx || 0.01);
  scene.add(mesh);
  this.bombs.push({
    mesh,
    x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
    vx: player.vx * 0.78,
    vy: player.vy * 0.35 - 1.5,
    life: 14,
    spin: rand(-2.6, 2.6),
    source: 'player',
  });
  this.game.audio.thud();
  this.game.shake(0.15);
  return true;
};

CombatSystem.prototype.spawnRocket = function () {
  const player = this.game.player;
  if (player.rockets <= 0) return false;
  const mesh = new THREE.Mesh(this.rocketGeometry, this.rocketMaterial);
  mesh.castShadow = true;
  const zSide = Math.random() < 0.5 ? -1.7 : 1.7;
  const projected = player.facingX ?? player.dir;
  const facing = Math.abs(projected) >= 0.18 ? projected : (Math.sign(projected) || player.dir) * 0.18;
  const dir = Math.sign(facing) || player.dir;
  mesh.position.set(player.x + facing * 4.7, player.y - 0.55, player.z + zSide);
  scene.add(mesh);
  this.rockets.push({
    mesh,
    x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
    vx: player.vx * 0.25 + facing * Math.cos(player.pitch) * 175,
    vy: player.vy * 0.2 + Math.sin(player.pitch) * 175 + 1.6,
    life: 3.4,
    trail: 0,
    dir,
  });
  this.game.audio.noiseBurst(0.35, 0.18, 'highpass', 900, undefined, clamp((player.x) / 400, -1, 1));
  this.game.shake(0.18);
  return true;
};

CombatSystem.prototype.segmentDistance2D = function (x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 0.0001) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
};

CombatSystem.prototype.burstAt = function (x, y, z, water = false, scale = 0.35) {
  if (water) {
    particles.fire(x, 0.35, z, 2, { size: 0.5, life: 0.2, vy: 2 });
    particles.smoke(x, 0.5, z, 2, { color: 0xcad4ca, size: 1.1, life: 0.9, vy: 2.4, alpha: 0.22, growth: 2 });
  } else {
    particles.dust({ x, y, z }, scale, 3);
    particles.sparks(x, y + 0.2, z, 3, 7, 0xffbe6c);
  }
};

CombatSystem.prototype.updateProjectiles = function (dt) {
  const player = this.game.player;
  const flying = this.game.mode === 'flying';
  for (let i = this.bullets.length - 1; i >= 0; i--) {
    const b = this.bullets[i];
    if (!b) continue;
    b.prevX = b.x; b.prevY = b.y; b.prevZ = b.z;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.vy -= 1.6 * dt;
    b.life -= dt;
    b.age += dt;
    let dead = b.life <= 0;

    if (!dead && b.owner === 'player') {
      for (let u = 0; u < this.units.length; u++) {
        const unit = this.units[u];
        if (!unit.alive) continue;
        const d = this.segmentDistance2D(b.prevX, b.prevY, b.x, b.y, unit.x, unit.y + unit.elevated);
        if (d < unit.radius + 0.55) {
          this.damageUnit(unit, b.damage, 'mg', new THREE.Vector3(b.x, b.y, b.z));
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (let f = 0; f < this.fighters.length; f++) {
          const fighter = this.fighters[f];
          if (!fighter.alive) continue;
          const d = this.segmentDistance2D(b.prevX, b.prevY, b.x, b.y, fighter.x, fighter.y);
          if (d < 3.2 && Math.abs(b.z - fighter.z) < 5) {
            this.damageFighter(fighter, b.damage);
            dead = true;
            particles.sparks(b.x, b.y, b.z, 5, 10);
            break;
          }
        }
      }
      if (!dead) {
        const g = world.heightAt(b.x, b.z);
        if (b.y <= g + 0.35 || b.y <= 0.15) {
          this.burstAt(b.x, Math.max(g, 0), b.z, g < 0.15);
          dead = true;
        }
      }
    } else if (!dead && b.owner === 'enemy') {
      if (flying) {
        const d = Math.hypot(b.x - (player.x), b.y - (player.y + 1.0));
        if (d < 5.1 && player.invulnerable <= 0) {
          this.game.damagePlayer(b.damage, 'bullet');
          particles.sparks(b.x, b.y, b.z, 6, 12, 0xffd090);
          dead = true;
        }
      }
      if (!dead) {
        const g = world.heightAt(b.x, b.z);
        if (b.y <= g + 0.2 || b.y <= 0.1) {
          this.burstAt(b.x, Math.max(g, 0), b.z, g < 0.12, 0.3);
          dead = true;
        }
      }
    }
    if (dead) this.bullets.splice(i, 1);
  }
  if (this.bullets.length > 260) this.bullets.splice(0, this.bullets.length - 260);
  tracers.update(this.bullets);
};

CombatSystem.prototype.explodeAt = function (x, y, z, radius, damage, water = false, scale = 1, source = 'bomb') {
  const p = new THREE.Vector3(x, y, z);
  particles.explosion(p, scale, water);
  this.game.audio.explosion(scale, clamp((x - this.game.player.x) / 300, -1, 1));
  this.game.shake(water ? 0.4 : 0.7 * scale);
  if (!water) {
    for (const unit of [...this.units]) {
      if (!unit.alive) continue;
      // Depth is compressed because the combat lane is deliberately 2.5D.
      const dz = (unit.z - z) * 0.35;
      const d = Math.hypot(unit.x - x, unit.y + unit.elevated - y, dz);
      if (d < radius) {
        const falloff = 1 - (d / radius) * 0.5;
        this.damageUnit(unit, damage * falloff, source, new THREE.Vector3(unit.x, unit.y + unit.elevated, unit.z));
      }
    }
    for (const f of [...this.fighters]) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - x, f.y - y, f.z - z);
      if (d < radius * 0.75) this.damageFighter(f, damage * 1.4);
    }
  }
  // A little scorch-like debris survives the blast.
  if (!water) particles.smoke(x, y + 0.8, z, 4, { color: 0x242a28, size: 3.2, spread: 4, speed: 2.5, growth: 8, life: 2.8, alpha: 0.32 });
};

CombatSystem.prototype.updateBombs = function (dt) {
  for (let i = this.bombs.length - 1; i >= 0; i--) {
    const b = this.bombs[i];
    b.life -= dt;
    const prevY = b.y;
    b.vy -= CONFIG.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += 0; // Bombs track the 2.5D combat lane.
    b.mesh.position.set(b.x, b.y, b.z);
    b.mesh.rotation.z = Math.atan2(b.vy, b.vx || 0.01);
    const ground = world.heightAt(b.x, b.z);
    const water = ground <= 0.05;
    let hit = b.y <= Math.max(ground, 0.28) + 0.3;
    // Direct hits on grounded positions feel more responsive than waiting for the ground.
    if (!hit) {
      for (const u of this.units) {
        if (!u.alive) continue;
        if (Math.abs(u.x - b.x) < 4.2 && Math.abs((u.y + u.elevated) - b.y) < 5.5) { hit = true; break; }
      }
    }
    if (hit || b.life <= 0) {
      const impactY = Math.max(ground, 0.5);
      this.explodeAt(b.x, impactY, b.z, 38, 235, water, water ? 1.1 : 1.75, 'bomb');
      scene.remove(b.mesh);
      this.bombs.splice(i, 1);
    }
  }
};

CombatSystem.prototype.updateRockets = function (dt) {
  for (let i = this.rockets.length - 1; i >= 0; i--) {
    const r = this.rockets[i];
    r.life -= dt;
    // Sustained rocket motor with a subtle gravity drop.
    r.vx = damp(r.vx, r.dir * 330, 2.8, dt);
    r.vy -= 4.2 * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.trail -= dt;
    const g = world.heightAt(r.x, r.z);
    const water = g <= 0.05;
    let hit = r.y <= Math.max(g, 0.25);
    if (!hit) {
      for (const u of this.units) {
        if (!u.alive) continue;
        const d = this.segmentDistance2D(r.x - r.vx * dt, r.y - r.vy * dt, r.x, r.y, u.x, u.y + u.elevated);
        if (d < u.radius + 1.0) { hit = true; break; }
      }
    }
    if (!hit) {
      for (const f of this.fighters) {
        if (!f.alive) continue;
        if (Math.hypot(f.x - r.x, f.y - r.y, f.z - r.z) < 5) { hit = true; break; }
      }
    }
    if (r.mesh) {
      r.mesh.position.set(r.x, r.y, r.z);
      r.mesh.rotation.z = Math.atan2(r.vy, r.vx);
    }
    if (r.trail <= 0) {
      particles.smoke(r.x - r.dir * 1.2, r.y, r.z, 1, { color: 0xa5aaa3, size: 1.0, spread: 0.3, speed: 0.7, life: 1.4, growth: 3.2, alpha: 0.32, vy: 0.5 });
      particles.fire(r.x - r.dir * 1.3, r.y, r.z, 1, { size: 0.48, life: 0.12, vx: -r.dir * 4, vy: -0.4 });
      r.trail = 0.035;
    }
    if (hit || r.life <= 0) {
      this.explodeAt(r.x, Math.max(g, 0.4), r.z, 21, 135, water, 1.15, 'rocket');
      scene.remove(r.mesh);
      this.rockets.splice(i, 1);
    }
  }
};

CombatSystem.prototype.spawnEnemyFighter = function (options = {}) {
  const player = this.game.player;
  const ace = !!options.ace;
  const wingman = !!options.wingman;
  const root = createEnemyFighterMesh(ace);
  const facing = Math.sign(player.facingX ?? player.dir) || player.dir;
  const spawnSide = options.behind ? -facing : facing;
  const dir = -spawnSide;
  const distance = options.distance ?? (wingman ? 520 : 540);
  const offsetX = options.offsetX ?? rand(-60, 60);
  const offsetY = options.offsetY ?? rand(15, 55);
  root.position.set(
    player.x + spawnSide * distance + offsetX,
    clamp(player.y + offsetY, 32, 190),
    rand(-5, 5)
  );
  scene.add(root);
  const speed = ace ? rand(108, 128) : rand(82, 108);
  const f = {
    id: `fighter-${performance.now()}-${Math.random()}`,
    type: 'fighter',
    name: ace ? 'ACE' : 'FIGHTER',
    ace,
    group: root,
    x: root.position.x,
    y: root.position.y,
    z: root.position.z,
    vx: dir * speed,
    vy: 0,
    dir,
    speed,
    health: ace ? 140 : 55,
    maxHealth: ace ? 140 : 55,
    fireTimer: ace ? rand(0.7, 1.4) : rand(1.2, 2.3),
    age: 0,
    alive: true,
    phase: rand(0, TAU),
    baseY: root.position.y,
    score: ace ? 2600 : 900,
    elevation: 2,
    radius: ace ? 4 : 3,
    state: 'approach',
    stateTimer: 0,
    evadeDir: 1,
    skill: ace ? 1 : 0.55,
    visualYaw: dir > 0 ? 0 : Math.PI,
  };
  f.group.rotation.y = f.visualYaw;
  this.fighters.push(f);
  this.banditWave++;

  if (ace) {
    this.game.notify('ACE INBOUND', 'Enemy ace · high threat', 3.0, 'red');
    this.game.audio.warning();
  } else if (!wingman && this.banditWave === 1) {
    this.game.notify('BANDITS', 'Enemy fighter · twelve o’clock', 2.4, 'red');
    this.game.audio.warning();
  }

  // High-scoring players occasionally get a two-ship formation.
  if (!ace && !wingman && this.game.score > 3500 && Math.random() < 0.45) {
    const maxBandits = this.game.score > 12000 ? 3 : 2;
    if (this.fighters.length < maxBandits) {
      this.spawnEnemyFighter({
        wingman: true,
        distance: distance + rand(-30, 40),
        offsetX: rand(-90, 90),
        offsetY: rand(18, 42),
      });
    }
  }
  return f;
};

CombatSystem.prototype.updateFighters = function (dt) {
  const player = this.game.player;
  const flying = this.game.mode === 'flying';
  for (let i = this.fighters.length - 1; i >= 0; i--) {
    const f = this.fighters[i];
    if (!f) continue;
    if (!f.alive) { this.fighters.splice(i, 1); continue; }
    f.age += dt;
    const dx = player.x - f.x;
    const dy = player.y - f.y;
    const absDx = Math.abs(dx);

    // --- simple pursuit / overshoot / re-attack state machine --------------------------------
    if (f.state === 'approach') {
      f.dir = Math.sign(dx) || f.dir;
      const desiredVx = f.dir * f.speed * (f.ace ? 1.08 : 1);
      const desiredVy = clamp(dy * 0.75, -34, 34)
        + Math.sin(f.age * 1.1 + f.phase) * (f.ace ? 6 : 10);
      f.vx = damp(f.vx, desiredVx, 1.6, dt);
      f.vy = damp(f.vy, desiredVy, 1.8, dt);
      if (absDx < 95 && Math.abs(dy) < 48) {
        f.state = 'overshoot';
        f.stateTimer = f.ace ? 0.8 : 1.0;
      }
    } else if (f.state === 'overshoot') {
      f.vx = damp(f.vx, f.dir * f.speed * 1.05, 1.5, dt);
      f.vy = damp(f.vy, f.ace ? 32 : 24, 1.8, dt);
      f.stateTimer -= dt;
      if (f.stateTimer <= 0) {
        f.state = 'reposition';
        f.stateTimer = f.ace ? 1.0 : 1.4;
        f.dir = -f.dir;
      }
    } else if (f.state === 'reposition') {
      f.vx = damp(f.vx, f.dir * f.speed * 0.95, 1.4, dt);
      f.vy = damp(f.vy, clamp((player.y + 45 - f.y) * 0.7, -22, 32), 1.6, dt);
      f.stateTimer -= dt;
      if (f.stateTimer <= 0) f.state = 'approach';
    } else if (f.state === 'evade') {
      f.vx = damp(f.vx, f.dir * f.speed * 1.08, 1.5, dt);
      f.vy = damp(f.vy, f.evadeDir * (f.ace ? 40 : 30), 2.2, dt);
      f.stateTimer -= dt;
      if (f.stateTimer <= 0) f.state = 'approach';
    }

    if (f.state !== 'evade' && f.health < f.maxHealth * 0.55 && Math.random() < dt * (f.ace ? 1.1 : 0.6)) {
      f.state = 'evade';
      f.stateTimer = rand(0.8, 1.6);
      f.evadeDir = Math.random() < 0.5 ? -1 : 1;
    }

    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.y = clamp(f.y, 8, 210);
    f.z = damp(f.z, 0, 0.7, dt);
    f.group.position.set(f.x, f.y, f.z);

    const u = f.group.userData;
    const faceYaw = f.vx >= 0 ? 0 : Math.PI;
    f.visualYaw = damp(f.visualYaw, faceYaw, 4.5, dt);
    f.group.rotation.y = f.visualYaw;
    if (u.bank) u.bank.rotation.x = damp(u.bank.rotation.x, clamp(-f.vy * 0.018, -0.6, 0.6), 3, dt);
    if (u.pitch) u.pitch.rotation.z = damp(u.pitch.rotation.z, clamp(f.vy * 0.011, -0.3, 0.3), 3, dt);
    if (u.prop) u.prop.rotation.x += dt * 38;
    if (u.blur) u.blur.material.opacity = 0.19;
    if (Math.random() < dt * 9) {
      const back = f.vx < 0 ? 4.2 : -4.2;
      particles.smoke(f.x + back, f.y - 0.1, f.z, 1, {
        color: 0x89918a, size: 0.7, spread: 0.2, speed: 0.5, vy: 0.2, life: 0.9, alpha: 0.16, growth: 1.8,
      });
    }

    // Terrain and water are lethal for bandits too.
    const ground = world.heightAt(f.x, f.z);
    if (f.y <= Math.max(ground, 0) + 2.0) {
      this.damageFighter(f, 999);
      continue;
    }

    if (flying) {
      f.fireTimer -= dt;
      const inRange = absDx < (f.ace ? 460 : 390) && Math.abs(dy) < 85;
      if (inRange && f.state !== 'evade' && f.fireTimer <= 0) {
        const speed = 250;
        const lead = absDx / speed * 0.5;
        const spread = f.ace ? 0.018 : 0.045;
        const angle = Math.atan2(
          player.y + 1.0 + player.vy * lead * 0.3 - (f.y - 0.2),
          player.x + player.vx * lead * 0.3 - f.x
        ) + rand(-spread, spread);
        const mx = f.x + (Math.sign(f.vx) || f.dir) * 3.2;
        const my = f.y - 0.2;
        this.bullets.push({
          x: mx, y: my, z: f.z,
          prevX: mx, prevY: my, prevZ: f.z,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          vz: 0, life: 2.0,
          owner: 'enemy', damage: f.ace ? 9 : 7, color: 0xff8156, radius: 0.14, age: 0,
        });
        particles.fire(mx, my, f.z, 2, {
          size: 1.0, life: 0.12, vx: Math.cos(angle) * 6, vy: Math.sin(angle) * 6,
        });
        this.game.audio.enemyShot(0.04, clamp((f.x - player.x) / 320, -1, 1));
        f.fireTimer = f.ace ? rand(0.8, 1.6) : rand(1.1, 2.2);
      }
      if (Math.hypot(player.x - f.x, player.y - f.y) < 7.5) {
        this.damagePlayerCollision(f);
        continue;
      }
    }

    const maxAge = f.ace ? 60 : 32;
    const maxDistance = f.ace ? 3000 : 1500;
    if (this.fighters.includes(f) && (f.age > maxAge || Math.abs(f.x - player.x) > maxDistance)) {
      this.removeFighter(f);
    }
  }
};

CombatSystem.prototype.damagePlayerCollision = function (f) {
  if (this.game.mode !== 'flying') return;
  this.game.damagePlayer(34, 'collision');
  const p = new THREE.Vector3(f.x, f.y, f.z);
  particles.explosion(p, 1.2);
  this.game.audio.explosion(1.1);
  f.health = 0;
  this.damageFighter(f, 999);
};

CombatSystem.prototype.damageFighter = function (f, amount) {
  if (!f || !f.alive) return;
  f.health -= amount;
  if (f.health <= 0) {
    f.alive = false;
    const p = new THREE.Vector3(f.x, f.y, f.z);
    particles.explosion(p, 1.5);
    particles.smoke(f.x, f.y, f.z, 12, { color: 0x292f2e, size: 4, spread: 2, speed: 4, life: 2.4, growth: 8, alpha: 0.5, vy: 1.8 });
    this.game.audio.explosion(1.2, clamp((f.x - this.game.player.x) / 260, -1, 1));
    this.game.onEnemyDestroyed(f);
    this.removeFighter(f);
  } else {
    particles.sparks(f.x, f.y, f.z, 8, 14, 0xffd27a);
    particles.smoke(f.x, f.y, f.z, 2, { color: 0x3a3e38, size: 1.6, life: 1.5, alpha: 0.33, vy: 1.2 });
  }
};

CombatSystem.prototype.removeFighter = function (f) {
  if (!f) return;
  f.alive = false;
  if (f.group) {
    scene.remove(f.group);
    f.group.traverse(o => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== enemyMaterial && o.material !== propsMaterial && o.material !== darkMaterial && o.material !== playerMaterial) {
          if (o.material.dispose) o.material.dispose();
        }
      }
    });
  }
  const idx = this.fighters.indexOf(f);
  if (idx >= 0) this.fighters.splice(idx, 1);
};

CombatSystem.prototype.clearAirThreats = function () {
  for (const f of [...this.fighters]) this.removeFighter(f);
  this.fighters.length = 0;
  this.bullets.length = 0;
  for (const b of this.bombs) if (b.mesh) scene.remove(b.mesh);
  this.bombs.length = 0;
  for (const r of this.rockets) if (r.mesh) scene.remove(r.mesh);
  this.rockets.length = 0;
  this.banditTimer = 26;
  if (typeof tracers !== 'undefined') tracers.update([]);
};

export { UNIT_STATS, CombatSystem, combat };
