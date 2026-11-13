import { test, expect } from 'vitest';
import config from '../src/config.js';
import { slowMoTarget, createHitStop } from '../src/render/timeScale.js';

const w = (phase, gap, playerMps, chaserMps = 6) => ({ phase, chaser: { gap, speedMps: chaserMps }, player: { speedMps: playerMps } });

test('slow-mo in the last second before a catch', () => {
  expect(slowMoTarget(w('running', 3, 0))).toBe(config.juice.slowMoScale); // 0.5 s to catch
});
test('no slow-mo when the catch is more than a second away', () => {
  expect(slowMoTarget(w('running', 3.9, 3))).toBe(1); // 1.3 s
});
test('no slow-mo while escaping or holding the gap', () => {
  expect(slowMoTarget(w('running', 1, 6))).toBe(1);
  expect(slowMoTarget(w('running', 1, 12))).toBe(1);
});
test('no slow-mo when far, even if closing fast', () => {
  expect(slowMoTarget(w('running', 6, 0, 12))).toBe(1);
});
test('no slow-mo outside running', () => {
  expect(slowMoTarget(w('caught', 0, 0))).toBe(1); expect(slowMoTarget(w('title', 1, 0))).toBe(1);
});

test('hit-stop freezes ~0.08 s', () => {
  const h = createHitStop(config);
  h.trigger();
  expect(h.factor(0.05)).toBe(0); expect(h.factor(0.05)).toBe(0); expect(h.factor(0.05)).toBe(1);
});
test('reset ends hit-stop', () => {
  const h = createHitStop(config);
  h.trigger(); h.reset();
  expect(h.factor(0.01)).toBe(1);
});
test('no trigger, no freeze', () => {
  expect(createHitStop(config).factor(0.016)).toBe(1);
});
