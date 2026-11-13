import { test, expect } from 'vitest';
import { smallButtonAction } from '../src/input/controllerActions.js';
import { watchSticks } from '../src/gameFlow.js';
import { createRunControls } from '../src/input/runControls.js';
import config from '../src/config.js';
import { createWorld, startRun, stepWorld } from '../src/sim/world.js';

test('L always pauses a live session, R starts/resumes and only R confirms the avatar', () => {
  for (const phase of ['title', 'running']) {
    expect(smallButtonAction({ hand: 'L', phase })).toBe('pause');
    expect(smallButtonAction({ hand: 'R', phase })).toBe('start');
  }
  expect(smallButtonAction({ hand: 'R', phase: 'caught', picking: true })).toBe('sign');
  expect(smallButtonAction({ hand: 'L', phase: 'caught', picking: true })).toBe(null);
  expect(smallButtonAction({ hand: 'R', phase: 'caught' })).toBe('start');
});
test('diagnostic dialog blocks both small buttons; a missing stick blocks resume', () => {
  expect(smallButtonAction({ hand: 'R', phase: 'running', sticksLost: true })).toBe(null);
  for (const hand of ['L', 'R']) expect(smallButtonAction({ hand, phase: 'running', blocked: true })).toBe(null);
});
test('reconnecting both sticks keeps the run paused until R, preserving progress', () => {
  const snapshot = { L: { connected: true }, R: { connected: true } };
  let watch = watchSticks(new Set(), snapshot, 'running');
  let distance = 123, coins = 9;
  const c = createRunControls({ getPhase: () => 'running', onStart() { distance = coins = 0; }, onPause() {}, onResume() {} });
  snapshot.L.connected = false; watch = watchSticks(watch.expected, snapshot, 'running');
  if (watch.lost.length) c.pause(); expect(c.paused).toBe(true);
  snapshot.L.connected = true; watch = watchSticks(watch.expected, snapshot, 'running');
  expect(watch.lost).toEqual([]); expect(c.paused).toBe(true); expect(c.canAdvance(1)).toBe(false);
  c.press('R'); expect(c.paused).toBe(false); expect(c.canAdvance(0)).toBe(false); expect(c.canAdvance(1)).toBe(true);
  expect([distance, coins]).toEqual([123, 9]);
});

test('pausing preserves score, combo and movement until the player resumes', () => {
  const w = createWorld(config, 1); startRun(w); w.combo = 7; w.coins = 15;
  const c = createRunControls({ getPhase: () => w.phase, onStart: () => startRun(w), onPause() {}, onResume() {} });
  const input = { speed: 1, laneDelta: 0, jump: false, steps: 0 };
  c.press('L');
  for (let n = 0; n < 120; n++) if (c.canAdvance(input.speed)) stepWorld(w, input, 1 / 60);
  expect(w.combo).toBe(7); expect(w.player.distance).toBe(0); expect(w.coins).toBe(15);
  c.press('R'); if (c.canAdvance(input.speed)) stepWorld(w, input, .1);
  expect(w.combo).toBe(7); expect(w.player.distance).toBeCloseTo(1.2); expect(w.coins).toBe(15);
});
