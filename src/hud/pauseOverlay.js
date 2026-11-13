import './pauseOverlay.css';
import { pauseMenuState } from './pauseMenu.js';

export function createPauseOverlay({ onResume, onRestart, onMenu }) {
  const root = document.createElement('section');
  root.id = 'roomrun-pause'; root.hidden = true; root.setAttribute('role', 'status');
  root.innerHTML = '<div><h2></h2><p></p><div class="rr-pause-actions"><button type="button" data-resume></button><button type="button" data-restart></button><button type="button" data-menu></button></div><small></small></div>';
  const title = root.querySelector('h2'), message = root.querySelector('p'), note = root.querySelector('small');
  const resume = root.querySelector('[data-resume]'), restart = root.querySelector('[data-restart]');
  const menuButton = root.querySelector('[data-menu]');
  resume.onclick = onResume; restart.onclick = onRestart; menuButton.onclick = onMenu;
  document.body.append(root); let key = '';
  return {
    update(state) {
      const next = JSON.stringify(state); if (next === key) return; key = next;
      const menu = pauseMenuState(state);
      root.hidden = !menu.visible; title.textContent = menu.title; message.textContent = menu.message;
      resume.textContent = menu.resume; restart.textContent = menu.restart; note.textContent = menu.consequence;
      menuButton.textContent = menu.menu; menuButton.hidden = !menu.canMenu;
      resume.hidden = !menu.canResume; restart.hidden = !menu.canRestart;
      note.hidden = !(menu.canRestart || menu.canMenu);
    },
  };
}
