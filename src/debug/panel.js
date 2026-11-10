// Tuning panel (Backquote). Folders mirror config sections; the sim, cadence
// and render code read config every step, so edits apply live.
import GUI from 'lil-gui';

const SECTIONS = ['cadence', 'player', 'chaser', 'chase', 'track', 'juice', 'motion'];

/** Add every number/boolean in `obj`; nested objects become sub-folders. */
function addAll(folder, obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number' || typeof value === 'boolean') folder.add(obj, key);
    else if (value && typeof value === 'object' && !Array.isArray(value)) addAll(folder.addFolder(key).close(), value);
  }
}

/** Copy values back in place, so nested objects keep their identity (lil-gui binds to them). */
function restore(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) restore(target[key], value);
    else target[key] = structuredClone(value);
  }
}

/**
 * @param {any} config
 * @param {{ fps: number, rttMs: Record<'L'|'R', number|null>, upPeaks?: () => Record<'L'|'R', number> }} stats live object, read on update()
 */
export function createDebugPanel(config, stats) {
  const gui = new GUI({ title: 'SoiP debug (`)' });
  gui.hide();
  const view = { fps: '', phones: '', rttL: '', rttR: '', push: '' };
  const live = gui.addFolder('live');
  const readouts = [
    live.add(view, 'fps'), live.add(view, 'phones'),
    live.add(view, 'rttL').name('RTT L (ms)'), live.add(view, 'rttR').name('RTT R (ms)'),
    live.add(view, 'push').name('jump push L / R'),
  ];
  for (const c of readouts) c.disable();

  const defaults = structuredClone(Object.fromEntries(SECTIONS.map((s) => [s, config[s]])));
  for (const section of SECTIONS) {
    if (config[section] && Object.keys(config[section]).length) addAll(gui.addFolder(section).close(), config[section]);
  }
  gui.add({
    copy: () => navigator.clipboard?.writeText(JSON.stringify(Object.fromEntries(SECTIONS.map((s) => [s, config[s]])), null, 2)),
  }, 'copy').name('copy tuned values (JSON)');
  gui.add({
    reset: () => {
      for (const s of SECTIONS) if (defaults[s]) restore(config[s], defaults[s]);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
  }, 'reset').name('reset to defaults');

  let shown = false;
  return {
    toggle() {
      shown = !shown;
      gui.show(shown);
    },
    update() {
      if (!shown) return;
      const rtt = (v) => (v == null ? '—' : v.toFixed(0));
      view.fps = stats.fps.toFixed(0);
      view.phones = `${['L', 'R'].filter((h) => stats.rttMs[h] != null).length} / 2`;
      view.rttL = rtt(stats.rttMs.L);
      view.rttR = rtt(stats.rttMs.R);
      const up = stats.upPeaks?.();
      view.push = up ? `${up.L.toFixed(0)} / ${up.R.toFixed(0)}` : '—';
      for (const c of readouts) c.updateDisplay();
    },
  };
}
