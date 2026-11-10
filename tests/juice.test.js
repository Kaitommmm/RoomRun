import { test, expect } from 'vitest';
import { jumpSquash, runBob } from '../src/render/juice.js';

test('jumpSquash: crouch at take-off, stretch rising, squash on landing, nothing on the ground', () => {
  expect(jumpSquash(0, 9, true, 1)).toBeCloseTo(-0.22);
  expect(jumpSquash(0.3, 9, true, 1)).toBeCloseTo(0.14);
  expect(jumpSquash(0.3, 9, true, -1)).toBeCloseTo(0.04);
  expect(jumpSquash(9, 0, false, 0)).toBeCloseTo(-0.2);
  expect(jumpSquash(9, 0.07, false, 0)).toBeCloseTo(-0.1);
  expect(jumpSquash(9, 9, false, 0)).toBeNull();
});

test('runBob: small, loops with the clip', () => {
  for (let f = 0; f <= 1; f += 0.05) {
    const { bob, pitch } = runBob(f);
    expect(bob).toBeGreaterThanOrEqual(0); expect(bob).toBeLessThanOrEqual(0.035);
    expect(Math.abs(pitch)).toBeLessThanOrEqual(0.06);
  }
  expect(runBob(0).bob).toBeCloseTo(runBob(1).bob);
  expect(runBob(0).pitch).toBeCloseTo(runBob(1).pitch);
});
