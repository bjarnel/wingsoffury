import { $, $$ } from '../core/utils.js';

// ---------------------------------------------------------------------------------------------
//  HUD references and high-level game controller
// ---------------------------------------------------------------------------------------------
const ui = {
  hud: $('#hud'),
  menu: $('#menu'),
  pause: $('#pause'),
  gameover: $('#gameover'),
  loading: $('#loading'),
  score: $('#score'),
  bestScore: $('#bestScore'),
  rank: $('#rank'),
  sortieNum: $('#sortieNum'),
  killCount: $('#killCount'),
  lives: $('#livesIcons'),
  healthNum: $('#healthNum'),
  weaponName: $('#weaponName'),
  weaponAmmo: $('#weaponAmmo'),
  weaponSlots: $$('.weapon-slot'),
  speed: $('#speedVal'),
  alt: $('#altVal'),
  fuel: $('#fuelVal'),
  fuelBar: $('#fuelBar'),
  throttle: $('#throttleVal'),
  throttleBar: $('#throttleBar'),
  throttleState: $('#throttleState'),
  armor: $('#armorVal'),
  armorBar: $('#armorBar'),
  armorBarWrap: $('#armorBarWrap'),
  warning: $('#warning'),
  debug: $('#debug'),
  objective: $('#objective'),
  carrierTag: $('#carrierTag'),
  approach: $('#approach'),
  approachBall: $('#approachBall'),
  approachCall: $('#approachCall'),
  approachInfo: $('#approachInfo'),
  carrierText: $('#carrierText'),
  messages: $('#messages'),
  reticle: $('#reticle'),
  bombSight: $('#bombSight'),
  targetMarker: $('#targetMarker'),
  targetLabel: $('#targetLabel'),
  damageFlash: $('#damageFlash'),
  fuelTint: $('#fuelTint'),
  radar: $('#radar'),
  radarStatus: $('#radarStatus'),
  radarRange: $('#radarRange'),
  finalScore: $('#finalScore'),
  finalKills: $('#finalKills'),
  finalRank: $('#finalRank'),
  gameoverTitle: $('#gameoverTitle'),
  gameoverText: $('#gameoverText'),
  headingTicks: $('#headingTicks'),
  touchStick: $('#touchStick'),
  touchKnob: $('#touchKnob'),
  touchThrottle: $('#touchThrottle'),
  touchThrottleRail: $('#touchThrottleRail'),
  touchThrottleFill: $('#touchThrottleFill'),
  touchThrottleKnob: $('#touchThrottleKnob'),
  touchFire: $('#touchFire'),
  touchWeapons: $$('.touch-weapon'),
  touchAmmo: $('#touchAmmo'),
  touchPause: $('#touchPause'),
  touchMute: $('#touchMute'),
};

const PLAYER_RANKS = [
  { name: 'Ensign', at: 0 },
  { name: 'Lieutenant', at: 3500 },
  { name: 'Lt. Commander', at: 9000 },
  { name: 'Commander', at: 18000 },
  { name: 'Captain', at: 32000 },
  { name: 'Ace', at: 52000 },
];

function loadBest() {
  try { return parseInt(localStorage.getItem('wof-pacific-best') || '0', 10) || 0; }
  catch { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem('wof-pacific-best', String(n)); } catch { /* storage can be disabled */ }
}

export { ui, PLAYER_RANKS, loadBest, saveBest };
