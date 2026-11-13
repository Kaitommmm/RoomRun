import { test, expect } from 'vitest';
import currentConfig from '../src/config.js';
// Isolated legacy gate/cadence regressions; default effort/lift integration: effortLift.test.js.
const config={...currentConfig,motion:{...currentConfig.motion,jumpMode:'paired',runSpeedMode:'cadence',exerciseEffort:{enabled:false}}};
import { createMotionDetector } from '../src/input/motion.js';

const modes = ['exercise', 'allAxes', 'vertical'];
const rates = [20, 1000 / 60];
const cases = modes.flatMap(mode => rates.map(dt => [mode, dt]));
function drive(runMode, dt, fn, end = 4000, filter = () => true, warmup = 0) {
  const d = createMotionDetector({ ...structuredClone(config.motion), runMode });
  const jumps = [], frames = [];
  for (let t = 0; t < end; t += dt) {
    d.setJumpEnabled(t >= warmup);
    for (const hand of ['L', 'R']) if (filter(hand, t)) {
      const value = fn(hand, t), up = typeof value === 'number' ? value : value.up;
      const load = typeof value === 'number' ? up + 9.81 : value.load;
      d.push({ hand, ts: t, a: [0, up, 0], ag: [0, load, 0] });
    }
    const frame = d.read(t); frames.push(frame); if (frame.jump) jumps.push(t);
  }
  return { jumps, frames };
}
export function jumpAt(t, at = 1000, peak = 18) {
  const x = t - at;
  return x >= 0 && x < 80 ? peak : x >= 80 && x < 330 ? -9 : x >= 330 && x < 390 ? 30 : 0;
}

test.each(cases)('fast opposite arm strokes never jump: %s / %s ms', (mode, dt) => {
  const result = drive(mode, dt, (hand, t) => 40 * Math.sin(2 * Math.PI * 4.5 * t / 1000) * (hand === 'L' ? 1 : -1), 6000);
  expect(result.jumps).toEqual([]); expect(result.frames.some(f => f.speed > .1)).toBe(true);
});
test.each(cases)('learned starting running bounces are not jumps: %s / %s ms', (mode, dt) => {
  const result = drive(mode, dt, (_, t) => { const x = t % 360; return x < 60 ? 22 : x < 130 ? -9 : 0; }, 4000, () => true, 1200);
  expect(result.jumps).toEqual([]);
});
test.each(cases)('alternating hand lifts within 100 ms are not shared takeoff: %s / %s ms', (mode, dt) => {
  const result = drive(mode, dt, (h, t) => { const x = t - (h === 'L' ? 1000 : 1100); return x >= 0 && x < 60 ? 28 : 0; });
  expect(result.jumps).toEqual([]);
});
test('a single common bad packet cannot trigger even when followed by low force', () => {
  const result = drive('exercise', 20, (_, t) => t === 1000 ? 40 : t >= 1020 && t < 1300 ? -9 : 0);
  expect(result.jumps).toEqual([]);
});
test('a quiet or missing hand cannot supply old flight evidence', () => {
  const result = drive('exercise', 20, (_, t) => t >= 1000 ? -9 : 0, 1800, (h, t) => h === 'L' || t <= 1000);
  expect(result.jumps).toEqual([]);
});
test.each(cases)('shared lift confirms promptly without waiting for a flight interval: %s / %s ms', (mode, dt) => {
  const result = drive(mode, dt, (_, t) => jumpAt(t));
  expect(result.jumps).toHaveLength(1); expect(result.jumps[0]).toBeGreaterThanOrEqual(1020); expect(result.jumps[0]).toBeLessThan(1100);
});
test.each(cases)('repeated moderate real jumps work without self-raising thresholds: %s / %s ms', (mode, dt) => {
  const result = drive(mode, dt, (_, t) => jumpAt(t, 500) || jumpAt(t, 1600) || jumpAt(t, 2700));
  expect(result.jumps).toHaveLength(3);
});
test('a missing-packet gap during lift confirmation cancels the candidate', () => {
  const result = drive('exercise', 20, (_, t) => jumpAt(t), 2000, (_, t) => !(t >= 1020 && t < 1200));
  expect(result.jumps).toEqual([]);
});

test.each(rates.flatMap(dt => [8,25,45].map(skew => [dt,skew])))('real takeoff survives asynchronous BLE sampling: %s ms, skew %s', (dt, skew) => {
  const events = [];
  for (const hand of ['L','R']) for (let t=hand==='L'?0:skew;t<2200;t+=dt) events.push({hand,t,receive:t+(hand==='R'?15:0)});
  events.sort((a,b)=>a.receive-b.receive);
  const d = createMotionDetector(config.motion), jumps=[];
  for (const e of events) {
    const up=jumpAt(e.t); d.push({hand:e.hand,ts:e.t,a:[0,up,0],ag:[0,up+9.81,0]});
    if(d.read(e.receive).jump) jumps.push(e.receive);
  }
  expect(jumps).toHaveLength(1); expect(jumps[0]).toBeLessThan(1300);
});
test('each hand must independently supply new upward support after the first paired edge', () => {
  const result = drive('exercise',20,(hand,t)=> {
    return hand==='L'&&t>=1000&&t<1080 ? 22 : hand==='R'&&t===1000 ? 22 : 0;
  });
  expect(result.jumps).toEqual([]);
});
