import { test, expect } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, LEGACY_SETTINGS_KEY, createSettingsStore, normalizeSettings, applyMotionSettings, sensitivityFromMotion } from '../src/settings.js';

test('settings default to exercise motion and validate saved values', () => {
  expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  expect(normalizeSettings({ sensitivity: 10000, music: -1, effects: NaN, vibration: 'false', graphics: 'unknown', runMode: 'unknown' }))
    .toEqual({ ...DEFAULT_SETTINGS, sensitivity: 250, music: 0 });
});

test('upgrading old light-play settings selects exercise without losing audio preferences', () => {
  const storage = { getItem: key => key === LEGACY_SETTINGS_KEY ? JSON.stringify({runMode:'allAxes', sensitivity:240,music:0,effects:40,vibration:false}) : null };
  const result = createSettingsStore(storage).get();
  expect(result).toMatchObject({runMode:'exercise', exerciseSensitivity:100, sensitivity:240,music:0,effects:40,vibration:false});
});

test('exercise sensitivity is independent and cannot weaken the minimum effort indefinitely', () => {
  const config = {motion:{}};
  const settings = normalizeSettings({sensitivity:250,exerciseSensitivity:999});
  applyMotionSettings(config, settings);
  expect(settings.exerciseSensitivity).toBe(120);
  expect(config.motion.exerciseThreshold).toBeCloseTo(4.4 / 1.2);
  const small = Array.from({length:150},(_,i)=>Math.max(0,3*Math.sin(i/8)));
  expect(sensitivityFromMotion(small,'exercise')).toBeNull();
  const jogging = small.map(x=>x*3);
  expect(sensitivityFromMotion(jogging,'exercise')).toBeGreaterThanOrEqual(60);
  expect(sensitivityFromMotion(jogging,'exercise')).toBeLessThanOrEqual(120);
});

test('settings persist, reload and reset without relying on a server', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const store = createSettingsStore(storage);
  const changes = [];
  const unsubscribe = store.subscribe((next, previous) => changes.push({ next, previous }));
  store.set({ sensitivity: 125, music: 0, vibration: false, graphics: 'battery' });
  expect(createSettingsStore(storage).get()).toEqual(store.get());
  expect(JSON.parse(data.get(SETTINGS_KEY)).sensitivity).toBe(125);
  const copy = store.get(); copy.sensitivity = 999;
  expect(store.get().sensitivity).toBe(125);
  store.reset();
  expect(store.get()).toEqual(DEFAULT_SETTINGS);
  expect(changes).toHaveLength(2);
  unsubscribe(); store.set({ music: 50 });
  expect(changes).toHaveLength(2);
});

test('invalid JSON and denied storage fall back to usable session settings', () => {
  const store = createSettingsStore({ getItem: () => '{', setItem: () => { throw new Error('denied'); } });
  expect(store.get()).toEqual(DEFAULT_SETTINGS);
  store.set({ runMode:'vertical' });
  expect(store.get().runMode).toBe('vertical');
  expect(store.saved).toBe(false);
});

test('motion settings change sensitivity while keeping the jump threshold intact', () => {
  const config = { motion: { jumpThreshold: 16 } };
  applyMotionSettings(config, { ...DEFAULT_SETTINGS, sensitivity: 150 });
  expect(config.motion.swingThreshold).toBeCloseTo(2.2 / 1.5);
  expect(config.motion.bounceStepThreshold).toBeCloseTo(8 / 1.5);
  expect(config.motion.jumpThreshold).toBe(16);
});

test('automatic sensitivity rejects no data, stationary offsets and isolated spikes', () => {
  for (const samples of [[], [1,2,3], Array(150).fill(0), Array(150).fill(4), [...Array(149).fill(0),50]])
    expect(sensitivityFromMotion(samples)).toBeNull();
});

test('automatic sensitivity fits gentle movement and clamps unusually strong motion', () => {
  const gentle = Array.from({ length:150 }, (_,i) => Math.abs(2 * Math.sin(i / 10)));
  expect(sensitivityFromMotion(gentle)).toBeGreaterThan(150);
  expect(sensitivityFromMotion(gentle)).toBeLessThanOrEqual(250);
  expect(sensitivityFromMotion(gentle.map(x => x * 20))).toBe(50);
});
