import * as THREE from 'three';
import { CONFIG } from '../config.js';
import {
  TAU, clamp, lerp, damp, rand, fmt, isTouch, $, _v3, UP,
} from '../core/utils.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { renderer, scene, camera, sun, sunDirection } from '../render/scene.js';
import { sky } from '../render/sky.js';
import { ocean } from '../render/ocean.js';
import { clouds } from '../render/clouds.js';
import { particles } from '../effects/particles.js';
import { carrier } from '../models/carrier.js';
import { playerModel } from '../models/aircraft.js';
import { world } from '../world/IslandWorld.js';
import { combat, UNIT_STATS } from '../combat.js';
import { ui, PLAYER_RANKS, loadBest, saveBest } from '../ui/hud.js';

class Game {
  constructor() {
    this.audio = new AudioEngine();
    this.input = {
      up: false, down: false, left: false, right: false,
      throttleUp: false, throttleDown: false,
      fire: false, firePressed: false,
    };
    this.mode = 'menu';
    this.started = false;
    this.paused = false;
    this.time = 0;
    this.menuTime = 0;
    this.score = 0;
    this.kills = 0;
    this.sortie = 1;
    this.sortieKills = 0;
    this.lives = 3;
    this.rankIndex = 0;
    this.best = loadBest();
    this.stateTimer = 0;
    this.launchTimer = 0;
    this.readyGuard = 0;
    this.landings = 0;
    this.shakeAmount = 0;
    this.damageFlashTimer = 0;
    this.enemySmokeTimer = 0;
    this.exhaustTimer = 0;
    this.warningTimer = 0;
    this.radarTimer = 0;
    this.hudTimer = 0;
    this.audioTimer = 0;
    this.camFacing = 1;
    this.camLook = new THREE.Vector3(18, 11, 0);
    this.camDesired = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.cameraInitialized = false;
    this.hudCache = {};
    this.mobile = isTouch;
    this.mouseLocked = false;
    this.hadMouseLock = false;
    this.mouseAimHintShown = false;
    this.mouseAimTracking = false;
    this.mouseSensitivity = 0.00155;
    this.suppressEscapePauseUntil = 0;
    this.player = this.makePlayerState();
    this.combat = combat;
    this.particles = particles;
    this.world = world;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.playerModel = playerModel;
    this.playerModel.visible = true;
    this.playerModel.position.set(this.player.x, this.player.y, this.player.z);
    this.playerModel.rotation.y = 0;

    this.bindUI();
    this.bindInput();
    this.bindMouseInput();
    this.setupWorld();
    this.buildHeadingTape();
    this.updateCamera(0.016, true);
    this.updateHUD(true);
    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  makePlayerState() {
    return {
      x: -57, y: CONFIG.deckY + 2.2, z: 0,
      dir: 1, speed: 0, vx: 0, vy: 0,
      pitch: 0, bank: 0, visualYaw: 0, throttle: 0.55,
      aimPitch: 0,
      health: 100, maxHealth: 100,
      fuel: 100, maxFuel: 100,
      ammo: 600, maxAmmo: 600,
      bombs: 8, maxBombs: 8,
      rockets: 6, maxRockets: 6,
      weapon: 'mg',
      gunCooldown: 0, bombCooldown: 0, rocketCooldown: 0,
      invulnerable: 0, gunSide: 1,
      turn: { active: false, time: 0, duration: 0.95, fromDir: 1, toDir: 1, fromYaw: 0, toYaw: Math.PI },
      engineOn: true,
      alive: true,
    };
  }

  setupWorld() {
    world.onLoad = (chunk) => {
      if (this.started && this.mode !== 'gameover' && this.mode !== 'menu') combat.spawnChunk(chunk);
    };
    world.onUnload = (chunk) => {
      if (this.started) combat.unloadChunk(chunk);
    };
    combat.setGame(this);
  }

  bindUI() {
    $('#startBtn').addEventListener('click', () => this.beginMission());
    $('#resumeBtn').addEventListener('click', () => this.togglePause(false));
    $('#restartBtn').addEventListener('click', () => { this.hideOverlays(); this.beginMission(); });
    $('#retryBtn').addEventListener('click', () => { this.hideOverlays(); this.beginMission(); });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('blur', () => {
      this.clearInput();
      if (this.started && !this.paused && this.mode !== 'gameover') this.togglePause(true);
    });
  }

  hideOverlays() {
    ui.pause.classList.add('hidden');
    ui.gameover.classList.add('hidden');
    ui.menu.classList.add('hidden');
  }

  bindInput() {
    const gameCodes = new Set([
      'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'KeyM', 'KeyB', 'KeyR', 'KeyC',
      'Digit1', 'Digit2', 'Digit3', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
      'Escape', 'Enter',
    ]);
    window.addEventListener('keydown', (e) => {
      if (gameCodes.has(e.code)) e.preventDefault();
      if (e.code === 'KeyM') {
        this.audio.init();
        this.audio.setMuted(!this.audio.muted);
        if (this.started) this.notify(this.audio.muted ? 'AUDIO MUTED' : 'AUDIO LIVE', 'Press M to toggle', 1.2, 'cyan');
        return;
      }
      if (!this.started) {
        if (e.code === 'Space' || e.code === 'Enter') this.beginMission();
        return;
      }
      if (this.mode === 'gameover') {
        if (e.code === 'Enter' || e.code === 'Space') this.beginMission();
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (e.code === 'Escape' && performance.now() < this.suppressEscapePauseUntil) return;
        if (!e.repeat) this.togglePause();
        return;
      }
      if (this.paused) return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.input.up = true; break;
        case 'KeyS': case 'ArrowDown': this.input.down = true; break;
        case 'KeyA': case 'ArrowLeft': this.input.left = true; break;
        case 'KeyD': case 'ArrowRight': this.input.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.input.throttleUp = true; break;
        case 'ControlLeft': case 'ControlRight': this.input.throttleDown = true; break;
        case 'Space':
          this.input.fire = true;
          if (!e.repeat) this.input.firePressed = true;
          break;
        case 'Tab':
          if (!e.repeat) this.cycleWeapon();
          break;
        case 'Digit1': if (!e.repeat) this.selectWeapon('mg'); break;
        case 'Digit2': if (!e.repeat) this.selectWeapon('bomb'); break;
        case 'Digit3': if (!e.repeat) this.selectWeapon('rocket'); break;
        case 'KeyB': if (!e.repeat) this.dropBomb(); break;
        case 'KeyR': if (!e.repeat) this.fireRocket(); break;
        case 'KeyC':
          if (!e.repeat) {
            this.player.aimPitch = 0;
            this.notify('PITCH TRIM', 'Gun line centred', 1.1, 'cyan');
          }
          break;
      }
      if (this.mode === 'ready' && this.readyGuard <= 0) {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyD' || e.code === 'ArrowRight') {
          this.startTakeoff();
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.input.up = false; break;
        case 'KeyS': case 'ArrowDown': this.input.down = false; break;
        case 'KeyA': case 'ArrowLeft': this.input.left = false; break;
        case 'KeyD': case 'ArrowRight': this.input.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.input.throttleUp = false; break;
        case 'ControlLeft': case 'ControlRight': this.input.throttleDown = false; break;
        case 'Space': this.input.fire = false; break;
      }
      if (['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown'].includes(e.code) && this.mouseAimTracking && !this.input.up && !this.input.down) {
        // Hand the current pitch over to mouse trim so releasing a keyboard key
        // never snaps the nose back while the player is fine-aiming.
        this.player.aimPitch = clamp(this.player.pitch, -0.74, 0.74);
      }
    });
  }

