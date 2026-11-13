import { test, expect } from 'vitest';
import { createMotionDetector } from '../src/input/motion.js';
import currentConfig from '../src/config.js';
// Isolated legacy gate/cadence regressions; default effort/lift integration: effortLift.test.js.
const config={...currentConfig,motion:{...currentConfig.motion,jumpMode:'paired',runSpeedMode:'cadence',exerciseEffort:{enabled:false}}};
import { sensitivityFromMotion } from '../src/settings.js';

const identity = v => v;
function rotate([x, y, z]) {
  const a = 0.83, b = 1.12;
  const u = x * Math.cos(a) - y * Math.sin(a), v = x * Math.sin(a) + y * Math.cos(a);
  return [u * Math.cos(b) + z * Math.sin(b), v, -u * Math.sin(b) + z * Math.cos(b)];
}
function simulate({ rotation = identity, axis = 0, amplitude = 10, hands = ['L'], cfg = {}, duration = 3000, value, bias = [0,0,0], hz = 1.4, sampleMs = 20 } = {}) {
  const detector = createMotionDetector({ ...config.motion, ...cfg, runMode: 'allAxes' });
  const frames = [];
  for (let ts = 0; ts < duration; ts += sampleMs) {
    const signal = value ? value(ts) : amplitude * Math.sin(2 * Math.PI * hz * ts / 1000);
    const vector = [0, 0, 0]; vector[axis] = signal;
    const a = rotation(vector).map((x,i)=>x+bias[i]), ag = rotation(vector.map((x, i) => x + (i === 2 ? 9.80665 : 0))).map((x,i)=>x+bias[i]);
    for (const hand of hands) detector.push({ hand, ts, a, ag });
    frames.push(detector.read(ts));
  }
  return { detector, frames, steps: frames.reduce((n, frame) => n + frame.steps, 0) };
}

test('upright, flat, reversed and diagonal sensor mounts count identical motion', () => {
  const transforms = [identity, ([x,y,z]) => [z,y,-x], ([x,y,z]) => [x,z,-y],
    ([x,y,z]) => [-x,-y,z], ([x,y,z]) => [y,z,x], rotate];
  const counts = transforms.map(rotation => simulate({ rotation }).steps);
  expect(counts[0]).toBeGreaterThanOrEqual(7);
  expect(new Set(counts).size).toBe(1);
});

test('motion on X, Y and Z all counts running without a fixed vertical axis', () => {
  const results = [0,1,2].map(axis => simulate({ axis, amplitude: 10 }));
  expect(new Set(results.map(x => x.steps)).size).toBe(1);
  for (const result of results) expect(result.frames.at(-1).speed).toBeGreaterThan(0.9);
});

test('two hands reporting the same swing do not double the step count', () => {
  expect(simulate({ hands: ['L','R'] }).steps).toBe(simulate({ hands: ['L'] }).steps);
});

test('stationary sensors and short isolated impulses do not create running', () => {
  expect(simulate({ value: () => 0 }).steps).toBe(0);
  expect(simulate({ value: t => t % 500 === 0 ? 12 : 0 }).steps).toBe(0);
});

test('a constant offset is stationary; discrete repeated pulses still count', () => {
  expect(simulate({ value: () => 10 }).steps).toBe(0);
  expect(simulate({ value: t => t >= 200 && (t-200) % 500 < 100 ? 10 : 0 }).steps).toBe(6);
});

test('sensitivity changes help smaller swings without changing mounting axes', () => {
  expect(simulate({ amplitude: 5, cfg: { swingThreshold: 12 } }).steps).toBe(0);
  expect(simulate({ amplitude: 5, rotation: rotate, cfg: { swingThreshold: 4 } }).steps).toBeGreaterThan(5);
});

test('gentle movement and short two-sample peaks no longer disappear at the old threshold', () => {
  const gentle = simulate({ amplitude: 3, duration:5000 });
  expect(gentle.steps).toBeGreaterThanOrEqual(10);
  expect(gentle.frames.at(-1).speed).toBeGreaterThan(0.8);
  expect(simulate({ value: t => t >= 200 && (t-200)%500 < 40 ? 5 : 0 }).steps).toBe(6);
});

test('a persistent vector offset cannot permanently disarm the next swing', () => {
  const plain = simulate({ amplitude: 4, duration:5000 });
  const biased = simulate({ amplitude:4, duration:5000, rotation:rotate, bias:[4,-3,2] });
  expect(biased.steps).toBeGreaterThanOrEqual(10);
  expect(Math.abs(biased.steps - plain.steps)).toBeLessThanOrEqual(1);
});

test('slow and fast swinging and lower sample rates remain usable', () => {
  expect(simulate({ amplitude:4, hz:0.65, duration:6000 }).steps).toBeGreaterThanOrEqual(5);
  expect(simulate({ amplitude:4, hz:2.3, duration:5000 }).frames.at(-1).speed).toBeGreaterThan(0.9);
  expect(simulate({ amplitude:4, sampleMs:40, duration:5000 }).steps).toBeGreaterThanOrEqual(9);
});

test('small idle noise does not count even at maximum sensitivity', () => {
  expect(simulate({ amplitude:0.25, hz:7, cfg:{swingThreshold:0.88}, bias:[4,-3,2] }).steps).toBe(0);
});

test('automatic tuning from the received signal recovers gentle upright movement', () => {
  const before = simulate({ amplitude:1.8, rotation:rotate, duration:4000 });
  const sensitivity = sensitivityFromMotion(before.detector.samplesSince(1000));
  expect(sensitivity).toBeGreaterThan(100);
  const after = simulate({ amplitude:1.8, rotation:rotate, duration:4000, cfg:{swingThreshold:2.2 / (sensitivity/100)} });
  expect(after.steps).toBeGreaterThanOrEqual(8);
  expect(after.steps).toBeGreaterThan(before.steps);
});

test('jump remains gravity-based with a rotated mount in the all-axis running mode', () => {
  const { frames } = simulate({ axis: 2, rotation: rotate, hands: ['L','R'], duration: 1000,
    value: t => t >= 100 && t < 180 ? 18 : t >= 180 && t < 430 ? -9 : 0 });
  expect(frames.filter(x => x.jump)).toHaveLength(1);
});

test('reset clears pending steps and stale telemetry is hidden', () => {
  const { detector } = simulate();
  expect(detector.levels(3000).L.magnitude).not.toBeNull();
  expect(detector.levels(4000).L.magnitude).toBeNull();
  detector.reset();
  expect(detector.read(4000)).toEqual({ speed: 0, laneDelta: 0, jump: false, steps: 0 });
  expect(detector.levels(4000).L.magnitude).toBeNull();
});

test('malformed or non-finite samples cannot poison the motion detector', () => {
  const detector = createMotionDetector(config.motion);
  for (const a of [[NaN,0,0], [Infinity,0,0], [1,2], null]) detector.push({ hand:'L', ts:0, a });
  expect(detector.levels(0).L.magnitude).toBeNull();
  expect(detector.read(0).speed).toBe(0);
});
