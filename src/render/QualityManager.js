import { renderer, sun } from './scene.js';

// ---------------------------------------------------------------------------------------------
//  Lightweight adaptive quality. Keeps the game smooth on phones without a settings menu.
//  DPR changes are cheap; shadow toggling is only used at the low/high ends.
// ---------------------------------------------------------------------------------------------
const LEVELS = {
  touch: [
    { name: 'LOW', dpr: 1.0, shadows: false },
    { name: 'MED', dpr: 1.25, shadows: true },
    { name: 'HIGH', dpr: 1.5, shadows: true },
  ],
  desktop: [
    { name: 'LOW', dpr: 1.25, shadows: false },
    { name: 'MED', dpr: 1.5, shadows: true },
    { name: 'HIGH', dpr: 1.85, shadows: true },
  ],
};

class QualityManager {
  constructor(game) {
    this.game = game;
    this.levels = game.mobile ? LEVELS.touch : LEVELS.desktop;
    this.index = game.mobile ? 1 : 2;
    this.lowTime = 0;
    this.highTime = 0;
    this.cooldown = 2;
    this.apply();
  }

  get level() {
    return this.levels[this.index];
  }

  get label() {
    return this.level.name;
  }

  apply() {
    const { dpr, shadows } = this.level;
    this.game.dprCap = dpr;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dpr));
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    if (this.game.onResize) this.game.onResize(false);
  }

  update(dt, fps) {
    if (!this.game.started || this.game.paused || !fps) return;
    this.cooldown -= dt;

    if (fps < 45) {
      this.lowTime += dt;
      this.highTime = 0;
    } else if (fps > 56) {
      this.highTime += dt;
      this.lowTime = 0;
    } else {
      this.lowTime = Math.max(0, this.lowTime - dt);
      this.highTime = Math.max(0, this.highTime - dt);
    }

    if (this.cooldown > 0) return;

    if (this.lowTime > 2.5 && this.index > 0) {
      this.index--;
      this.apply();
      this.cooldown = 7;
      this.lowTime = 0;
      this.highTime = 0;
    } else if (this.highTime > 6 && this.index < this.levels.length - 1) {
      this.index++;
      this.apply();
      this.cooldown = 9;
      this.lowTime = 0;
      this.highTime = 0;
    }
  }
}

export { QualityManager };
