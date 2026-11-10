export const SETTINGS_KEY = 'roomrun.settings.v2';
export const LEGACY_SETTINGS_KEY = 'roomrun.settings.v1';
export const DEFAULT_SETTINGS = Object.freeze({
  runMode: 'exercise', sensitivity: 100, exerciseSensitivity: 100, music: 75, effects: 100,
  vibration: true, graphics: 'standard',
});

export function normalizeSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const number = (key, min, max) => typeof value[key] === 'number' && Number.isFinite(value[key])
    ? Math.min(max, Math.max(min, Math.round(value[key]))) : DEFAULT_SETTINGS[key];
  return {
    runMode: ['exercise', 'allAxes', 'vertical'].includes(value.runMode) ? value.runMode : 'exercise',
    exerciseSensitivity: number('exerciseSensitivity', 60, 120),
    sensitivity: number('sensitivity', 50, 250), music: number('music', 0, 100), effects: number('effects', 0, 100),
    vibration: typeof value.vibration === 'boolean' ? value.vibration : true,
    graphics: value.graphics === 'battery' ? 'battery' : 'standard',
  };
}

export function applyMotionSettings(config, settings) {
  config.motion.runMode = settings.runMode;
  const gain = settings.sensitivity / 100;
  config.motion.swingThreshold = 2.2 / gain;
  config.motion.bounceStepThreshold = 8 / gain;
  config.motion.exerciseThreshold = 4.4 / ((settings.exerciseSensitivity ?? 100) / 100);
}

export function sensitivityFromMotion(samples, mode = 'allAxes') {
  const sorted = samples.filter(x => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (sorted.length < 60) return null;
  const high = sorted[Math.floor((sorted.length - 1) * 0.9)];
  const low = sorted[Math.floor((sorted.length - 1) * 0.1)];
  if (mode === 'exercise') {
    // Calibration cannot turn small arm movements into valid exercise pulses.
    if (high < 3.8 || high - low < 1.6) return null;
    const target = Math.max(4.4 / 1.2, high * 0.7);
    return Math.min(120, Math.max(60, Math.round((4.4 / target * 100) / 5) * 5));
  }
  if (high < 1 || high - low < 0.7) return null;
  const target = Math.max(0.88, high * 0.55);
  return Math.min(250, Math.max(50, Math.round((2.2 / target * 100) / 5) * 5));
}

export function createSettingsStore(storage) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  let values = { ...DEFAULT_SETTINGS };
  try {
    const current = storage?.getItem(SETTINGS_KEY);
    if (current) values = normalizeSettings(JSON.parse(current));
    else {
      const legacy = JSON.parse(storage?.getItem(LEGACY_SETTINGS_KEY) || 'null');
      values = normalizeSettings({ ...legacy, runMode:'exercise', exerciseSensitivity:100 });
    }
  } catch { /* defaults */ }
  const listeners = new Set();
  let saved = !!storage;
  const get = () => ({ ...values });
  return {
    get,
    get saved() { return saved; },
    set(patch) {
      const previous = get();
      values = normalizeSettings({ ...values, ...patch });
      try { storage?.setItem(SETTINGS_KEY, JSON.stringify(values)); saved = !!storage; } catch { saved = false; }
      for (const listener of listeners) listener(get(), previous);
    },
    reset() { this.set(DEFAULT_SETTINGS); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
