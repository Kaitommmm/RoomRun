import { test, expect } from 'vitest';
import { createCadence } from '../src/input/cadence.js';
import { createInputHub } from '../src/input/hub.js';
import { createKeyboardSource } from '../src/input/keyboard.js';

test('alternating A/D counts steps and raises speed', () => {
  const k = createKeyboardSource({ cadence: createCadence() });
  for (let i = 0, t = 0; i < 12; i++, t += 250) k.handleKey(i % 2 ? 'KeyD' : 'KeyA', false, t);
  const f = k.read(2750); expect(f.steps).toBe(12); expect(f.speed).toBeGreaterThan(0);
});

test('same key mashed counts once', () => {
  const k = createKeyboardSource({ cadence: createCadence() });
  for (let t = 0; t < 1000; t += 100) k.handleKey('KeyA', false, t);
  expect(k.read(1000).steps).toBe(1);
});

test('auto-repeat ignored', () => {
  const k = createKeyboardSource({ cadence: createCadence() });
  k.handleKey('KeyA', false, 0); k.handleKey('KeyD', true, 50);
  expect(k.read(60).steps).toBe(1);
});

test('held key auto-repeat never raises speed', () => {
  const k = createKeyboardSource({ cadence: createCadence() });
  k.handleKey('KeyA', false, 0);
  for (let t = 30; t < 3000; t += 30) k.handleKey('KeyA', true, t);
  let f; for (let t = 0; t <= 3000; t += 16) f = k.read(t);
  expect(f.speed).toBe(0);
});

test('lane and jump are one-shot', () => {
  const k = createKeyboardSource({ cadence: createCadence() });
  k.handleKey('ArrowLeft', false, 0); k.handleKey('Space', false, 0);
  expect(k.read(1)).toMatchObject({ laneDelta: -1, jump: true });
  expect(k.read(2)).toMatchObject({ laneDelta: 0, jump: false });
});

test('ArrowRight is +1', () => {
  const k = createKeyboardSource({ cadence: createCadence() });
  k.handleKey('ArrowRight', false, 0); expect(k.read(1).laneDelta).toBe(1);
});

test('attach listens to keydown, prevents scroll keys, detaches', () => {
  const k = createKeyboardSource({ cadence: createCadence() });
  const target = new EventTarget();
  const press = (code, repeat = false) => {
    const e = new Event('keydown', { cancelable: true }); Object.assign(e, { code, repeat }); target.dispatchEvent(e); return e;
  };
  const detach = k.attach(target);
  expect(press('Space').defaultPrevented).toBe(true);
  expect(press('ArrowLeft').defaultPrevented).toBe(true);
  expect(press('KeyA').defaultPrevented).toBe(false);
  expect(k.read(performance.now())).toMatchObject({ laneDelta: -1, jump: true, steps: 1 });
  detach(); press('Space');
  expect(k.read(performance.now()).jump).toBe(false);
});

test('hub: max speed, first lane, any jump, summed steps', () => {
  const s = (f) => ({ read: () => f }); const hub = createInputHub();
  hub.add(s({ speed: 0.3, laneDelta: 0, jump: false, steps: 1 })); hub.add(s({ speed: 0.8, laneDelta: 1, jump: true, steps: 2 }));
  expect(hub.read(0)).toEqual({ speed: 0.8, laneDelta: 1, jump: true, steps: 3 });
});

test('hub reads every source each call so one-shots never leak to the next read', () => {
  const k1 = createKeyboardSource({ cadence: createCadence() });
  const k2 = createKeyboardSource({ cadence: createCadence() });
  const hub = createInputHub(); hub.add(k1); hub.add(k2);
  k1.handleKey('ArrowLeft', false, 0); k2.handleKey('ArrowRight', false, 0);
  expect(hub.read(1).laneDelta).toBe(-1);
  expect(hub.read(2).laneDelta).toBe(0);
});

test('empty hub is a standing frame', () => {
  expect(createInputHub().read(0)).toEqual({ speed: 0, laneDelta: 0, jump: false, steps: 0 });
});

test('keys typed into a text field (debug panel) never steer or jump', () => {
  const k = createKeyboardSource({ cadence: createCadence() });
  const field = Object.assign(new EventTarget(), { tagName: 'INPUT' });
  k.attach(field);
  const e = new Event('keydown', { cancelable: true }); Object.assign(e, { code: 'Space', repeat: false });
  field.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(false);
  expect(k.read(performance.now()).jump).toBe(false);
});
