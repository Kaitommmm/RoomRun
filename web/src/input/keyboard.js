// Keyboard source: alternate A / D = steps (tap rate sets speed, like arm-swing
// peaks), arrows = lane, Space = jump. Auto-repeat and the same key mashed
// don't count as running.

const STEP_KEYS = new Set(['KeyA', 'KeyD']);
const PREVENT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * @param {{ cadence: ReturnType<typeof import('./cadence.js').createCadence> }} opts
 */
export function createKeyboardSource({ cadence }) {
  /** @type {string|null} */
  let lastStepKey = null;
  /** @type {-1|0|1} */
  let laneDelta = 0;
  let jump = false;

  function handleKey(code, isRepeat, nowMs) {
    if (isRepeat) return;
    if (STEP_KEYS.has(code)) {
      if (code !== lastStepKey) cadence.addStep(nowMs);
      lastStepKey = code;
    } else if (code === 'ArrowLeft') laneDelta = -1;
    else if (code === 'ArrowRight') laneDelta = 1;
    else if (code === 'Space') jump = true;
  }

  return {
    handleKey,
    reset() { lastStepKey = null; laneDelta = 0; jump = false; cadence.reset(); },
    read(nowMs) {
      const frame = { speed: cadence.speed(nowMs), laneDelta, jump, steps: cadence.takeSteps() };
      laneDelta = 0;
      jump = false;
      return frame;
    },
    /** @param {EventTarget} target @returns {() => void} detach */
    attach(target) {
      const onKey = (/** @type {KeyboardEvent} */ e) => {
        if (e.target?.closest?.('input, select, textarea, button, dialog[open], [contenteditable=true]')) return;
        if (/** @type {any} */ (e.target)?.tagName === 'INPUT') return; // typing in the debug panel
        if (PREVENT.has(e.code)) e.preventDefault();
        handleKey(e.code, e.repeat, performance.now());
      };
      target.addEventListener('keydown', onKey);
      return () => target.removeEventListener('keydown', onKey);
    },
  };
}
