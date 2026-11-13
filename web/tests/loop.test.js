import { test, expect } from 'vitest';
import { createFixedLoop } from '../src/loop.js';

test('same number of steps at 30 fps and 240 fps over 1 s', () => {
  const count = (fps) => {
    let n = 0;
    const loop = createFixedLoop({ step: () => n++, render: () => {}, stepDt: 1 / 120, maxFrameDt: 0.1 });
    for (let i = 0; i < fps; i++) loop.frame(1 / fps);
    return n;
  };
  expect(Math.abs(count(30) - 120)).toBeLessThanOrEqual(1);
  expect(Math.abs(count(240) - 120)).toBeLessThanOrEqual(1);
});

test('same number of steps at 60 Hz and 144 Hz over 1 s', () => {
  const count = (fps) => {
    let n = 0;
    const loop = createFixedLoop({ step: () => n++, render: () => {}, stepDt: 1 / 120, maxFrameDt: 0.1 });
    for (let i = 0; i < fps; i++) loop.frame(1 / fps);
    return n;
  };
  expect(Math.abs(count(60) - 120)).toBeLessThanOrEqual(1);
  expect(Math.abs(count(144) - 120)).toBeLessThanOrEqual(1);
});

test('one 5 s frame is clamped to maxFrameDt', () => {
  let n = 0;
  const loop = createFixedLoop({ step: () => n++, render: () => {}, stepDt: 1 / 120, maxFrameDt: 0.1 });
  loop.frame(5);
  expect(n).toBeLessThanOrEqual(12);
});

test('step receives stepDt', () => {
  const dts = [];
  const loop = createFixedLoop({ step: (dt) => dts.push(dt), render: () => {}, stepDt: 1 / 120, maxFrameDt: 0.1 });
  loop.frame(1 / 30);
  expect(dts.length).toBeGreaterThan(0);
  dts.forEach((dt) => expect(dt).toBe(1 / 120));
});

test('render gets alpha in [0,1) once per frame call', () => {
  const alphas = [];
  const loop = createFixedLoop({ step: () => {}, render: (a) => alphas.push(a), stepDt: 1 / 120, maxFrameDt: 0.1 });
  for (const dt of [1 / 144, 1 / 30, 0.005, 5, 1 / 60]) loop.frame(dt);
  expect(alphas.length).toBe(5);
  alphas.forEach((a) => { expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(1); });
});

test('negative or NaN frame time does not step backwards', () => {
  let n = 0;
  const loop = createFixedLoop({ step: () => n++, render: () => {}, stepDt: 1 / 120, maxFrameDt: 0.1 });
  loop.frame(-1); loop.frame(NaN);
  expect(n).toBe(0);
  loop.frame(1 / 60);
  expect(n).toBe(2);
});
