import { test, expect } from 'vitest';
import { createMotionDetector as createDetector } from '../src/input/motion.js';
import currentConfig from '../src/config.js';
// Isolated legacy gate/cadence regressions; default effort/lift integration: effortLift.test.js.
const config={...currentConfig,motion:{...currentConfig.motion,jumpMode:'paired',runSpeedMode:'cadence',exerciseEffort:{enabled:false}}};
import { createCadence } from '../src/input/cadence.js';

// Preserve coverage for the selectable original vertical/bounce mode.
// The default all-axis mode is covered by motionAnyDirection.test.js.
const createMotionDetector = (cfg = config.motion, cadence) => createDetector({ ...cfg, runMode: 'vertical' }, cadence);

const HZ = 60;
const DT = 1000 / HZ;
const V = 1; // config.motion.axes.vertical (y)
const LAT = 0; // config.motion.axes.lateral (x)

/**
 * Feed both hands at 60 Hz from t0 for `ms`, reading a frame each sample.
 * fn(hand, t) -> { v, lat } acceleration in m/s^2 (gravity removed).
 * Returns every frame read, with its time.
 */
function drive(det, t0, ms, fn) {
  const frames = [];
  for (let t = t0; t < t0 + ms; t += DT) {
    for (const hand of ['L', 'R']) {
      const { v = 0, lat = 0, air = false } = fn(hand, t) ?? {};
      const a = [0, 0, 0];
      a[V] = v;
      a[LAT] = lat * (config.motion.lateralSign[hand] ?? 1); // device frame: mirrored grip flips a hand
      const ag = air ? [0.5, 0.5, 0.5] : [a[0], a[1] + 9.8, a[2]]; // airborne: gravity reads ~0
      det.push({ hand, ts: t, a, ag });
    }
    frames.push({ t, ...det.read(t) });
  }
  return frames;
}

/** Opposite-phase arm swing: L and R vertical acceleration are mirror images. */
const run = (hz, amp = 10) => (hand, t) => {
  const s = amp * Math.sin(2 * Math.PI * hz * (t / 1000));
  return { v: hand === 'L' ? s : -s, lat: 0.5 * s };
};
/** A short spike on one axis between [from, from + len) ms. */
const spike = (from, len, value) => (t) => (t >= from && t < from + len ? value : 0);

const sum = (frames, f) => frames.reduce((n, x) => n + f(x), 0);
/** Arm-flick lanes are off by default (lanes come from phone taps); these tests switch them on. */
const lanesOn = (extra = {}) => createMotionDetector({ ...config.motion, motionLanes: true, ...extra });

/** The old arm-swing step counter (bounceSteps off). */
const swingSteps = (extra = {}) => createMotionDetector({ ...config.motion, bounceSteps: false, ...extra }, createCadence());

test('old steps: opposite-phase arm swing at 2.5 Hz per hand -> ~5 steps/s, full speed, no lane, no jump', () => {
  const det = swingSteps();
  const frames = drive(det, 0, 3000, run(2.5));
  const steps = sum(frames, (f) => f.steps);
  expect(steps).toBeGreaterThanOrEqual(13);
  expect(steps).toBeLessThanOrEqual(16); // one step per hand per arm cycle, not one per swing end
  expect(frames.at(-1).speed).toBeGreaterThan(0.95);
  expect(frames.some((f) => f.laneDelta !== 0)).toBe(false);
  expect(frames.some((f) => f.jump)).toBe(false);
});

test('old steps: slow arm swing gives a slower speed than a fast one', () => {
  const slow = drive(swingSteps(), 0, 3000, run(1)).at(-1).speed;
  const fast = drive(swingSteps(), 0, 3000, run(2.5)).at(-1).speed;
  expect(slow).toBeGreaterThan(0.1);
  expect(slow).toBeLessThan(fast - 0.3);
});

const leap = (t, at = 100, peak = 18) => {
  const x = t - at;
  return { v: x >= 0 && x < 80 ? peak : x >= 80 && x < 330 ? -9 : x >= 330 && x < 390 ? 30 : 0,
    air: x >= 80 && x < 330 };
};

test('airborne-like readings without a preceding lift never jump', () => {
  const det = createMotionDetector(config.motion);
  const frames = drive(det, 0, 1000, (_, t) => ({ v: t >= 100 && t < 350 ? -9 : 0, air: t >= 100 && t < 350 }));
  expect(frames.some(f => f.jump)).toBe(false);
});

test('one hand reading airborne alone is not a jump', () => {
  const det = createMotionDetector(config.motion);
  const air = spike(100, 250, true);
  const frames = drive(det, 0, 1000, (hand, t) => ({ air: hand === 'L' && air(t) }));
  expect(frames.some((f) => f.jump)).toBe(false);
});

