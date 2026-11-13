import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import config from '../src/config.js';
import { createMotionDetector } from '../src/input/motion.js';
import { withMotionDiagnostics } from '../src/input/motionDiagnostics.js';
import { createJumpRecording } from '../src/input/jumpRecording.js';
import { createWorld, startRun, stepWorld } from '../src/sim/world.js';
import { createTrack, updateTrack } from '../src/sim/track.js';
import { createRng } from '../src/sim/rng.js';

const manifest = JSON.parse(readFileSync(new URL('./fixtures/rurtt-provenance.json', import.meta.url)));
test.each(Object.entries(manifest.files))('%s matches the immutable Rurtt Git blob', (file, expected) => {
  const bytes = readFileSync(new URL('../' + file, import.meta.url));
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  expect(actual).toBe(expected);
});
const sample = (hand, ts, up, raw = up + 9.81) => ({ hand, ts, a: [0, up, 0], ag: [0, raw, 0] });
test.each(['exercise', 'allAxes', 'vertical'])('diagnostics preserve every detector input frame and reset in %s mode', runMode => {
  const a = createMotionDetector({ ...structuredClone(config.motion), runMode });
  let notifications = 0, jumps = 0;
  const b = withMotionDiagnostics(createMotionDetector({ ...structuredClone(config.motion), runMode }), () => jumps++);
  const unsubscribe = b.observe(() => notifications++);
  let expectedJumps = 0;
  for (let t = 0; t < 5000; t += 20) {
    const pulse = t % 1200 >= 200 && t % 1200 < 280 ? 30 : 0;
    const swing = t < 1800 ? 20 * Math.sin(t / 80) : 0;
    for (const hand of ['L', 'R']) {
      const s = sample(hand, t, pulse + (hand === 'L' ? swing : -swing)); a.push(s); b.push(s);
    }
    const frame = a.read(t); if (frame.jump) expectedJumps++;
    expect(b.read(t)).toEqual(frame);
    if (t === 2500) { a.reset(); b.reset(); }
  }
  expect(jumps).toBe(expectedJumps); expect(notifications).toBe(500);
  unsubscribe(); b.push(sample('L', 6000, 0)); expect(notifications).toBe(500);
});
test('freefall-only input never consumes a game jump through diagnostics', () => {
  const accepted = [], d = withMotionDiagnostics(createMotionDetector(), now => accepted.push(now));
  for (let t=0;t<=400;t+=20) {
    d.push(sample('L',t,-9,.81)); d.push(sample('R',t,-9,.81)); expect(d.read(t).jump).toBe(false);
  }
  expect(accepted).toEqual([]);
});
test('track and simulation contain no item spawns, item powers or item events', () => {
  const track = createTrack({ ...config.track, spawnAhead: 600 }, createRng(7)); updateTrack(track, 0, 30);
  expect(track).not.toHaveProperty('items'); expect(track).not.toHaveProperty('nextItemZ');
  const w = createWorld(config, 1); startRun(w);
  const events = [];
  for (let n = 0; n < 120; n++) events.push(...stepWorld(w, { speed: 1, jump: false, laneDelta: 0, steps: 0 }, 1 / 120));
  expect(w).not.toHaveProperty('powers'); expect(w.player.speedMps).toBe(config.player.maxSpeed);
  expect(events.some(e => e.startsWith('item-') || e === 'shield-block')).toBe(false);
});
test('trace records raw signals and separate detector/game decisions, remains bounded and resets', () => {
  let now = 0; const r = createJumpRecording(() => now);
  r.start('play', { engine: 'Rurtt/RoomRun', commit: manifest.commit });
  const d = withMotionDiagnostics(createMotionDetector(), () => r.event('detector-jump'));
  d.observe(s => r.push(s));
  for(let t=0;t<100;t+=20) { now=t; d.push(sample('L',t,0)); d.push(sample('R',t,0)); }
  for (let t=100;t<=400;t+=20) {
    now=t; const up=t<160?18:t<240?-6:0;
    d.push(sample('L',t,up)); d.push(sample('R',t,up)); if(d.read(t).jump) r.event('jump');
  }
  expect(r.stop().version).toBe(2); expect(r.data.samples).toHaveLength(42);
  expect(r.data.events.map(e => e.event)).toEqual(['detector-jump','jump']);
  d.push(sample('L', 120, 0)); expect(r.data.samples).toHaveLength(42);
  r.start(); for (let i = 0; i < 18100; i++) r.push({ ...sample('L', i, 0), up: 0, load: 9.81 });
  expect(r.active).toBe(false); expect(r.data.samples).toHaveLength(18000);
  r.start(); now += 90001; r.push({ ...sample('L', 10, 0), up: 0, load: 9.81 }); expect(r.active).toBe(false);
});
