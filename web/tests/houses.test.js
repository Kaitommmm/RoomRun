import { test, expect } from 'vitest';
import { createRng } from '../src/sim/rng.js';
import { houseWidth } from '../src/render/houses.js';

const SEG = 40;

test('houses fill a segment exactly and none is narrower than 3 m (narrow houses z-fought their neighbours)', () => {
  for (let seed = 0; seed < 500; seed++) {
    const r = createRng(seed);
    let z = 0;
    while (z < SEG - 0.01) {
      const w = houseWidth(SEG - z, r);
      expect(w).toBeGreaterThanOrEqual(3);
      expect(w).toBeLessThanOrEqual(6);
      z += w;
    }
    expect(z).toBeCloseTo(SEG);
  }
});
