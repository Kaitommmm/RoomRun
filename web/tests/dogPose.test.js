import { test, expect } from 'vitest';
import { advanceGallop, gallopPose } from '../src/render/dogPose.js';

test('gallopPose stays in range over a full bound', () => {
  for (let i = 0; i <= 64; i++) {
    const { bob, lean, stretch } = gallopPose((i / 64) * Math.PI * 2);
    expect(bob).toBeGreaterThanOrEqual(0); expect(bob).toBeLessThanOrEqual(0.2);
    expect(lean).toBeGreaterThanOrEqual(0); expect(lean).toBeLessThanOrEqual(0.25);
    expect(stretch).toBeGreaterThanOrEqual(1); expect(stretch).toBeLessThanOrEqual(1.08);
  }
});

test('advanceGallop: still dog does not bound, bound rate follows speed', () => {
  expect(advanceGallop(0, 0, 1)).toBe(0);
  expect(advanceGallop(0, 8, 0.2)).toBeCloseTo(Math.PI * 2);
});
