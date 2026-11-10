// Dev hotkeys. Kept apart from panel.js so tests don't load lil-gui.

const ACTIONS = { KeyC: 'chase', KeyR: 'restart', Backquote: 'panel' };

/** @param {string} code KeyboardEvent.code @returns {'chase'|'restart'|'panel'|null} */
export function hotkeyAction(code) {
  return ACTIONS[code] ?? null;
}