test('a dip shorter than freefallMs is not a jump', () => {
  const det = createMotionDetector(config.motion);
  const air = spike(100, 80, true);
  const frames = drive(det, 0, 1000, (hand, t) => ({ air: air(t) }));
  expect(frames.some((f) => f.jump)).toBe(false);
});

test('complete jump sequence works with tilted phones', () => {
  const det = createMotionDetector(config.motion); const up = [.707, 0, -.707];
  for (let t = 0; t < 1000; t += DT) {
    const { v } = leap(t);
    for (const hand of ['L', 'R']) {
      const a = up.map(u => u * v);
      det.push({ hand, ts:t, a, ag:a.map((x,i) => x + up[i] * 9.8) });
    }
    if (det.read(t).jump) return;
  }
  throw new Error('No confirmed tilted jump');
});

test('a shared push needs repeated paired samples, without a flight requirement', () => {
  const frames = drive(createMotionDetector(config.motion), 0, 1000, (_, t) => leap(t));
  const jumps = frames.filter(f => f.jump);
  expect(jumps).toHaveLength(1); expect(jumps[0].t).toBeGreaterThanOrEqual(120); expect(jumps[0].t).toBeLessThan(180);
  expect(jumps[0].t).toBeLessThan(430);
});

test('landing thump after a confirmed jump is not a second jump', () => {
  const frames = drive(createMotionDetector(config.motion), 0, 1500, (_, t) => leap(t));
  expect(frames.filter(f => f.jump)).toHaveLength(1);
});

test('one hand pushing up alone is not a jump', () => {
  const det = createMotionDetector(config.motion);
  const push = spike(100, 50, 18);
  const frames = drive(det, 0, 1000, (hand, t) => ({ v: hand === 'L' ? push(t) : 0 }));
  expect(frames.some((f) => f.jump)).toBe(false);
});

test('one paired spike at any orientation does not jump', () => {
  const det = createMotionDetector(config.motion); const up = [.707, 0, -.707];
  for (let t = 0; t < 1000; t += DT) {
    const v = t >= 100 && t < 115 ? 30 : 0;
    for (const hand of ['L','R']) {
      const a = up.map(u => u * v); det.push({ hand, ts:t, a, ag:a.map((x,i) => x + up[i] * 9.8) });
    }
    expect(det.read(t).jump).toBe(false);
  }
});

/** Running bounce: both hands rise and fall together, once per step (~2.7 Hz), peak `amp`. */
const bounce = (amp, hz = 2.7) => (t) => amp * Math.sin(2 * Math.PI * hz * (t / 1000));

test('running bounce just over jumpThreshold is not a jump (real log 2026-10-28: 15-18 per step)', () => {
  const det = createMotionDetector(config.motion);
  const b = bounce(19);
  // a run starts gently: the bounce grows over the first second
  const frames = drive(det, 0, 5000, (hand, t) => ({ v: b(t) * Math.min(1, t / 1000) }));
  expect(frames.some((f) => f.jump)).toBe(false);
});

test('complete real jump out of running still fires', () => {
  const b = bounce(17);
  const frames = drive(createMotionDetector(config.motion), 0, 3700, (_,t) => t < 2900 ? { v:b(t) * Math.min(1,t/1000) } : leap(t,3000,28));
  const jumps = frames.filter(f => f.jump); expect(jumps).toHaveLength(1); expect(jumps[0].t).toBeGreaterThanOrEqual(3020);
});

test('equal moderate jumps remain detectable after landing and settling', () => {
  const frames = drive(createMotionDetector(config.motion), 0, 1900, (_,t) => t < 1000 ? leap(t,100,18) : leap(t,1200,18));
  expect(frames.filter(f => f.jump)).toHaveLength(2);
});

test('bounce steps: running bounce at 2.7 Hz -> one step per bounce, full speed, no jump', () => {
  const det = createMotionDetector(config.motion);
  const b = bounce(15);
  const frames = drive(det, 0, 3000, (hand, t) => ({ v: b(t) * Math.min(1, t / 1000) }));
  const steps = sum(frames, (f) => f.steps);
  expect(steps).toBeGreaterThanOrEqual(6);
  expect(steps).toBeLessThanOrEqual(9); // both hands ride one bounce: counted once
  expect(frames.at(-1).speed).toBeGreaterThan(0.95);
  expect(frames.some((f) => f.jump)).toBe(false);
});

