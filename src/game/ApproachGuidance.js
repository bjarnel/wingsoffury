import { CONFIG } from '../config.js';
import { clamp } from '../core/utils.js';

// ---------------------------------------------------------------------------------------------
//  Carrier approach guidance: a compact LSO meatball plus rate-limited radio-style calls.
// ---------------------------------------------------------------------------------------------
class ApproachGuidance {
  constructor(game) {
    this.game = game;
    this.visible = false;
    this.callTimer = 0;
    this.lastCall = '';
  }

  reset() {
    this.visible = false;
    this.callTimer = 0;
    this.lastCall = '';
    this.hide();
  }

  hide() {
    const ui = this.game.ui;
    if (ui?.approach) ui.approach.classList.remove('visible');
  }

  update(dt) {
    const game = this.game;
    const ui = game.ui;
    if (!ui?.approach) return;
    const p = game.player;
    const dx = CONFIG.carrierX - p.x;
    const distance = Math.abs(dx);
    const facingCarrier = (dx * (p.facingX ?? p.dir)) > 0;
    const active = game.mode === 'flying' && distance < 300 && p.y < 95
      && (facingCarrier || p.fuel < 30 || p.health < 40);
    this.visible = active;
    if (!active) {
      this.hide();
      return;
    }

    // A simple side-view glideslope: high and far away, descending toward the deck.
    const idealY = CONFIG.deckY + 2.2 + distance * 0.035;
    const deviation = p.y - idealY;
    const ball = clamp(deviation / 10, -1, 1);
    const speedKts = p.speed * 0.95;
    const tooFast = speedKts > 90;
    const tooSlow = speedKts < 68;
    const level = Math.abs(p.bank) < 0.22 && !p.turnActive;
    const pitchOk = Math.abs(p.pitch) < 0.26;
    const sinkOk = Math.abs(p.vy) < 20;
    const fire = game.damage?.state.fire > 0;

    let call = 'CALL THE BALL';
    let tone = 'green';
    if (fire) {
      call = 'FIRE';
      tone = 'red';
    } else if (!level) {
      call = 'WINGS LEVEL';
      tone = 'red';
    } else if (tooFast) {
      call = 'TOO FAST';
      tone = 'amber';
    } else if (tooSlow) {
      call = 'POWER';
      tone = 'amber';
    } else if (ball > 0.35) {
      call = 'TOO HIGH';
      tone = 'amber';
    } else if (ball < -0.35) {
      call = 'TOO LOW';
      tone = 'red';
    } else if (!pitchOk) {
      call = 'NOSE';
      tone = 'amber';
    } else if (!sinkOk) {
      call = 'SINK RATE';
      tone = 'red';
    }

    ui.approach.classList.add('visible');
    ui.approach.classList.toggle('good', call === 'CALL THE BALL');
    ui.approach.classList.toggle('danger', tone === 'red');
    ui.approachBall.style.transform = `translate(-50%, -50%) translateY(${(-ball * 9).toFixed(1)}px)`;
    ui.approachCall.textContent = call;
    ui.approachCall.dataset.tone = tone;
    if (ui.approachInfo) {
      ui.approachInfo.textContent = `${(distance * 0.0015).toFixed(1)} KM · ${Math.round(speedKts)} KTS`;
    }

    this.callTimer -= dt;
    if (call !== this.lastCall && this.callTimer <= 0) {
      this.callTimer = 2.2;
      this.lastCall = call;
      if (call !== 'CALL THE BALL') game.audio.warning();
    }
  }
}

export { ApproachGuidance };
