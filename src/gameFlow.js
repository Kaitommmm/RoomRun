// Stick-driven flow, kept pure so it is testable: the small button starts a run
// on the title/caught screens only (an accidental press mid-run does nothing),
// and a stick dropping mid-run pauses until it is back.

/**
 * @param {{ phase: string, action: 'start'|null, sticksLost: boolean }} s
 * @returns {{ start: boolean, paused: boolean }}
 */
export function gameFlow({ phase, action, sticksLost }) {
  return {
    start: action === 'start' && (phase === 'title' || phase === 'caught'),
    paused: phase === 'running' && sticksLost,
  };
}

/**
 * Danger/chase audio targets: quiet while paused for a dropped stick (the sim is frozen).
 * @param {{ running: boolean, paused: boolean, fill: number, chaseActive: boolean }} s
 */
export function audioLevels({ running, paused, fill, chaseActive }) {
  const on = running && !paused;
  return { danger: on ? fill : 0, chase: on && chaseActive };
}

/**
 * Which Bluetooth sticks the current run depends on. A stick counts once it is
 * connected during a run (or was connected when the run started); outside a run
 * the list follows whatever is connected, so switching one off on the title is fine.
 * @param {Set<string>} expected hands from the previous call
 * @param {Record<'L'|'R', { connected: boolean }>} snapshot bluetooth.snapshot()
 * @param {string} phase world.phase
 * @returns {{ expected: Set<string>, lost: string[] }}
 */
export function watchSticks(expected, snapshot, phase) {
  const connected = ['L', 'R'].filter((h) => snapshot[h]?.connected);
  if (phase !== 'running') return { expected: new Set(connected), lost: [] };
  const next = new Set([...expected, ...connected]);
  return { expected: next, lost: [...next].filter((h) => !snapshot[h]?.connected) };
}
