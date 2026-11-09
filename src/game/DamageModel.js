import { clamp, rand } from '../core/utils.js';
import { particles } from '../effects/particles.js';

// ---------------------------------------------------------------------------------------------
//  Player subsystem damage. Health is still the main arcade resource, but hits can now knock
//  out the engine, controls, guns, or fuel tank, or start a fire that forces a landing.
// ---------------------------------------------------------------------------------------------
const NOTICE_COOLDOWN = 2.5;

function makeState() {
  return {
    engine: 100,
    controls: 100,
    guns: 100,
    fuel: 100,
    fire: 0,
    gunJam: 0,
    notices: { engine: 0, controls: 0, guns: 0, fuel: 0, fire: 0 },
  };
}

class DamageModel {
  constructor(game) {
    this.game = game;
    this.state = makeState();
    this.fireTimer = 0;
  }

  reset() {
    this.state = makeState();
    this.fireTimer = 0;
  }

  applyHit(amount, source = 'bullet') {
    const severity = clamp(amount / 30, 0.15, 1);
    const roll = Math.random();
    if (roll < 0.16 * severity) this.damage('engine', rand(10, 24), 'ENGINE HIT');
    else if (roll < 0.30 * severity) this.damage('controls', rand(8, 20), 'CONTROLS HIT');
    else if (roll < 0.44 * severity) this.damage('guns', rand(12, 28), 'GUNS HIT');
    else if (roll < 0.56 * severity) this.damage('fuel', rand(10, 22), 'FUEL LEAK');
    else if (roll < 0.62 * severity && source !== 'collision') this.ignite();
  }

  damage(key, amount, label) {
    const s = this.state;
    if (s[key] <= 0) return;
    s[key] = clamp(s[key] - amount, 0, 100);
    if (key === 'guns' && s.guns < 35 && s.gunJam <= 0) {
      s.gunJam = rand(1.8, 4.2);
    }
    this.notice(key, label, s[key] <= 0 ? 'SYSTEM FAILURE' : `${Math.round(s[key])}%`);
    if (key === 'engine') this.game.audio.warning();
  }

  ignite() {
    const s = this.state;
    if (s.fire > 0) return;
    s.fire = rand(10, 18);
    this.notice('fire', 'FIRE', 'Land immediately');
    this.game.audio.warning();
  }

  notice(key, main, sub) {
    const now = this.game.time || 0;
    if (now < (this.state.notices[key] || 0)) return;
    this.state.notices[key] = now + NOTICE_COOLDOWN;
    this.game.notify(main, sub, 2.0, 'red');
  }

  update(dt) {
    const p = this.game.player;
    if (!p.alive) return;
    const s = this.state;
    if (s.gunJam > 0) s.gunJam = Math.max(0, s.gunJam - dt);
    if (s.fire <= 0) return;

    s.fire = Math.max(0, s.fire - dt * 0.45);
    p.health = Math.max(0, p.health - dt * 1.6);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 0.08;
      const yaw = p.visualYaw || 0;
      const bx = p.x - Math.cos(yaw) * 3.2;
      const bz = p.z + Math.sin(yaw) * 3.2;
      particles.fire(bx, p.y + 0.2, bz, 1, { size: 0.9, life: 0.25, vy: 1.2 });
      particles.smoke(bx, p.y + 0.4, bz, 1, {
        color: 0x1d211f, size: 1.8, life: 1.8, alpha: 0.35, growth: 3, vy: 2.2,
      });
    }
    if (p.health <= 0) {
      p.health = 0;
      this.game.crash('fire');
    }
  }

  get engineFactor() {
    const s = this.state;
    const base = 0.45 + 0.55 * (s.engine / 100);
    return s.fire > 0 ? base * 0.92 : base;
  }

  get controlFactor() {
    return 0.5 + 0.5 * (this.state.controls / 100);
  }

  get fuelFactor() {
    return 1 + (1 - this.state.fuel / 100) * 1.1;
  }

  get gunJammed() {
    return this.state.gunJam > 0;
  }

  get warning() {
    const s = this.state;
    if (s.fire > 0) return 'FIRE · LAND NOW';
    if (s.engine < 25) return 'ENGINE FAILING';
    if (s.controls < 25) return 'CONTROLS DAMAGED';
    if (s.gunJam > 0) return 'GUNS JAMMED';
    if (s.guns < 25) return 'GUNS DAMAGED';
    if (s.fuel < 25) return 'FUEL LEAK';
    return '';
  }
}

export { DamageModel };
