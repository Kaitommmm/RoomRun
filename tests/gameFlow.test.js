import { test, expect } from 'vitest';
import { gameFlow, audioLevels, watchSticks } from '../src/gameFlow.js';

test('small button starts only on the title or caught screen', () => {
  expect(gameFlow({ phase: 'title', action: 'start', sticksLost: false }).start).toBe(true);
  expect(gameFlow({ phase: 'caught', action: 'start', sticksLost: false }).start).toBe(true);
  expect(gameFlow({ phase: 'running', action: 'start', sticksLost: false }).start).toBe(false);
  expect(gameFlow({ phase: 'title', action: null, sticksLost: false }).start).toBe(false);
});

test('a dropped stick pauses only a running game', () => {
  expect(gameFlow({ phase: 'running', action: null, sticksLost: true }).paused).toBe(true);
  expect(gameFlow({ phase: 'title', action: null, sticksLost: true }).paused).toBe(false);
  expect(gameFlow({ phase: 'running', action: null, sticksLost: false }).paused).toBe(false);
});

test('danger and chase audio go quiet while paused', () => {
  expect(audioLevels({ running: true, paused: false, fill: 0.5, chaseActive: true })).toEqual({ danger: 0.5, chase: true });
  expect(audioLevels({ running: true, paused: true, fill: 0.5, chaseActive: true })).toEqual({ danger: 0, chase: false });
  expect(audioLevels({ running: false, paused: false, fill: 0.5, chaseActive: true })).toEqual({ danger: 0, chase: false });
});

const snap = (L, R) => ({ L: { connected: L }, R: { connected: R } });

test('watchSticks: a stick in use during a run that drops counts as lost', () => {
  let w = watchSticks(new Set(), snap(true, true), 'title');
  expect(w.lost).toEqual([]);
  w = watchSticks(w.expected, snap(true, true), 'running');
  w = watchSticks(w.expected, snap(true, false), 'running');
  expect(w.lost).toEqual(['R']);
  w = watchSticks(w.expected, snap(true, true), 'running');
  expect(w.lost).toEqual([]);
});

test('watchSticks: keyboard-only or one-stick play never pauses for an absent stick', () => {
  let w = watchSticks(new Set(), snap(false, false), 'running');
  expect(w.lost).toEqual([]);
  w = watchSticks(new Set(), snap(true, false), 'running');
  w = watchSticks(w.expected, snap(true, false), 'running');
  expect(w.lost).toEqual([]);
});

test('watchSticks: outside a run, a stick switched off is forgotten', () => {
  let w = watchSticks(new Set(['L', 'R']), snap(true, false), 'caught');
  expect(w.lost).toEqual([]);
  expect([...w.expected]).toEqual(['L']);
});
