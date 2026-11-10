// Dev hotkeys. Kept apart from panel.js so tests don't load lil-gui.

const ACTIONS = { KeyC: 'chase', KeyR: 'restart', Backquote: 'panel', KeyH: 'hud' };

/** @param {string} code KeyboardEvent.code @returns {'chase'|'restart'|'panel'|'hud'|null} */
export function hotkeyAction(code) {
  return ACTIONS[code] ?? null;
}
