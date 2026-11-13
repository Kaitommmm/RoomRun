import { test, expect } from 'vitest';
import currentConfig from '../src/config.js';
// Isolated legacy gate/cadence regressions; default effort/lift integration: effortLift.test.js.
const config={...currentConfig,motion:{...currentConfig.motion,jumpMode:'paired',runSpeedMode:'cadence',exerciseEffort:{enabled:false}}};
import { createMotionDetector } from '../src/input/motion.js';

function running(hz, sampleMs=20, mode='exercise') {
  const d=createMotionDetector({...structuredClone(config.motion),runMode:mode});
  let steps=0, jumps=0, speed=0; const tail=[];
  for(let t=0;t<7000;t+=sampleMs) {
    for(const hand of ['L','R']) {
      const x=12*Math.sin(2*Math.PI*hz*t/1000)*(hand==='L'?1:-1);
      d.push({hand,ts:t,a:[x,0,0],ag:[x,9.81,0]});
    }
    const f=d.read(t);steps+=f.steps;if(f.jump)jumps++;speed=f.speed;if(t>5500)tail.push(f.speed);
  }
  return {steps,jumps,speed,average:tail.reduce((a,b)=>a+b,0)/tail.length};
}
test.each([20,1000/60])('fast running must not become slower through pulse aliasing at %s ms/sample', sampleMs=> {
  const slow=running(.75,sampleMs),normal=running(1.6,sampleMs),fast=running(2.5,sampleMs);
  expect(normal.average).toBeGreaterThan(slow.average+.15);
  expect(fast.average).toBeGreaterThanOrEqual(normal.average-.02);expect(fast.average).toBeGreaterThan(.95);
  expect(fast.steps).toBeGreaterThan(normal.steps);expect(fast.jumps).toBe(0);
});
test.each(['exercise','allAxes','vertical'])('shared 60 ms takeoff works while hands remain supported in %s mode', mode=> {
  const d=createMotionDetector({...structuredClone(config.motion),runMode:mode}),detected=[];
  for(let t=0;t<1700;t+=20) {
    for(const hand of ['L','R']) {
      const up=t>=1000&&t<1060?18:0;
      d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});
    }
    if(d.read(t).jump)detected.push(t);
  }
  expect(detected).toHaveLength(1);expect(detected[0]).toBeLessThan(1080);
});
test('fast arm swings then a shared modest lift do not raise its threshold',()=> {
  const d=createMotionDetector(config.motion), detected=[];
  for(let t=0;t<4200;t+=20) {
    for(const hand of ['L','R']) {
      const swing=t<2800?36*Math.sin(2*Math.PI*3.8*t/1000)*(hand==='L'?1:-1):0;
      const up=swing+(t>=3000&&t<3080?18:0);
      d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});
    }
    if(d.read(t).jump)detected.push(t);
  }
  expect(detected).toHaveLength(1);expect(detected[0]).toBeGreaterThanOrEqual(3000);expect(detected[0]).toBeLessThan(3100);
});

export { running };

test('the next jump can fire while continuous running prevents a stationary re-arm',()=> {
  const d=createMotionDetector(config.motion),detected=[];
  for(let t=0;t<3800;t+=20) {
    for(const hand of ['L','R']) {
      const inJump=(t>=1000&&t<1400)||(t>=2500&&t<2900);
      const at=t<2000?1000:2500, x=t-at;
      const up=inJump?(x<80?18:x<330?-9:30):30*Math.sin(2*Math.PI*3.5*t/1000)*(hand==='L'?1:-1);
      d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});
    }
    if(d.read(t).jump)detected.push(t);
  }
  expect(detected).toHaveLength(2);expect(detected[1]).toBeGreaterThanOrEqual(2500);
});
test('learning the starting running bounce does not trigger jump/cadence suppression before pace is ready',()=> {
  const d=createMotionDetector(config.motion);const detected=[];
  for(let t=0;t<4000;t+=20) {
    d.setJumpEnabled(t>=1200);
    for(const hand of ['L','R']) {
      const x=t%360, up=x<60?22:x<130?-9:0;
      d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});
    }
    const f=d.read(t);if(f.jump)detected.push(t);
  }
  expect(detected).toEqual([]);expect(d.exerciseStatus(4000).ready).toBe(true);
});

test('a stream recovery landing is ignored but a later lift works without standing still',()=> {
  const d=createMotionDetector(config.motion),detected=[];
  for(let t=0;t<2200;t+=20) {
    if(t>=1020&&t<1200)continue;
    const up=t>=1000&&t<1080?18:t>=1080&&t<1330?-9:t>=1330&&t<1390?30:t>=1700&&t<1780?18:0;
    for(const hand of ['L','R']) d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});
    if(d.read(t).jump)detected.push(t);
  }
  expect(detected).toHaveLength(1);expect(detected[0]).toBeGreaterThanOrEqual(1700);
});