test('bounce steps ignore phone tilt and arm twist (only world-up counts)', () => {
  const det = createMotionDetector(config.motion);
  let steps = 0;
  for (let t = 0; t < 3000; t += DT) {
    const u = 15 * Math.sin(2 * Math.PI * 2.7 * (t / 1000));
    const ang = t / 100; // phone spinning in the hand
    for (const hand of ['L', 'R']) {
      const up = [Math.sin(ang), Math.cos(ang), 0]; // gravity direction in the device frame keeps turning
      const side = 10 * Math.sin(t / 50); // sideways arm whip, no vertical part
      const a = up.map((x, i) => x * u + [Math.cos(ang), -Math.sin(ang), 0][i] * side);
      det.push({ hand, ts: t, a, ag: a.map((x, i) => x + up[i] * 9.8) });
    }
    steps += det.read(t).steps;
  }
  expect(steps).toBeGreaterThanOrEqual(7);
  expect(steps).toBeLessThanOrEqual(9);
});

test('motion lanes are off by default: a two-hand flick does nothing', () => {
  const det = createMotionDetector(config.motion);
  const go = spike(100, 50, -18);
  const frames = drive(det, 0, 1000, (hand, t) => ({ lat: go(t) }));
  expect(frames.some((f) => f.laneDelta !== 0)).toBe(false);
});

test('both hands spike left together -> laneDelta -1 once', () => {
  const det = lanesOn();
  // accelerate left, then the stop: a right-going spike 120 ms later must not count
  const go = spike(100, 50, -18), stop = spike(220, 50, 18);
  const frames = drive(det, 0, 1000, (hand, t) => ({ lat: go(t) + stop(t) }));
  expect(frames.filter((f) => f.laneDelta !== 0).map((f) => f.laneDelta)).toEqual([-1]);
  expect(frames.some((f) => f.jump)).toBe(false);
});

test('lateralSign flips one hand whose phone is held the other way round', () => {
  const det = lanesOn({ lateralSign: { L: 1, R: -1 } });
  const go = spike(100, 50, 18);
  const lanes = [];
  for (let t = 0; t < 1000; t += DT) {
    for (const hand of ['L', 'R']) {
      const a = [0, 0, 0];
      a[LAT] = hand === 'L' ? go(t) : -go(t); // raw device values: mirrored phones read opposite
      det.push({ hand, ts: t, a });
    }
    const { laneDelta } = det.read(t);
    if (laneDelta) lanes.push(laneDelta);
  }
  expect(lanes).toEqual([1]);
});

test('hands spike sideways in opposite directions -> no lane', () => {
  const det = lanesOn();
  const go = spike(100, 50, 18);
  const frames = drive(det, 0, 1000, (hand, t) => ({ lat: hand === 'L' ? -go(t) : go(t) }));
  expect(frames.some((f) => f.laneDelta !== 0)).toBe(false);
});

test('second swipe within cooldown ignored', () => {
  const det = lanesOn();
  const a = spike(100, 50, -18), b = spike(300, 50, -18), c = spike(800, 50, -18);
  const frames = drive(det, 0, 1200, (hand, t) => ({ lat: a(t) + b(t) + c(t) }));
  // 300 ms is inside the 350 ms cooldown; 800 ms is a fresh swipe
  expect(frames.filter((f) => f.laneDelta !== 0).map((f) => f.t > 700)).toEqual([false, true]);
});

test('speed holds through a swipe', () => {
  const det = lanesOn();
  drive(det, 0, 3000, run(2.5));
  const before = det.read(3000).speed;
  const go = spike(3000, 50, -18);
  // the swipe replaces the swing for a moment: no running signal at all
  const frames = drive(det, 3000, 300, (hand, t) => ({ lat: go(t) }));
  expect(frames.some((f) => f.laneDelta === -1)).toBe(true);
  expect(Math.abs(frames.at(-1).speed - before)).toBeLessThan(0.05);
});

test('steps right after a gesture are ignored (the swipe stop is not a step)', () => {
  const det = lanesOn();
  const go = spike(100, 50, -18), stop = spike(220, 50, 18);
  // vertical wobble during the swipe that would read as steps
  const wobble = spike(300, 30, 9); // after the stop spike, still inside suppressStepsAfterGestureMs
  const frames = drive(det, 0, 600, (hand, t) => ({ lat: go(t) + stop(t), v: wobble(t) }));
  const after = frames.filter((f) => f.t >= 150);
  expect(sum(after, (f) => f.steps)).toBe(0);
});

test('hold keeps speed when the swing already broke before the swipe (wind-up)', () => {
  const det = swingSteps({ motionLanes: true });
  drive(det, 0, 2800, run(2.5));
  const before = det.read(2800).speed;
  // 400 ms of still hands winding up, then the swipe; read 400 ms after it,
  // past the cadence's own 700 ms stop-grace but inside the 600 ms gesture hold
  const go = spike(3200, 50, -18);
  const frames = drive(det, 2800, 800, (hand, t) => ({ lat: go(t) }));
  expect(frames.some((f) => f.laneDelta === -1)).toBe(true);
  expect(frames.at(-1).speed).toBeGreaterThan(before - 0.05);
});
