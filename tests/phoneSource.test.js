import { test, expect } from 'vitest';
import { createMotionDetector as createDetector } from '../src/input/motion.js';
import config from '../src/config.js';
import { createPhoneSource } from '../src/input/phoneSource.js';

const DT = 1000 / 60;
// These fixtures test transport clocks using the selectable arm-swing mode.
// Exercise gating has its own motionExercise.test.js integration coverage.
const createMotionDetector = () => createDetector({ ...config.motion, runMode:'allAxes' });
/** Phone sample in the phone's own clock (`ts`), received at game time `recv`. */
const m = (hand, ts, v) => ({ t: 'm', hand, ts, a: [0, v, 0], ag: [0, v + 9.8, 0], r: [0, 0, 0] });

/** Opposite-phase 2.5 Hz arm swing from both phones; phone clocks are far off the game clock. */
function swing(src, from, ms, clock = { L: 5e6, R: -3e4 }) {
  for (let t = from; t < from + ms; t += DT) {
    const s = 10 * Math.sin(2 * Math.PI * 2.5 * (t / 1000));
    src.handleMessage(m('L', t + clock.L, s), t + 30); // ~30 ms network delay
    src.handleMessage(m('R', t + clock.R, -s), t + 30);
    src.read(t + 30);
  }
}

test('phone source runs from motion messages despite phone clocks far from the game clock', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  swing(src, 0, 3000);
  expect(src.connected(3030)).toBe(true);
  expect(src.read(3030).speed).toBeGreaterThan(0.9);
});

test('phone source: no samples for 1.2 s -> connected false, speed falls toward 0', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  swing(src, 0, 3000);
  const before = src.read(3030).speed;
  let after = before;
  for (let t = 3030; t <= 4230; t += DT) after = src.read(t).speed;
  expect(src.connected(4230)).toBe(false);
  expect(after).toBeLessThan(before * 0.5);
  for (let t = 4230; t <= 6000; t += DT) after = src.read(t).speed;
  expect(after).toBeLessThan(0.02);
});

test('never connected is not "lost"; connected then silent is', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  expect(src.connected(0)).toBe(false);
  expect(src.everConnected).toBe(false);
  src.handleMessage({ t: 'hello', role: 'phone', hand: 'L' }, 0);
  src.handleMessage(m('L', 0, 0), 10);
  expect(src.everConnected).toBe(true);
});

test('rtt messages fill rtt per hand; junk is ignored', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  expect(src.rtt).toEqual({ L: null, R: null });
  src.handleMessage({ t: 'rtt', hand: 'R', ms: 48 }, 0);
  src.handleMessage({ t: 'rtt', hand: 'X', ms: 1 }, 0);
  src.handleMessage({ t: 'm', hand: 'L', ts: 1, a: null }, 0); // phone without linear acceleration
  src.handleMessage(null, 0);
  expect(src.rtt).toEqual({ L: null, R: 48 });
});

/** Swing with explicit phone clocks per hand, from game time `from` for `ms`. */
function swingWith(src, from, ms, clockOf) {
  for (let t = from; t < from + ms; t += DT) {
    const s = 10 * Math.sin(2 * Math.PI * 2.5 * (t / 1000));
    src.handleMessage(m('L', t + clockOf('L', t), s), t + 30);
    src.handleMessage(m('R', t + clockOf('R', t), -s), t + 30);
    src.read(t + 30);
  }
}

test('phone page reload (clock restarts, hello re-sent) keeps running working', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  swingWith(src, 0, 3000, () => 1e6);
  // the reloaded page's performance.now() starts near 0 again
  src.handleMessage({ t: 'hello', role: 'phone', hand: 'L' }, 3030);
  src.handleMessage({ t: 'hello', role: 'phone', hand: 'R' }, 3030);
  swingWith(src, 3000, 3000, () => -3000);
  expect(src.read(6030).speed).toBeGreaterThan(0.9);
});

test('phone clock stalls during a screen lock (no reconnect) -> re-baselines, running works again', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  swingWith(src, 0, 3000, () => 1e6);
  // after the lock, samples carry timestamps 5 s behind where they used to be
  swingWith(src, 3000, 3000, () => 1e6 - 5000);
  expect(src.read(6030).speed).toBeGreaterThan(0.9);
});

test('one phone of two goes silent -> not connected (HUD shows the drop)', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  swingWith(src, 0, 2000, () => 0);
  for (let t = 2000; t < 3300; t += DT) src.handleMessage(m('L', t, 0), t + 30);
  expect(src.connected(3300)).toBe(false);
});

test('a sample with an absurd timestamp cannot wreck the clock', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  swingWith(src, 0, 1500, () => 0);
  src.handleMessage(m('L', 1e15, 0), 1530);
  src.handleMessage(m('R', Number.NaN, 0), 1530);
  swingWith(src, 1500, 1500, () => 0);
  expect(src.read(3030).speed).toBeGreaterThan(0.9);
});

test('tap on the left phone = lane left, right phone = lane right, once each', () => {
  const src = createPhoneSource({ detector: createMotionDetector() });
  src.handleMessage({ t: 'tap', hand: 'L', ts: 1 }, 100);
  expect(src.read(100).laneDelta).toBe(-1);
  expect(src.read(116).laneDelta).toBe(0);
  src.handleMessage({ t: 'tap', hand: 'R', ts: 2 }, 200);
  expect(src.read(200).laneDelta).toBe(1);
  src.handleMessage({ t: 'tap', hand: 'X', ts: 3 }, 300);
  expect(src.read(300).laneDelta).toBe(0);
});
