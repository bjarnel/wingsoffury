import * as THREE from 'three';
import { TAU } from '../core/utils.js';
import { renderer } from './scene.js';

// ---------------------------------------------------------------------------------------------
//  Procedural sprite textures
// ---------------------------------------------------------------------------------------------
function makePuffTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const half = size * 0.5;
  const grad = ctx.createRadialGradient(half, half, size * 0.025, half, half, half);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,.78)');
  grad.addColorStop(0.62, 'rgba(255,255,255,.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // A few lumpy shoulders make each sprite feel less mathematically clean.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = half + (Math.random() - 0.5) * size * 0.46;
    const y = half + (Math.random() - 0.5) * size * 0.46;
    const r = size * (0.07 + Math.random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
const puffTexture = makePuffTexture(128);

function makeDeckTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#283033'; ctx.fillRect(0, 0, c.width, c.height);
  // Weathered plank streaks.
  for (let i = 0; i < 160; i++) {
    ctx.strokeStyle = `rgba(${190 + Math.random() * 30},${180 + Math.random() * 30},${150 + Math.random() * 20},${0.025 + Math.random() * 0.045})`;
    ctx.lineWidth = 1 + Math.random() * 4;
    const y = Math.random() * c.height;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y + (Math.random() - 0.5) * 4); ctx.stroke();
  }
  // Landing centreline and brackets.
  ctx.strokeStyle = 'rgba(235,220,180,.5)';
  ctx.lineWidth = 5;
  ctx.setLineDash([34, 27]);
  ctx.beginPath(); ctx.moveTo(80, c.height / 2); ctx.lineTo(930, c.height / 2); ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 5; i++) {
    const x = 180 + i * 155;
    ctx.strokeStyle = 'rgba(240,232,210,.28)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, c.height / 2 - 38); ctx.lineTo(x, c.height / 2 + 38); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(240,232,210,.18)';
  ctx.strokeRect(32, 28, c.width - 64, c.height - 56);
  ctx.font = 'bold 100px "Arial Narrow", Impact, sans-serif';
  ctx.fillStyle = 'rgba(240,232,210,.44)';
  ctx.textAlign = 'center';
  ctx.fillText('13', c.width * 0.5, c.height * 0.77);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
const deckTexture = makeDeckTexture();

export { puffTexture, deckTexture };
