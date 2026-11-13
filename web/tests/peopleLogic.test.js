import { describe, it, expect } from 'vitest';
import { headYaw, lookYaw, startleWeight, ease, PEOPLE } from '../src/render/peopleLogic.js';

describe('headYaw', () => {
  it('is 0 when the kid is out of range', () => expect(headYaw(0, 0, 0, 0, 20)).toBe(0));
  it('looks straight when the kid is straight ahead', () => expect(headYaw(0, 0, 0, 0, 5)).toBeCloseTo(0));
  it('turns toward a kid to the side, within the clamp', () => {
    const y = headYaw(0, 0, 0, 3, 3);
    expect(y).toBeGreaterThan(0.5); expect(y).toBeLessThanOrEqual(PEOPLE.maxYaw);
  });
  it('clamps behind and never flips side', () => {
    expect(headYaw(0, 0, 0, 0.5, -3)).toBeCloseTo(PEOPLE.maxYaw);
    expect(headYaw(0, 0, 0, -0.5, -3)).toBeCloseTo(-PEOPLE.maxYaw);
  });
});

describe('startleWeight', () => {
  it('is 0 before and after', () => { expect(startleWeight(-0.1)).toBe(0); expect(startleWeight(PEOPLE.startleTime)).toBe(0); });
  it('is near full shortly after the trigger', () => expect(startleWeight(0.2)).toBeGreaterThan(0.9));
  it('never exceeds 1 (retrigger resets t, no stacking)', () => {
    for (let t = 0; t < 1; t += 0.01) expect(startleWeight(t)).toBeLessThanOrEqual(1);
  });
});

describe('ease', () => {
  it('moves toward the target without overshoot', () => {
    const v = ease(0, 1, 8, 1 / 60);
    expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1);
    expect(ease(0, 1, 8, 10)).toBeCloseTo(1);
  });
});

describe('lookYaw', () => {
  it('turns toward the kid beyond the turn range', () => expect(lookYaw(0, 0, 0, 30, 30)).toBeCloseTo(Math.PI / 4));
});

describe('headYaw behind, carried over frames', () => {
  it('holds the clamp side while the kid crosses straight behind', () => {
    let yaw = 0;
    for (let x = 3; x >= -3; x -= 0.1) { // kid sweeps from the left-behind to the right-behind
      yaw = headYaw(0, 0, 0, x, -4, PEOPLE.maxYaw, yaw);
      if (x < 0 && x > -1) expect(yaw).toBeCloseTo(PEOPLE.maxYaw);
    }
  });
});
