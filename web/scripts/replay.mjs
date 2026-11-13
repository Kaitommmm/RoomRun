// Feed a recorded relay log through the motion detector and print what the
// game would have seen, second by second. For tuning config.motion:
//   node scripts/replay.mjs logs/motion-20261029-193000.jsonl
//   node scripts/replay.mjs logs/<file> stepThreshold=7 swipeThreshold=14
import { readFileSync } from 'node:fs';
import config from '../src/config.js';
import { createCadence } from '../src/input/cadence.js';
import { createMotionDetector } from '../src/input/motion.js';
import { createPhoneSource } from '../src/input/phoneSource.js';

const [file, ...overrides] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/replay.mjs <log.jsonl> [motionKey=value ...]');
  process.exit(1);
}
const motion = structuredClone(config.motion);
for (const o of overrides) {
  const [key, value] = o.split('=');
  if (!(key in motion) || typeof motion[key] !== 'number') { console.error(`unknown numeric motion key: ${key}`); process.exit(1); }
  motion[key] = Number(value);
}

const samples = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.t === 'm');
if (!samples.length) { console.error('no motion samples in file'); process.exit(1); }
const t0 = samples[0].rt;
const src = createPhoneSource({ detector: createMotionDetector(motion, createCadence(motion.cadence)) });

const sec = (t) => ((t - t0) / 1000).toFixed(2).padStart(7);
let bucket = 0, steps = 0, speedSum = 0, reads = 0;
const counts = { L: 0, R: 0 };
let jumps = 0, lanes = 0;
console.log('   time  steps/s  speed  hands');
for (const m of samples) {
  counts[m.hand] = (counts[m.hand] ?? 0) + 1;
  src.handleMessage(m, m.rt);
  const f = src.read(m.rt);
  steps += f.steps; speedSum += f.speed; reads++;
  if (f.jump) { jumps++; console.log(`${sec(m.rt)}  JUMP`); }
  if (f.laneDelta) { lanes++; console.log(`${sec(m.rt)}  LANE ${f.laneDelta < 0 ? 'left' : 'right'}`); }
  const b = Math.floor((m.rt - t0) / 1000);
  if (b !== bucket) {
    console.log(`${sec(t0 + bucket * 1000)}  ${String(steps).padStart(7)}  ${(speedSum / reads).toFixed(2)}  L${counts.L} R${counts.R}`);
    bucket = b; steps = 0; speedSum = 0; reads = 0; counts.L = 0; counts.R = 0;
  }
}
if (reads) console.log(`${sec(t0 + bucket * 1000)}  ${String(steps).padStart(7)}  ${(speedSum / reads).toFixed(2)}  L${counts.L} R${counts.R}  (partial)`);
console.log(`\n${samples.length} samples over ${((samples.at(-1).rt - t0) / 1000).toFixed(1)} s: ${jumps} jumps, ${lanes} lane changes`);
