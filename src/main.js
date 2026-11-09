import { Game } from './game/Game.js';
import { ui } from './ui/hud.js';
import { $ } from './core/utils.js';

const game = new Game();

requestAnimationFrame(() => {
  setTimeout(() => ui.loading.classList.add('done'), 240);
});

window.addEventListener('error', (e) => {
  if (ui.loading && !ui.loading.classList.contains('done')) {
    const err = $('#loaderError');
    if (err) {
      err.classList.remove('hidden');
      err.textContent = `Unable to launch the sim: ${e.message || 'script error'}. Check the browser console, then reload.`;
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.started && !game.paused && game.mode !== 'gameover') {
    game.togglePause(true);
  }
});

if (import.meta.env.DEV) {
  Object.defineProperty(window, '__WOF', { value: game, configurable: false, writable: false });
}
