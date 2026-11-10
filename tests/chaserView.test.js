import { test, expect } from 'vitest';
import config from '../src/config.js';
import { chaserBack, showChaser, eyeColor, heelSlot, chaserSide, caughtDogSpot } from '../src/render/chaserView.js';

const world = ({ phase = 'running', visible = false, chase = 'idle' } = {}) => ({ phase, chaser: { visible }, chase: { phase: chase } });

test('chaserBack maps the visible gap to 0.9..2.2 m behind the kid', () => {
  expect(chaserBack(0)).toBeCloseTo(0.9); expect(chaserBack(12)).toBeCloseTo(2.2); expect(chaserBack(40)).toBeCloseTo(2.2);
  let last = -1;
  for (let g = 0; g <= 12; g += 0.5) { const b = chaserBack(g, config.chaser); expect(b).toBeGreaterThanOrEqual(last); last = b; }
});

test('showChaser: caught, close, or peeking after a hit', () => {
  expect(showChaser(world({ phase: 'caught' }), 0)).toBe(true);
  expect(showChaser(world({ visible: true }), 0)).toBe(true);
  expect(showChaser(world(), 0.5)).toBe(true);
  expect(showChaser(world(), 0)).toBe(false);
});

test('eyeColor: red when close or during the chase event', () => {
  expect(eyeColor(world())).toBe('amber');
  expect(eyeColor(world({ visible: true }))).toBe('red');
  expect(eyeColor(world({ chase: 'active' }))).toBe('red');
  expect(eyeColor(world({ chase: 'warning' }))).toBe('amber');
});

test('heelSlot: two different spots right behind the kid, never off the road', () => {
  for (const px of [-2.5, 0, 2.5]) {
    const a = heelSlot(0, px, 2.5), b = heelSlot(1, px, 2.5);
    expect(a.x).not.toBeCloseTo(b.x);
    for (const s of [a, b]) { expect(Math.abs(s.x)).toBeLessThanOrEqual(3.75); expect(s.back).toBeGreaterThan(0); expect(s.back).toBeLessThanOrEqual(2); }
  }
});

test('caught: small dogs sit on the far side from the grabbing boss, clear of it', () => {
  for (const px of [-2.5, 0, 2.5]) {
    const bossX = px + chaserSide(px) * 0.5, bossBack = 1.0;
    for (let i = 0; i < 3; i++) {
      const d = caughtDogSpot(i, px, 2.5);
      expect(Math.hypot(d.x - bossX, d.back - bossBack)).toBeGreaterThanOrEqual(0.8);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(3.75);
    }
  }
});