  bindMouseInput() {
    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!this.started || this.paused || this.mode === 'gameover') return;
        if (document.pointerLockElement !== canvas) this.requestMouseAim();
        if (this.mode === 'flying' || this.mode === 'ready' || this.mode === 'takeoff') {
          this.input.fire = true;
          this.input.firePressed = true;
        }
        e.preventDefault();
      } else if (e.button === 2) {
        if (!this.started || this.paused || this.mode !== 'flying') return;
        if (this.player.weapon !== 'bomb') this.dropBomb();
        e.preventDefault();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.fire = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.started || this.paused || this.mode !== 'flying') return;
      const overGame = document.pointerLockElement === canvas || e.target === canvas;
      if (!overGame || !e.movementY) return;
      const p = this.player;
      if (!this.mouseAimTracking) {
        // Start mouse aim from the attitude the aircraft actually has, instead of
        // from a zero trim. This prevents a keyboard dive from making the first
        // downward mouse movement feel like it is pitching back up.
        p.aimPitch = clamp(p.pitch, -0.74, 0.74);
        this.mouseAimTracking = true;
      }
      // Pointer movement up (negative movementY) raises the nose. The trim is
      // persistent, so small mouse movements give precise gun-line corrections.
      p.aimPitch = clamp(p.aimPitch - e.movementY * this.mouseSensitivity, -0.74, 0.74);
      if (!this.mouseAimHintShown) {
        this.mouseAimHintShown = true;
        this.notify('MOUSE AIM', 'Move up / down to pitch · C centres trim', 2.4, 'cyan');
      }
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      const wasLocked = this.mouseLocked;
      this.mouseLocked = locked;
      if (locked) {
        this.hadMouseLock = true;
        this.mouseAimHintShown = true;
        return;
      }
      if (wasLocked && this.hadMouseLock && this.started && !this.paused && this.mode !== 'gameover') {
        // The browser consumes Escape to release the pointer. Treat that as a pause.
        this.suppressEscapePauseUntil = performance.now() + 300;
        this.togglePause(true);
      }
    });
  }

  requestMouseAim() {
    if (isTouch) return;
    const canvas = renderer.domElement;
    if (document.pointerLockElement === canvas) return;
    try {
      const request = canvas.requestPointerLock?.();
      if (request && typeof request.catch === 'function') {
        request.catch(() => {
          // Pointer lock is optional; moving the mouse over the canvas still pitches.
        });
      }
    } catch {
      // Browsers without Pointer Lock still support direct mouse movement over the canvas.
    }
  }

  clearInput() {
    Object.keys(this.input).forEach(k => { this.input[k] = false; });
  }

  buildHeadingTape() {
    ui.headingTicks.innerHTML = '';
    for (let d = 250; d <= 410; d += 5) {
      const span = document.createElement('span');
      span.textContent = String(((d % 360) + 360) % 360).padStart(3, '0');
      ui.headingTicks.appendChild(span);
    }
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const DPR_CAP = isTouch ? 1.35 : 1.85;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(w, h);
    const vh = Math.min(h * renderer.getPixelRatio(), 2400);
    particles.smokeLayer.material.uniforms.uViewportH.value = vh;
    particles.fireLayer.material.uniforms.uViewportH.value = vh;
    this.cameraInitialized = false;
  }

  beginMission() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.audio.init();
    this.audio.chime(true);
    this.hideOverlays();
    particles.clear();
    this.started = true;
    this.paused = false;
    this.score = 0;
    this.kills = 0;
    this.sortie = 1;
    this.sortieKills = 0;
    this.lives = 3;
    this.rankIndex = 0;
    this.landings = 0;
    this.time = 0;
    this.shakeAmount = 0;
    this.best = loadBest();
    this.player = this.makePlayerState();
    this.mouseAimTracking = false;
    this.playerModel.visible = true;
    this.playerModel.position.set(this.player.x, this.player.y, this.player.z);
    this.playerModel.rotation.y = 0;
    this.playerModel.rotation.z = 0;
    this.playerModel.userData.bank.rotation.x = 0;
    this.playerModel.userData.pitch.rotation.z = 0;
    this.playerModel.userData.gear.visible = true;
    this.playerModel.visible = true;
    this.damageFlashTimer = 0;
    ui.damageFlash.classList.remove('hit');
    ui.messages.innerHTML = '';
    ui.warning.style.opacity = '0';
    combat.setGame(this);
    combat.clearAll();
    world.reset();
    this.mode = 'ready';
    this.stateTimer = 0;
    this.launchTimer = 2.9;
    this.readyGuard = 0.7;
    this.camFacing = 1;
    this.cameraInitialized = false;
    this.clearInput();
    ui.hud.classList.add('visible');
    ui.menu.classList.add('hidden');
    ui.gameover.classList.add('hidden');
    ui.pause.classList.add('hidden');
    world.ensureAround(this.player.x, 1, true);
    this.updateLivesIcons();
    this.updateHUD(true);
    this.notify('USS WASP · VF-13', 'Hellcat ready. Launching momentarily.', 3.0, 'gold');
    this.audio.updateEngine(0, 0.25, true, false);
    this.requestMouseAim();
  }

  togglePause(force = null) {
    if (!this.started || this.mode === 'gameover') return;
    const target = force === null ? !this.paused : force;
    if (target === this.paused) return;
    this.paused = target;
    if (this.paused) {
      ui.pause.classList.remove('hidden');
      this.clearInput();
      if (document.pointerLockElement) document.exitPointerLock();
      if (this.audio.ctx && this.audio.ctx.state === 'running') this.audio.ctx.suspend();
      this.audio.updateEngine(0, 0, false, false);
    } else {
      ui.pause.classList.add('hidden');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
      this.requestMouseAim();
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.update(dt);
    renderer.render(scene, camera);
  }

  update(dt) {
    this.menuTime += dt;
    if (!this.started) {
      this.time += dt;
      this.updateEnvironment(dt);
      this.updateParkedAircraft(dt);
      this.particles.update(dt);
      this.updateCamera(dt);
      this.updateSun();
      this.updateCarrierLights(dt);
      this.animateMenuAfterburner(dt);
      this.input.firePressed = false;
      return;
    }

    if (this.paused) {
      // Freeze simulation; keep the canvas composited under the pause sheet.
      return;
    }

    this.time += dt;
    this.updateEnvironment(dt);
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= dt;
      if (this.damageFlashTimer <= 0) ui.damageFlash.classList.remove('hit');
    }
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.8);
    this.warningTimer -= dt;
    this.audioTimer -= dt;
    this.exhaustTimer -= dt;
    this.enemySmokeTimer -= dt;

    switch (this.mode) {
      case 'ready': this.updateReady(dt); break;
      case 'takeoff': this.updateTakeoff(dt); break;
      case 'flying': this.updateFlying(dt); break;
      case 'landing': this.updateLanding(dt); break;
      case 'rearming': this.updateRearming(dt); break;
      case 'crashed': this.updateCrashed(dt); break;
      case 'gameover': break;
    }

    this.updateWorldStreaming(dt);
    if (this.mode === 'flying') combat.update(dt);
    this.updatePlayerSystems(dt);
    this.updatePlayerVisual(dt);
    this.particles.update(dt);
    this.updateCamera(dt);
    this.updateCarrierLights(dt);
    this.updateEngineAudio(dt);
    this.updateHUD();
    this.updateReticle();
    this.updateSun();
    if (this.mode === 'flying' || this.mode === 'takeoff') {
      if (this.input.firePressed) this.handleFirePressed();
    }
    this.input.firePressed = false;
  }

  updateEnvironment(dt) {
    sky.update(camera);
    ocean.update(camera, this.time);
    clouds.update(dt, camera, this.player.x);
  }

  updateWorldStreaming(dt) {
    world.update(dt, this.player.x, this.player.dir);
    // Remove death projectiles left behind by a landing or crash.
    if (this.mode !== 'flying') {
      for (let i = combat.bullets.length - 1; i >= 0; i--) {
        if (combat.bullets[i].owner === 'enemy') combat.bullets.splice(i, 1);
      }
    }
  }

  updateCarrierLights(dt) {
    if (carrier.userData.lights) {
      carrier.userData.lights.opacity = 0.55 + Math.sin(this.time * 3.4) * 0.4;
    }
  }

  updateParkedAircraft(dt) {
    const p = this.player;
    const u = this.playerModel.userData;
    u.prop.rotation.x += dt * 3.2;
    u.blur.material.opacity = 0.05;
    u.bank.rotation.x = Math.sin(this.menuTime * 0.4) * 0.005;
    u.pitch.rotation.z = 0;
    u.gear.visible = true;
    this.playerModel.position.set(this.player.x, this.player.y + Math.sin(this.menuTime * 1.1) * 0.035, this.player.z);
    this.playerModel.rotation.y = 0;
  }

  animateMenuAfterburner(dt) {
    // A tiny exhaust plume keeps the menu scene alive without running the sim.
    if (Math.random() < dt * 2.5) {
      const p = this.player;
      particles.smoke(p.x - 4.2, p.y - 0.1, 0, 1, {
        color: 0x899087, size: 0.8, spread: 0.2, speed: 0.45, vy: 0.5, life: 1.2, alpha: 0.12, growth: 2,
      });
    }
  }

  startTakeoff() {
    if (this.mode !== 'ready') return;
    const p = this.player;
    this.mode = 'takeoff';
    this.stateTimer = 0;
    this.takeoffStartX = p.x;
    this.takeoffLiftoffX = clamp(p.x + 88, 8, 52);
    this.takeoffAirTime = 0;
    p.dir = 1;
    p.visualYaw = 0;
    p.aimPitch = 0;
    this.mouseAimTracking = false;
    p.speed = Math.max(p.speed, 18);
    p.throttle = 1;
    p.invulnerable = 2.2;
    p.engineOn = p.fuel > 0;
    this.playerModel.visible = true;
    this.playerModel.userData.gear.visible = true;
    this.audio.chime(false);
    this.notify('LAUNCH', 'Full throttle · hold her steady', 1.7, 'gold');
  }

  updateReady(dt) {
    const p = this.player;
    this.stateTimer += dt;
    this.launchTimer -= dt;
    this.readyGuard -= dt;
    p.speed = damp(p.speed, 0, 5, dt);
    p.throttle = 0.25;
    p.pitch = damp(p.pitch, 0, 6, dt);
    p.bank = 0;
    p.visualYaw = 0;
    p.y = CONFIG.deckY + 2.2;
    p.invulnerable = Math.max(p.invulnerable, 1);
    if (this.readyGuard <= 0) {
      const wantsLaunch = this.input.fire || this.input.throttleUp || this.input.up || this.input.right;
      if (wantsLaunch || this.launchTimer <= 0) this.startTakeoff();
    }
  }

  updateTakeoff(dt) {
    const p = this.player;
    this.stateTimer += dt;
    p.throttle = 1;
    p.speed = Math.min(108, p.speed + dt * 48);
    p.x += p.speed * dt;
    const liftX = this.takeoffLiftoffX ?? 52;
    if (p.x > liftX) {
      this.takeoffAirTime = (this.takeoffAirTime || 0) + dt;
      p.pitch = damp(p.pitch, 0.19, 2.6, dt);
      p.vy = damp(p.vy, 18, 2.2, dt);
      p.y += p.vy * dt;
    } else {
      p.pitch = damp(p.pitch, 0, 4, dt);
      p.y = CONFIG.deckY + 2.2;
      p.vy = 0;
    }
    p.dir = 1;
    p.vx = p.speed;
    p.visualYaw = 0;
    p.bank = 0;
    if (this.exhaustTimer <= 0 && p.speed > 20) {
      particles.dust({ x: p.x - 2.4, y: CONFIG.deckY + 0.9, z: 0 }, 1.5, 2);
      this.exhaustTimer = 0.075;
    }
    if (p.y > CONFIG.deckY + 13.5 || (this.takeoffAirTime || 0) > 2.2) {
      this.mode = 'flying';
      this.stateTimer = 0;
      p.speed = Math.max(p.speed, 78);
      p.vy = Math.max(p.vy, 8);
      p.pitch = 0.15;
      p.throttle = 0.88;
      p.invulnerable = 1.6;
      this.playerModel.userData.gear.visible = false;
      this.notify('AIRBORNE', 'Sweep the island chain', 1.8, 'cyan');
      if (!this.mouseAimHintShown) {
        this.mouseAimHintShown = true;
        this.notify('MOUSE AIM', 'Move up / down to pitch · click to capture · C centres', 3.4, 'gold');
      }
      this.audio.chime(true);
    }
  }

  startTurn(toDir) {
    const p = this.player;
    p.turn.active = true;
    p.turn.time = 0;
    p.turn.duration = clamp(1.12 - p.speed / 300, 0.78, 1.05);
    p.turn.fromDir = p.dir;
    p.turn.toDir = toDir;
    p.turn.fromYaw = p.visualYaw;
    p.turn.toYaw = p.visualYaw + Math.PI;
    this.audio.noiseBurst(0.35, 0.07, 'bandpass', 420, this.audio.master, clamp((p.x - this.player.x) / 400, -1, 1));
  }

  updateFlying(dt) {
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.gunCooldown -= dt;
    p.bombCooldown -= dt;
    p.rocketCooldown -= dt;

    if (this.input.throttleUp) p.throttle += dt * 0.44;
    if (this.input.throttleDown) p.throttle -= dt * 0.48;
    p.throttle = clamp(p.throttle, 0.05, 1);
    if (p.fuel <= 0) p.engineOn = false;
    else p.engineOn = true;
    p.fuel = Math.max(0, p.fuel - dt * (0.26 + p.throttle * 0.48));

    const desiredDir = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
    if (!p.turn.active && desiredDir !== 0 && desiredDir !== p.dir && p.speed > 18) {
      this.startTurn(desiredDir);
    }

    let targetSpeed = 28 + p.throttle * 82;
    if (!p.engineOn) targetSpeed = 18;
    const diff = targetSpeed - p.speed;
    const rate = diff > 0 ? 20 : 9;
    p.speed += clamp(diff, -rate * dt, rate * dt);
    if (!p.engineOn) p.speed -= 4.5 * dt;
    p.speed -= Math.sin(p.pitch) * 17 * dt;
    if (p.turn.active && p.engineOn) p.speed -= 6 * dt;
    p.speed = clamp(p.speed, 0, CONFIG.maxSpeed);

    const pitchInput = (this.input.up ? 1 : 0) - (this.input.down ? 1 : 0);
    // Keyboard has full authority while held. With the keyboard neutral, the
    // mouse trim is the target instead of being added on top of a stale key angle.
    let pitchTarget = pitchInput !== 0 ? pitchInput * 0.58 : (this.mouseAimTracking ? (p.aimPitch || 0) : 0);
    pitchTarget = clamp(pitchTarget, -0.74, 0.74);
    const stalled = p.speed < CONFIG.stallSpeed;
    if (stalled) {
      const stallDepth = clamp((CONFIG.stallSpeed - p.speed) / CONFIG.stallSpeed, 0, 1);
      pitchTarget = -0.12 - stallDepth * 0.23;
    }
    p.pitch = damp(p.pitch, pitchTarget, stalled ? 1.5 : 3.0, dt);

    let turnAltitudeLoss = 0;
    let horizontalFactor = 1;
    if (p.turn.active) {
      const t = p.turn;
      t.time += dt;
      const k = clamp(t.time / t.duration, 0, 1);
      const smooth = k * k * (3 - 2 * k);
      horizontalFactor = Math.cos(smooth * Math.PI);
      p.visualYaw = t.fromYaw + Math.PI * smooth;
      turnAltitudeLoss = Math.sin(smooth * Math.PI) * 8;
      p.bank = damp(p.bank, -t.toDir * 0.92, 5, dt);
      if (k >= 1) {
        p.dir = t.toDir;
        p.turn.active = false;
        p.speed *= 0.86;
        p.visualYaw = p.dir === 1 ? 0 : Math.PI;
      }
    } else {
      p.visualYaw = p.dir === 1 ? 0 : Math.PI;
      const bankInput = desiredDir !== 0 && desiredDir === p.dir ? -desiredDir * 0.2 : 0;
      p.bank = damp(p.bank, bankInput, 3.4, dt);
    }

    p.vx = p.dir * p.speed * horizontalFactor;
    const sink = Math.max(0, 43 - p.speed) * 1.35;
    let targetVy = Math.sin(p.pitch) * p.speed * 0.9 - sink - turnAltitudeLoss;
    if (!p.engineOn) targetVy -= 6;
    p.vy = damp(p.vy, targetVy, 2.1, dt);

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z = 0;
    if (p.y > 225) {
      p.y = 225;
      p.vy = Math.min(p.vy, 0);
    }
    p.throttle = clamp(p.throttle, 0.05, 1);

    // Fire selected ordnance.
    if (p.gunCooldown < 0) p.gunCooldown = 0;
    if ((p.weapon === 'mg') && this.input.fire && p.gunCooldown <= 0) {
      if (p.ammo > 0) {
        combat.firePlayerGuns();
        p.ammo--;
        p.gunCooldown = 0.075;
      } else {
        p.gunCooldown = 0.3;
        this.audio.warning();
      }
    }

    this.handleLandingAndCollision();
  }

  handleLandingAndCollision() {
    const p = this.player;
    const carrierMin = CONFIG.carrierX - 75;
    const carrierMax = CONFIG.carrierX + 80;
    const overCarrier = p.x > carrierMin && p.x < carrierMax && Math.abs(p.z) < 15;
    if (overCarrier && p.y < CONFIG.deckY + 5.5 && p.y > 4) {
      if (p.speed < 95 && Math.abs(p.pitch) < 0.28 && Math.abs(p.vy) < 21 && this.mode === 'flying') {
        this.beginLanding();
        return;
      }
      if (p.y < CONFIG.deckY + 3.8 && this.mode === 'flying') {
        // A forgiving wave-off rather than an instant deck crash.
        p.y = CONFIG.deckY + 6.0;
        p.vy = Math.max(7, -p.vy * 0.35 + 4);
        p.speed = Math.min(p.speed, 85);
        if (this.warningTimer <= 0) {
          this.notify('WAVE OFF', p.speed > 95 ? 'Too fast for the wires' : 'Level your wings for the deck', 2.1, 'red');
          this.warningTimer = 3;
        }
        this.audio.warning();
      }
    }
    if (p.y < 2.2 && !overCarrier) {
      this.crash(p.y < 1 ? 'water' : 'water');
      return;
    }
    const ground = world.heightAt(p.x, p.z);
    if (ground > 0.4 && p.y < ground + 2.0) {
      this.crash('terrain');
    }
  }

  beginLanding() {
    const p = this.player;
    const touchSpeed = p.speed;
    const carrierBonus = 300 + Math.round(clamp(1 - touchSpeed / 115, 0, 1) * 500);
    this.mode = 'landing';
    this.stateTimer = 0;
    this.landings++;
    p.speed = 0;
    p.vx = 0;
    p.vy = 0;
    p.pitch = damp(p.pitch, 0, 8, 0.1);
    p.bank = 0;
    p.turn.active = false;
    p.y = CONFIG.deckY + 2.2;
    p.x = clamp(p.x, CONFIG.carrierX - 60, CONFIG.carrierX + 55);
    p.invulnerable = 999;
    this.playerModel.position.set(p.x, p.y, p.z);
    this.playerModel.userData.gear.visible = true;
    const sortieBonus = this.sortieKills * 100;
    this.score += carrierBonus + sortieBonus;
    this.checkPromotion();
    this.clearInput();
    combat.clearAirThreats();
    this.audio.thud();
    this.audio.chime(true);
    this.shake(0.35);
    particles.dust({ x: p.x - p.dir * 4, y: CONFIG.deckY + 0.9, z: 0 }, 2.3, 9);
    this.notify('HOOK CATCH', `${carrierBonus + sortieBonus} carrier bonus · repairs underway`, 2.8, 'gold');
  }

  updateLanding(dt) {
    const p = this.player;
    this.stateTimer += dt;
    p.x = damp(p.x, p.x, 3, dt);
    p.y = CONFIG.deckY + 2.2;
    if (this.stateTimer < 1.0 && Math.random() < dt * 18) {
      particles.dust({ x: p.x + p.dir * 2.2, y: CONFIG.deckY + 0.8, z: 0 }, 1.1, 1);
    }
    if (this.stateTimer > 1.35) {
      this.mode = 'rearming';
      this.stateTimer = 0;
      this.rearmStartHealth = p.health;
      this.rearmStartFuel = p.fuel;
      this.notify('REPAIR & REARM', 'Ordnance crews working the deck', 2.0, 'cyan');
    }
  }

  updateRearming(dt) {
    const p = this.player;
    this.stateTimer += dt;
    const progress = clamp(this.stateTimer / 2.7, 0, 1);
    p.health = lerp(this.rearmStartHealth ?? p.health, 100, progress);
    p.fuel = lerp(this.rearmStartFuel ?? p.fuel, 100, progress);
    if (progress >= 1) {
      p.health = 100;
      p.fuel = 100;
      p.ammo = p.maxAmmo;
      p.bombs = p.maxBombs;
      p.rockets = p.maxRockets;
      p.weapon = 'mg';
      p.dir = 1;
      p.visualYaw = 0;
      p.speed = 0;
      p.bank = 0;
      p.pitch = 0;
      p.invulnerable = 2.5;
      this.mode = 'ready';
      this.stateTimer = 0;
      this.launchTimer = 9;
      this.readyGuard = 1.1;
      this.sortie++;
      this.sortieKills = 0;
      this.audio.chime(true);
      this.notify('REARMED', 'Press SHIFT or SPACE to launch · auto launch in 9s', 3.6, 'green');
      this.playerModel.userData.gear.visible = true;
      this.updateLivesIcons();
    }
  }

  updateCrashed(dt) {
    this.stateTimer += dt;
    if (this.stateTimer > 3.0) {
      if (this.lives > 0) {
        this.respawnOnCarrier();
      } else {
        this.showGameOver();
      }
    }
  }

  crash(reason) {
    if (this.mode !== 'flying' || !this.player.alive) return;
    const p = this.player;
    p.alive = false;
    this.mode = 'crashed';
    this.stateTimer = 0;
    this.crashReason = reason;
    this.lives--;
    this.updateLivesIcons();
    const water = reason === 'water';
    const crashPos = new THREE.Vector3(p.x, Math.max(p.y, water ? 1.0 : world.heightAt(p.x, p.z)), p.z);
    if (water) {
      particles.explosion(crashPos, 2.2, true);
      const splash = particles.smokeLayer;
      particles.smoke(p.x, 0.6, p.z, 28, { color: 0xdbe5d7, size: 4.5, spread: 3, speed: 8, vy: 8, life: 2.2, growth: 9, alpha: 0.46 });
      particles.sparks(p.x, 1, p.z, 28, 18, 0xbff9ea);
      this.audio.explosion(1.5);
    } else {
      particles.explosion(crashPos, 2.4, false);
      particles.smoke(p.x, crashPos.y + 3, p.z, 20, { color: 0x2f3431, size: 5, spread: 3, speed: 3, vy: 4, life: 3, growth: 8, alpha: 0.5 });
      this.audio.explosion(1.6);
    }
    this.shake(1.4);
    this.playerModel.visible = false;
    this.damageFlashTimer = 0.4;
    ui.damageFlash.classList.add('hit');
    this.audio.updateEngine(0, 0, false, true);
    combat.clearAirThreats();
    if (this.player.health <= 0) {
      this.notify('HELLCAT DOWN', 'Airframe lost — pilot recovered', 2.7, 'red');
    } else {
      this.notify(water ? 'DITCHED AT SEA' : 'TERRAIN IMPACT', 'Pilot recovered by the task force', 2.7, 'red');
    }
  }

  respawnOnCarrier() {
    const sortieWas = this.sortie;
    this.player = this.makePlayerState();
    this.mouseAimTracking = false;
    this.player.x = -57;
    this.player.y = CONFIG.deckY + 2.2;
    this.player.invulnerable = 2.5;
    this.playerModel.visible = true;
    this.playerModel.position.set(this.player.x, this.player.y, 0);
    this.playerModel.rotation.y = 0;
    this.playerModel.rotation.z = 0;
    this.playerModel.userData.gear.visible = true;
    this.playerModel.userData.bank.rotation.x = 0;
    this.playerModel.userData.pitch.rotation.z = 0;
    this.mode = 'ready';
    this.stateTimer = 0;
    this.launchTimer = 3.6;
    this.cameraInitialized = false;
    this.readyGuard = 0.7;
    this.sortie = sortieWas;
    this.sortieKills = 0;
    this.playerModel.userData.gear.visible = true;
    this.clearInput();
    this.combatResetPlayerOrdnance();
    this.player.invulnerable = 2.5;
    this.updateLivesIcons();
    this.audio.chime(true);
    this.notify('FRESH HELLCAT', 'Back on the Wasp · launching in 4 seconds', 3.0, 'cyan');
  }

  updatePlayerSystems(dt) {
    const p = this.player;
    if (!p.alive) return;
    if (this.mode === 'flying') {
      // Urgent voice cues are rate-limited through the audio engine as well.
      if (this.warningTimer <= 0) {
        const groundAhead = world.heightAt(p.x + p.dir * 56, p.z);
        if (p.speed < CONFIG.stallSpeed) {
          this.audio.warning();
          this.warningTimer = 1.5;
        } else if (p.fuel < 15) {
          this.audio.warning();
          this.warningTimer = 2.2;
        } else if (p.y < groundAhead + 10) {
          this.audio.warning();
          this.warningTimer = 1.8;
        }
      }
    }
  }

  updatePlayerVisual(dt) {
    const p = this.player;
    const model = this.playerModel;
    const u = model.userData;
    if (p.alive && this.mode !== 'gameover') {
      model.visible = true;
      model.position.set(p.x, p.y, p.z);
      model.rotation.y = p.visualYaw;
      u.bank.rotation.x = p.bank;
      u.pitch.rotation.z = p.pitch;
      const engineActive = this.mode === 'flying' || this.mode === 'takeoff' || this.mode === 'ready' || this.mode === 'rearming';
      u.prop.rotation.x += dt * (engineActive ? (12 + p.throttle * 42) : 2);
      u.blur.material.opacity = engineActive ? 0.05 + p.throttle * 0.15 : 0.035;
      const nearDeck = Math.abs(p.x - CONFIG.carrierX) < 110 && p.y < 45;
      u.gear.visible = ['ready', 'takeoff', 'landing', 'rearming'].includes(this.mode) || (this.mode === 'flying' && nearDeck && p.speed < 58);
      if (this.mode === 'flying') {
        if (this.exhaustTimer <= 0) {
          const backX = p.x - p.dir * 5.1;
          const damaged = p.health < 55;
          particles.smoke(backX, p.y - 0.15, p.z, damaged ? 2 : 1, {
            color: damaged ? 0x272b28 : 0x9a9b8c,
            size: damaged ? 1.6 : 0.75,
            spread: 0.25,
            speed: 0.5,
            vx: -p.dir * rand(2, 4),
            vy: 0.2,
            life: damaged ? 2.1 : 0.9,
            alpha: damaged ? 0.35 : 0.13,
            growth: damaged ? 3.2 : 1.5,
          });
          if (!damaged) particles.fire(backX - p.dir * 0.25, p.y - 0.12, p.z, 1, {
            size: 0.28 + p.throttle * 0.3, life: 0.08, vx: -p.dir * 5, vy: 0.2,
          });
          this.exhaustTimer = damaged ? 0.11 : 0.085;
        }
        if (p.health < 55 && this.enemySmokeTimer <= 0) {
          particles.smoke(p.x - p.dir * 2.6, p.y + 0.1, p.z, 1, {
            color: 0x222824, size: 2.0, spread: 0.35, speed: 0.9,
            vx: -p.dir * rand(1, 3), vy: 1.2, life: 2.0, alpha: 0.3, growth: 3.5,
          });
          this.enemySmokeTimer = 0.35;
        }
        if (Math.abs(p.bank) > 0.48 && p.speed > 56 && Math.random() < dt * 10) {
          particles.smoke(p.x - p.dir * 0.6, p.y + 0.05, 4.6, 1, {
            color: 0xe7e2cf, size: 0.55, spread: 0.1, speed: 0.3,
            life: 0.5, alpha: 0.17, growth: 1.2,
          });
        }
      }
    } else if (this.mode !== 'crashed') {
      model.visible = false;
    }
  }

  updateEngineAudio(dt) {
    const p = this.player;
    const active = this.started && !this.paused && ['ready', 'takeoff', 'flying'].includes(this.mode) && p.alive;
    this.audio.updateEngine(p.speed, p.throttle, active && p.engineOn, p.health < 50);
  }

  updateCamera(dt, snap = false) {
    const p = this.player;
    let desired = this.camDesired;
    let target = this.camTarget;
    if (!this.started || this.mode === 'menu') {
      const t = this.menuTime * 0.11;
      desired.set(36 + Math.sin(t) * 18, 36 + Math.sin(t * 0.7) * 3, 162 + Math.cos(t * 0.83) * 7);
      target.set(-5, 9, 0);
    } else if (this.mode === 'ready' || this.mode === 'rearming' || this.mode === 'landing') {
      desired.set(CONFIG.carrierX + 18, 35, 150);
      target.set(CONFIG.carrierX - 2, 10, 0);
    } else if (this.mode === 'takeoff') {
      desired.set(p.x + 20, Math.max(32, p.y + 18), 118);
      target.set(p.x + 26 + p.dir * 10, Math.max(10, p.y - 3), 0);
    } else if (this.mode === 'crashed') {
      desired.set(p.x + 30, p.y + 30, 132);
      target.set(p.x, Math.max(0, p.y - 2), 0);
    } else {
      const speedLook = clamp(p.vx * 0.13, -18, 18);
      desired.set(p.x - p.dir * 4 + clamp(p.vx * 0.04, -7, 7), p.y + 19, CONFIG.cameraZ);
      target.set(p.x + p.dir * 36 + speedLook, p.y - 7, 0);
    }
    const snapNow = snap || !this.cameraInitialized;
    if (snapNow) {
      camera.position.copy(desired);
      this.camLook.copy(target);
      this.cameraInitialized = true;
    } else {
      const posK = 1 - Math.exp(-dt * 2.7);
      const lookK = 1 - Math.exp(-dt * 3.7);
      camera.position.lerp(desired, posK);
      this.camLook.lerp(target, lookK);
    }
    const fovTarget = CONFIG.baseFov + (this.mode === 'flying' ? clamp(p.speed / 140, 0, 0.9) * 5 : 0);
    camera.fov = damp(camera.fov, fovTarget, 2, dt);
    camera.updateProjectionMatrix();
    if (this.shakeAmount > 0.005) {
      const s = this.shakeAmount * 0.55;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.8);
    }
    camera.lookAt(this.camLook);
    if (this.mode === 'flying') camera.rotateZ(-p.bank * 0.075);
    camera.updateMatrixWorld();
  }

  updateSun() {
    const focusX = this.started ? this.player.x : CONFIG.carrierX;
    const focusY = this.started ? clamp(this.player.y, 0, 80) : 10;
    sun.target.position.set(focusX, focusY, 0);
    sun.position.set(
      focusX + sunDirection.x * 180,
      focusY + sunDirection.y * 180,
      sunDirection.z * 180
    );
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  updateHUD(force = false) {
    this.hudTimer -= 1 / 60;
    if (!force && this.hudTimer > 0) return;
    this.hudTimer = 0.095;
    if (!this.started || this.mode === 'menu') return;
    const p = this.player;
    const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
    setText(ui.score, fmt(this.score));
    setText(ui.bestScore, fmt(this.best));
    setText(ui.rank, PLAYER_RANKS[this.rankIndex].name);
    setText(ui.sortieNum, String(this.sortie).padStart(2, '0'));
    setText(ui.killCount, String(this.kills).padStart(3, '0'));
    setText(ui.speed, String(Math.round(p.speed * 0.95)));
    setText(ui.alt, String(Math.max(0, Math.round(p.y * 3.28))));
    setText(ui.fuel, String(Math.max(0, Math.round(p.fuel))));
    setText(ui.armor, String(Math.max(0, Math.round(p.health))));
    setText(ui.healthNum, String(Math.max(0, Math.round(p.health))));
    ui.fuelBar.style.transform = `scaleX(${clamp(p.fuel / 100, 0, 1)})`;
    ui.armorBar.style.transform = `scaleX(${clamp(p.health / 100, 0, 1)})`;
    ui.armorBarWrap.classList.toggle('danger', p.health < 30);
    ui.throttleBar.style.width = `${Math.round(p.throttle * 100)}%`;
    setText(ui.throttle, String(Math.round(p.throttle * 100)));
    setText(ui.throttleState, p.throttle < 0.28 ? 'IDLE' : p.throttle < 0.72 ? 'CRUISE' : p.throttle < 0.92 ? 'CLIMB' : 'FULL');
    this.updateWeaponHUD();
    this.updateLivesIcons();

    if (this.mode === 'flying') {
      const gh = world.heightAt(p.x + p.dir * 46, p.z);
      let warn = '';
      if (p.speed < CONFIG.stallSpeed) warn = 'STALL · NOSE DOWN';
      else if (p.fuel < 16) warn = 'FUEL CRITICAL';
      else if (p.health < 25) warn = 'AIRFRAME CRITICAL';
      else if (gh > 3 && p.y - gh < 9) warn = 'TERRAIN · PULL UP';
      setText(ui.warning, warn);
      ui.warning.classList.toggle('visible', !!warn);
      ui.warning.style.opacity = warn ? '' : '0';
      ui.fuelTint.classList.toggle('visible', p.fuel < 18 || p.health < 25);
    } else {
      ui.warning.classList.remove('visible');
      ui.warning.style.opacity = '0';
      ui.fuelTint.classList.toggle('visible', p.fuel < 18 && this.mode !== 'ready');
    }

    if (!ui.objective) return;
    let objective = 'Sweep the island chain. <em>Return to the carrier to rearm.</em>';
    if (this.mode === 'ready') {
      objective = this.readyGuard > 0 ? 'Launch check · <em>stand by</em>' : 'Launch check · <em>Press SHIFT or SPACE to launch</em>';
    } else if (this.mode === 'takeoff') {
      objective = 'Full throttle · <em>climb away from the deck</em>';
    } else if (this.mode === 'landing' || this.mode === 'rearming') {
      objective = 'Recovering aircraft · <em>repair and rearm</em>';
    } else if (this.mode === 'flying') {
      const nearCarrier = Math.abs(p.x - CONFIG.carrierX) < 210 && p.y < 55;
      if (nearCarrier && (p.dir < 0 || p.fuel < 30 || p.ammo < 120)) {
        objective = 'Carrier approach · <em>below 90 knots, wings level</em>';
      } else if (p.fuel < 22 || p.ammo < 90 || (p.bombs <= 0 && p.rockets <= 0)) {
        objective = 'Low supplies · <em>return to Wasp</em>';
      } else if (this.combat?.fighters?.length) {
        objective = 'Air threat · <em>bandits on radar</em>';
      } else {
        objective = 'Sweep the island chain · <em>strike ground targets</em>';
      }
    } else if (this.mode === 'crashed') {
      objective = 'Aircraft lost · <em>recovering pilot</em>';
    }
    if (ui.objective.innerHTML !== objective) ui.objective.innerHTML = objective;

    // Carrier bearing readout.
    const dx = CONFIG.carrierX - p.x;
    if (this.started && ['flying', 'takeoff'].includes(this.mode) && Math.abs(dx) > 260) {
      const arrow = dx < 0 ? '◀' : '▶';
      ui.carrierTag.classList.add('visible');
      const arrowEl = ui.carrierTag.querySelector('.carrier-arrow');
      if (arrowEl) arrowEl.textContent = arrow;
      setText(ui.carrierText, `CV-13 WASP · ${(Math.abs(dx) * 0.0015).toFixed(1)} KM ${arrow === '◀' ? 'WEST' : 'EAST'}`);
    } else {
      ui.carrierTag.classList.remove('visible');
    }

    if (this.radarTimer <= 0) {
      this.radarTimer = 0.14;
      this.updateRadar();
    }
    this.radarTimer -= 0.095;
    const headingOffset = ((-p.x * 0.12) % 31 + 31) % 31;
    ui.headingTicks.style.transform = `translateX(-${headingOffset}px)`;
    this.updateTacticalStatus();
  }

  updateTacticalStatus() {
    if (this.combat?.fighters?.length) {
      ui.radarStatus.textContent = 'BANDITS';
      ui.radarStatus.style.color = 'var(--red)';
      return;
    }
    let nearest = Infinity;
    for (const u of combat.units) nearest = Math.min(nearest, Math.abs(u.x - this.player.x));
    if (nearest < 360) {
      ui.radarStatus.textContent = 'CONTACT';
      ui.radarStatus.style.color = 'var(--amber)';
    } else {
      ui.radarStatus.textContent = 'CLEAR';
      ui.radarStatus.style.color = 'var(--cyan)';
    }
  }

  updateWeaponHUD(force = false) {
    const p = this.player;
    if (!p) return;
    const names = { mg: 'Machine Guns', bomb: '100 lb Bombs', rocket: '5-inch Rockets' };
    const ammo = p.weapon === 'mg' ? p.ammo : p.weapon === 'bomb' ? p.bombs : p.rockets;
    if (ui.weaponName) ui.weaponName.textContent = names[p.weapon];
    if (ui.weaponAmmo) ui.weaponAmmo.textContent = String(ammo).padStart(3, '0');
    for (const slot of ui.weaponSlots) {
      slot.classList.toggle('active', slot.dataset.weapon === p.weapon);
    }
  }

  updateReticle() {
    if (!this.started || !['flying', 'takeoff'].includes(this.mode)) {
      ui.reticle.style.display = 'none';
      ui.bombSight.classList.remove('visible');
      return;
    }
    ui.reticle.style.display = '';
    const p = this.player;
    const target = _v3.set(p.x + p.dir * Math.cos(p.pitch) * 65, p.y + Math.sin(p.pitch) * 65, 0);
    camera.updateMatrixWorld();
    target.project(camera);
    if (target.z < -1 || target.z > 1 || Math.abs(target.x) > 1.1 || Math.abs(target.y) > 1.1) {
      ui.reticle.style.opacity = '0';
    } else {
      ui.reticle.style.opacity = '0.8';
      ui.reticle.style.left = `${(target.x * 0.5 + 0.5) * window.innerWidth}px`;
      ui.reticle.style.top = `${(-target.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
    ui.reticle.classList.toggle('weapon-bomb', p.weapon === 'bomb');
    if (p.weapon === 'bomb' && this.mode === 'flying') {
      let gx = p.x + p.vx * 1.8;
      let g = world.heightAt(gx, 0);
      let t = Math.sqrt(Math.max(0.2, 2 * Math.max(0.5, p.y - 1.3 - g) / CONFIG.gravity));
      let impactX = p.x + p.vx * 0.78 * t;
      g = world.heightAt(impactX, 0);
      t = Math.sqrt(Math.max(0.2, 2 * Math.max(0.5, p.y - 1.3 - g) / CONFIG.gravity));
      impactX = p.x + p.vx * 0.78 * t;
      const point = _v3.set(impactX, Math.max(g, 0) + 1.0, 0).project(camera);
      if (point.z > -1 && point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1) {
        ui.bombSight.classList.add('visible');
        ui.bombSight.style.left = `${(point.x * 0.5 + 0.5) * window.innerWidth}px`;
        ui.bombSight.style.top = `${(-point.y * 0.5 + 0.5) * window.innerHeight}px`;
      } else {
        ui.bombSight.classList.remove('visible');
      }
    } else {
      ui.bombSight.classList.remove('visible');
    }
  }

  showGameOver() {
    this.mode = 'gameover';
    this.started = true;
    this.clearInput();
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.updateEngine(0, 0, false, false);
    this.audio.chime(false);
    this.audio.explosion(1.4);
    if (this.score > this.best) {
      this.best = this.score;
      saveBest(this.best);
    }
    ui.finalScore.textContent = fmt(this.score);
    ui.finalKills.textContent = String(this.kills).padStart(3, '0');
    ui.finalRank.textContent = PLAYER_RANKS[this.rankIndex].name;
    ui.gameoverTitle.textContent = 'Lost at sea';
    ui.gameoverText.textContent = 'Your Hellcat will not be returning to the Wasp. The task force presses on through the Solomon Sea.';
    ui.gameover.classList.remove('hidden');
    ui.hud.classList.remove('visible');
  }

  combatResetPlayerOrdnance() {
    for (const b of combat.bombs.splice(0)) {
      if (b.mesh) scene.remove(b.mesh);
    }
    for (const r of combat.rockets.splice(0)) {
      if (r.mesh) scene.remove(r.mesh);
    }
    combat.clearAirThreats();
  }

  damagePlayer(amount, source = 'bullet') {
    const p = this.player;
    if (!p.alive || p.invulnerable > 0 || this.mode !== 'flying') return;
    p.health -= amount;
    p.invulnerable = 0.42;
    this.shake(0.32);
    this.damageFlashTimer = 0.25;
    ui.damageFlash.classList.add('hit');
    this.audio.noiseBurst(0.11, 0.2, 'lowpass', 500, this.audio.master);
    particles.sparks(p.x, p.y, p.z, 7, 12, 0xffb55e);
    if (p.health <= 0) {
      p.health = 0;
      this.crash(source === 'collision' ? 'collision' : 'shot down');
    }
  }

  shake(amount) {
    this.shakeAmount = Math.min(1.5, this.shakeAmount + amount);
  }

  onEnemyDestroyed(unit) {
    const value = unit.score || UNIT_STATS[unit.type]?.score || 100;
    this.score += value;
    this.kills++;
    this.sortieKills++;
    const label = UNIT_STATS[unit.type]?.name || unit.name || (unit.type === 'fighter' ? 'FIGHTER' : 'TARGET');
    if (unit.type === 'bunker' || unit.type === 'barracks' || unit.type === 'fighter') {
      this.notify(`${label} DESTROYED`, `Combat score +${value}`, 1.7, unit.type === 'fighter' ? 'red' : 'gold');
    }
    this.checkPromotion();
    this.updateLivesIcons();
  }

  checkPromotion() {
    while (this.rankIndex + 1 < PLAYER_RANKS.length && this.score >= PLAYER_RANKS[this.rankIndex + 1].at) {
      this.rankIndex++;
      this.lives++;
      this.audio.chime(true);
      this.notify('PROMOTION', `${PLAYER_RANKS[this.rankIndex].name} · extra Hellcat assigned`, 3.2, 'gold');
    }
  }

  updateLivesIcons() {
    if (!ui.lives) return;
    const count = Math.max(0, this.lives);
    const displayCount = Math.max(3, count);
    if (this.lastLivesShown === count && ui.lives.childElementCount === displayCount) return;
    this.lastLivesShown = count;
    ui.lives.innerHTML = '';
    for (let i = 0; i < displayCount; i++) {
      const span = document.createElement('span');
      span.className = 'life-icon' + (i >= count ? ' lost' : '');
      ui.lives.appendChild(span);
    }
  }

  handleFirePressed() {
    const p = this.player;
    if (this.mode !== 'flying') return;
    if (p.weapon === 'bomb') this.dropBomb();
    else if (p.weapon === 'rocket') this.fireRocket();
  }

  selectWeapon(weapon) {
    if (!['mg', 'bomb', 'rocket'].includes(weapon)) return;
    this.player.weapon = weapon;
    this.updateWeaponHUD(true);
    this.updateReticle();
  }

  cycleWeapon() {
    const order = ['mg', 'bomb', 'rocket'];
    const idx = order.indexOf(this.player.weapon);
    this.selectWeapon(order[(idx + 1) % order.length]);
  }

  dropBomb() {
    const p = this.player;
    if (this.mode !== 'flying' || p.bombs <= 0 || p.bombCooldown > 0) {
      if (p.bombs <= 0) this.audio.warning();
      return;
    }
    if (combat.spawnBomb()) {
      p.bombs--;
      p.bombCooldown = 0.48;
      this.updateWeaponHUD(true);
    }
  }

  fireRocket() {
    const p = this.player;
    if (this.mode !== 'flying' || p.rockets <= 0 || p.rocketCooldown > 0) {
      if (p.rockets <= 0) this.audio.warning();
      return;
    }
    if (combat.spawnRocket()) {
      p.rockets--;
      p.rocketCooldown = 0.72;
      this.updateWeaponHUD(true);
    }
  }

  updateRadar() {
    const c = ui.radar;
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    const cx = W / 2;
    const range = 1200;
    const mapX = (wx) => cx + ((wx - this.player.x) / range) * (W / 2);
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(7,30,36,.95)');
    bg.addColorStop(0.68, 'rgba(7,26,31,.9)');
    bg.addColorStop(1, 'rgba(9,20,24,.98)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(125,228,212,.075)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const x = i * W / 8;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const y = i * H / 3;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    const baseline = H * 0.68;
    for (const [, chunk] of world.chunks) {
      if (!chunk.island) continue;
      const x1 = mapX(chunk.island.cx - chunk.island.rx);
      const x2 = mapX(chunk.island.cx + chunk.island.rx);
      if (x2 < -20 || x1 > W + 20) continue;
      const center = mapX(chunk.island.cx);
      const halfW = Math.max(4, (x2 - x1) / 2);
      const maxH = Math.max(...chunk.targets.map(t => t.y || 0), 10);
      const hillH = clamp(maxH * 0.42, 4, 26);
      ctx.beginPath();
      ctx.moveTo(center - halfW, baseline);
      ctx.quadraticCurveTo(center - halfW * 0.5, baseline - hillH, center, baseline - hillH);
      ctx.quadraticCurveTo(center + halfW * 0.5, baseline - hillH, center + halfW, baseline);
      ctx.closePath();
      ctx.fillStyle = 'rgba(88,132,94,.36)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(143,208,151,.24)';
      ctx.lineWidth = 1;
      ctx.stroke();
      for (const u of combat.units) {
        if (u.chunkIndex !== chunk.index || !u.alive) continue;
        const px = mapX(u.x);
        if (px < 0 || px > W) continue;
        ctx.fillStyle = u.type === 'bunker' || u.type === 'aa' ? '#ff735e' : u.type === 'infantry' ? 'rgba(255,151,92,.7)' : '#ffb15e';
        ctx.beginPath();
        ctx.arc(px, baseline - 3 - clamp(u.y * 0.13, 0, 13), u.type === 'infantry' ? 1.5 : 2.2, 0, TAU);
        ctx.fill();
      }
    }
    const carrierX = mapX(CONFIG.carrierX);
    if (carrierX > 6 && carrierX < W - 6) {
      ctx.fillStyle = 'rgba(125,228,212,.85)';
      ctx.fillRect(carrierX - 5, baseline - 2, 10, 3);
      ctx.fillStyle = 'rgba(125,228,212,.35)';
      ctx.fillRect(carrierX - 3, baseline - 5, 6, 2);
      ctx.strokeStyle = 'rgba(125,228,212,.2)';
      ctx.beginPath(); ctx.arc(carrierX, baseline - 3, 8, 0, TAU); ctx.stroke();
    }
    for (const f of combat.fighters) {
      const px = mapX(f.x);
      if (px < -10 || px > W + 10) continue;
      const py = baseline - 18 - clamp((f.y - this.player.y) * 0.12, -12, 12);
      ctx.fillStyle = '#ff775a';
      ctx.beginPath();
      ctx.moveTo(px, py - 4); ctx.lineTo(px + 4, py + 4); ctx.lineTo(px - 4, py + 4); ctx.closePath();
      ctx.fill();
    }
    const py = baseline - 8;
    ctx.save();
    ctx.translate(cx, py);
    ctx.scale(this.player.dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,122,.3)';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(125,228,212,.22)';
    for (let i = 0; i < 13; i++) ctx.fillRect(i * W / 12, H - 4, 2, 3);
    if (ui.radarRange) ui.radarRange.textContent = `+/- ${(range * 0.0015).toFixed(1)} KM`;
  }

  notify(main, sub = '', duration = 2.4, tone = '') {
    if (!ui.messages) return;
    const el = document.createElement('div');
    el.className = `msg ${tone}`;
    const mainEl = document.createElement('div');
    mainEl.className = 'msg-main';
    mainEl.textContent = main;
    el.appendChild(mainEl);
    if (sub) {
      const subEl = document.createElement('div');
      subEl.className = 'msg-sub';
      subEl.textContent = sub;
      el.appendChild(subEl);
    }
    ui.messages.appendChild(el);
    while (ui.messages.children.length > 3) ui.messages.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, duration * 1000);
  }
}

export { Game };
