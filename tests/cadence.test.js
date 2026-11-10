import { test, expect } from 'vitest';
import { createCadence } from '../src/input/cadence.js';

const tap = (c, everyMs, untilMs, t0 = 0) => { for (let t = t0; t <= untilMs; t += everyMs) c.addStep(t); };
const settle = (c, from, to) => { for (let t = from; t <= to; t += 16) c.speed(t); };

test('4 steps/s settles at full speed', () => {
  const c = createCadence(); tap(c, 250, 3000);
  settle(c, 0, 3000); expect(c.speed(3000)).toBeGreaterThan(0.95);
});

test('2 steps/s settles near 1/3', () => {
  const c = createCadence(); tap(c, 500, 4000);
  settle(c, 0, 4000); expect(c.speed(4000)).toBeCloseTo(0.33, 1);
});

test('1 step/s or slower is speed 0', () => {
  const c = createCadence(); tap(c, 1000, 6000);
  settle(c, 0, 6000); expect(c.speed(6000)).toBeLessThan(0.05);
});

test('no steps for 1.5 s after running -> near 0', () => {
  const c = createCadence(); tap(c, 250, 2000);
  settle(c, 0, 3500); expect(c.speed(3500)).toBeLessThan(0.05);
});

test('holdFor keeps speed through a gesture gap', () => {
  const c = createCadence(); tap(c, 250, 2000);
  settle(c, 0, 2000); const before = c.speed(2000); c.holdFor(600, 2000);
  settle(c, 2000, 2550); expect(c.speed(2550)).toBeGreaterThan(before - 0.05);
});

test('holdFor keeps speed past stopAfterMs', () => {
  const c = createCadence(); tap(c, 250, 2000);
  settle(c, 0, 2000); const before = c.speed(2000); c.holdFor(1000, 2000);
  settle(c, 2000, 2900); expect(c.speed(2900)).toBeGreaterThan(before - 0.05);
});

test('without holdFor the same gap slows down', () => {
  const c = createCadence(); tap(c, 250, 2000);
  settle(c, 0, 2900); expect(c.speed(2900)).toBeLessThan(0.7);
});

test('speed is 0 before any step', () => {
  const c = createCadence(); expect(c.speed(0)).toBe(0); expect(c.speed(5000)).toBe(0);
});

test('first speed() read after steps is already moving', () => {
  const c = createCadence(); tap(c, 250, 2750);
  expect(c.speed(2750)).toBeGreaterThan(0.5);
});

test('takeSteps returns count since last call', () => {
  const c = createCadence(); tap(c, 250, 750);
  expect(c.takeSteps()).toBe(4); expect(c.takeSteps()).toBe(0);
});

test('reset clears speed and steps', () => {
  const c = createCadence(); tap(c, 250, 2000); settle(c, 0, 2000);
  c.reset(); expect(c.takeSteps()).toBe(0); expect(c.speed(2016)).toBe(0);
});

test('reads cfg live', () => {
  const cfg = { windowMs: 1500, stopAfterMs: 700, minRate: 1.0, fullRate: 4.0, smoothTau: 0.2 };
  const c = createCadence(cfg);
  // steps every 500 ms and a speed read every 4 ms, in time order
  const play = (from, to) => { for (let t = from; t <= to; t += 4) { if (t % 500 === 0) c.addStep(t); c.speed(t); } };
  play(0, 4000); expect(c.speed(4000)).toBeCloseTo(0.33, 1);
  cfg.fullRate = 2.0; play(4004, 5000);
  expect(c.speed(5000)).toBeGreaterThan(0.9);
});
