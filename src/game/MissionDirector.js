// ---------------------------------------------------------------------------------------------
//  Lightweight sortie director. Missions cycle through strike, flak suppression, fighter sweep,
//  and an ace duel, then loop with tougher counts and larger bonuses.
// ---------------------------------------------------------------------------------------------
const MISSIONS = [
  {
    id: 'bunkers',
    title: 'STRIKE THE BUNKERS',
    sub: 'Destroy coastal bunkers',
    target: 'bunker',
    count: 2,
    bonus: 1200,
  },
  {
    id: 'flak',
    title: 'SILENCE THE FLAK',
    sub: 'Destroy anti-air batteries',
    target: 'aa',
    count: 3,
    bonus: 1400,
  },
  {
    id: 'sweep',
    title: 'BREAK THE SWEEP',
    sub: 'Destroy enemy fighters',
    target: 'fighter',
    count: 2,
    bonus: 1800,
  },
  {
    id: 'ace',
    title: 'ACE DUEL',
    sub: 'Shoot down the enemy ace',
    target: 'ace',
    count: 1,
    bonus: 3500,
    ace: true,
  },
];

class MissionDirector {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.cycle = 0;
    this.progress = 0;
    this.active = false;
    this.transitionTimer = 0;
    this.aceSpawnTimer = 0;
    this.lockedTarget = null;
  }

  reset() {
    this.index = 0;
    this.cycle = 0;
    this.progress = 0;
    this.active = true;
    this.transitionTimer = 0;
    this.aceSpawnTimer = 0;
    this.lockedTarget = null;
    this.startMission(true);
  }

  get mission() {
    return MISSIONS[this.index];
  }

  get count() {
    if (this.mission.ace) return 1;
    return this.mission.count + Math.min(2, this.cycle);
  }

  get targetType() {
    const target = this.mission.target;
    return target === 'ace' ? 'fighter' : target;
  }

  startMission(first = false) {
    this.progress = 0;
    this.lockedTarget = null;
    this.aceSpawnTimer = this.mission.ace ? 1.4 : 0;
    if (this.mission.ace) this.game.combat.banditTimer = 999;
    else if (this.mission.target === 'fighter') this.game.combat.banditTimer = Math.min(this.game.combat.banditTimer, 8);
    if (!first) {
      this.game.notify(this.mission.title, this.mission.sub, 3.0, 'gold');
      this.game.audio.chime(true);
    }
  }

  update(dt) {
    if (this.active && this.mission.target === 'fighter' && this.game.combat.banditTimer > 10) {
      this.game.combat.banditTimer = 10;
    }
    if (this.mission.ace && this.active && this.aceSpawnTimer <= 0) {
      const hasAce = this.game.combat.fighters.some((f) => f.alive && f.ace);
      if (!hasAce) this.aceSpawnTimer = 4.0;
    }
    if (this.aceSpawnTimer > 0) {
      this.aceSpawnTimer -= dt;
      if (this.aceSpawnTimer <= 0) {
        this.game.combat.spawnEnemyFighter({ ace: true, distance: 420 });
        this.aceSpawnTimer = 0;
      }
    }
    if (this.transitionTimer > 0) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) this.advance();
    }
  }

  onEnemyDestroyed(unit) {
    if (this.lockedTarget === unit) this.lockedTarget = null;
    if (!this.active || !unit) return;
    const m = this.mission;
    let match = false;
    if (m.target === 'ace') match = !!unit.ace;
    else if (m.target === 'fighter') match = unit.type === 'fighter';
    else if (m.target === 'any') match = true;
    else match = unit.type === m.target;
    if (!match) return;

    this.progress++;
    if (this.progress >= this.count) this.complete();
  }

  complete() {
    const m = this.mission;
    const bonus = m.bonus + this.cycle * 600;
    this.active = false;
    this.lockedTarget = null;
    this.game.score += bonus;
    this.game.checkPromotion();
    this.game.notify('OBJECTIVE COMPLETE', `${m.title} · +${bonus}`, 3.0, 'green');
    this.game.audio.chime(true);
    this.transitionTimer = 3.2;
  }

  advance() {
    this.index++;
    if (this.index >= MISSIONS.length) {
      this.index = 0;
      this.cycle++;
    }
    this.active = true;
    this.transitionTimer = 0;
    this.game.combat.banditTimer = Math.min(this.game.combat.banditTimer, 12);
    this.startMission(false);
  }

  get objectiveHtml() {
    if (!this.active) return 'Objective complete · <em>new tasking inbound</em>';
    const m = this.mission;
    return `${m.title} · <em>${Math.min(this.progress, this.count)} / ${this.count}</em>`;
  }

  getTarget() {
    if (!this.active) return null;
    const game = this.game;
    const target = this.mission.target;
    const valid = (t) => {
      if (!t || !t.alive) return false;
      if (target === 'ace') return !!t.ace;
      if (target === 'fighter') return t.type === 'fighter';
      return t.type === target;
    };
    // Lock onto one target until it is destroyed or unloaded. Re-picking the
    // nearest target every HUD tick made the marker jump between bunkers.
    if (valid(this.lockedTarget)) return this.lockedTarget;

    let best = null;
    let bestDist = Infinity;
    if (target === 'ace' || target === 'fighter') {
      for (const f of game.combat.fighters) {
        if (!valid(f)) continue;
        const dist = Math.abs(f.x - game.player.x);
        if (dist < bestDist) {
          bestDist = dist;
          best = f;
        }
      }
    } else {
      for (const unit of game.combat.units) {
        if (!valid(unit)) continue;
        const dist = Math.abs(unit.x - game.player.x);
        if (dist < bestDist) {
          bestDist = dist;
          best = unit;
        }
      }
    }
    this.lockedTarget = best;
    return best;
  }
}

export { MissionDirector, MISSIONS };
