import { test, expect } from 'vitest';
import { createMotionDetector } from '../src/input/motion.js';
import { createFlickGesture } from '../src/input/flickGesture.js';
import { createProgressivePace } from '../src/input/progressivePace.js';
import config from '../src/config.js';

function play({seconds=14,hz=2,amp=9,gesture=()=>0,move=t=>true,gap=()=>false,dt=20}={}) {
  const d=createMotionDetector(),frames=[];
  for(let t=0;t<seconds*1000;t+=dt) {
    for(const hand of ['L','R']) {
      if(gap(hand,t))continue;
      const x=move(t)?amp*Math.sin(2*Math.PI*hz*t/1000)*(hand==='L'?1:-1):0,up=gesture(hand,t);
      d.push({hand,ts:t,a:[x,up,0],ag:[x,up+9.81,0]});
    }
    frames.push({t,...d.read(t)});
  }
  return {d,frames,jumps:frames.filter(f=>f.jump),speed:frames.at(-1).speed};
}
const flick=(t,start)=>t>=start&&t<start+60?16:t>=start+60&&t<start+140?-6:0;
test('continuous detected running gradually reaches full speed',()=>{
  const r=play();const at=t=>r.frames.find(f=>f.t===t).speed;
  expect(at(2000)).toBeGreaterThan(0);expect(at(2000)).toBeLessThan(.4);
  expect(at(5000)).toBeGreaterThan(at(2000)+.35);expect(at(11000)).toBeGreaterThan(.99);
});
test('running presence, not cadence or swing size, determines the later maximum speed',()=>{
  for(const [hz,amp] of [[1.2,6],[2,10],[2.7,20]])expect(play({hz,amp}).speed).toBeGreaterThan(.99);
});
test('stillness and isolated flicks cannot charge the running ramp',()=>{
  expect(play({amp:0}).speed).toBe(0);
  const r=play({amp:0,gesture:(_,t)=>flick(t,1000)});
  expect(Math.max(...r.frames.map(f=>f.speed))).toBe(0);
});
test('repeated jump commands while standing still do not count as a running rhythm',()=>{
  const r=play({amp:0,gesture:(_,t)=>flick(t,1000*Math.floor(t/1000))});
  expect(r.jumps.length).toBeGreaterThan(3);
  expect(Math.max(...r.frames.map(f=>f.speed))).toBe(0);
});
test('stopping starts gradual braking, then stops; running again accelerates again',()=>{
  const r=play({seconds:22,move:t=>t<9000||t>=14000});const at=t=>r.frames.find(f=>f.t===t).speed;
  expect(at(8800)).toBeGreaterThan(.99);
  expect(at(10000)).toBeLessThan(.95);expect(at(10000)).toBeGreaterThan(0);
  expect(at(12500)).toBeLessThan(.01);expect(at(17000)).toBeLessThan(.6);expect(r.speed).toBeGreaterThan(.99);
});
test.each([20,1000/60,1000/30])('quick paired upward flick and braking work during a run (%s ms/sample)',dt=>{
  const r=play({dt,gesture:(h,t)=>flick(t,5000+(h==='R'?20:0))});
  expect(r.jumps).toHaveLength(1);expect(r.jumps[0].t).toBeGreaterThanOrEqual(5060);expect(r.jumps[0].t).toBeLessThan(5250);
  expect(r.frames.filter(f=>f.t>5000&&f.t<5600).every(f=>f.speed>.4)).toBe(true);
});
test('a slower sustained lift no longer substitutes for the requested flick',()=>{
  expect(play({gesture:(_,t)=>t>=5000&&t<5300?9:t>=5300&&t<5380?-4:0}).jumps).toHaveLength(0);
});
test('one hand, opposite strokes, one-sample spikes and widely staggered flicks do not jump',()=>{
  for(const gesture of [(h,t)=>h==='L'?flick(t,5000):0,(h,t)=>flick(t,5000)*(h==='L'?1:-1),
    (_,t)=>t===5000?30:0,(h,t)=>flick(t,5000+(h==='R'?180:0))])
    expect(play({gesture}).jumps).toHaveLength(0);
});
test('a fresh downward brake from both hands is required, with no stale completion after a gap',()=>{
  expect(play({gesture:(_,t)=>t>=5000&&t<5060?18:0}).jumps).toHaveLength(0);
  const r=play({gesture:(_,t)=>flick(t,5000)+flick(t,8000),gap:(h,t)=>h==='R'&&t>=5040&&t<5300});
  expect(r.jumps).toHaveLength(1);expect(r.jumps[0].t).toBeGreaterThan(8000);
});
test('repeated flicks work without standing still and reset clears speed/actions',()=>{
  const r=play({gesture:(_,t)=>flick(t,5000)+flick(t,6000)});
  expect(r.jumps).toHaveLength(2);r.d.reset();expect(r.d.read(15000)).toEqual({speed:0,jump:false,laneDelta:0,steps:0});
});
test.each([1.2,2,2.8])('learned running bounce stays separate at %s Hz',hz=>{
  const d=createMotionDetector(),jumps=[];
  for(let t=0;t<12000;t+=20) {
    d.setJumpEnabled(t>=2000);
    for(const hand of ['L','R']) {const up=12*Math.sin(2*Math.PI*hz*t/1000);d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});}
    if(d.read(t).jump)jumps.push(t);
  }
  expect(jumps).toEqual([]);
});
test('repeated learned sharp body impacts do not jump, even with a negative rebound',()=>{
  const gate=createFlickGesture(config.motion),jumps=[];
  for(let t=0;t<6000;t+=20)for(const hand of ['L','R']) {
    const phase=t%360,up=phase<60?22:phase<140?-8:0;
    if(gate.push({hand,t,up,gravity:9.81},t>=2000))jumps.push(t);
  }
  expect(jumps).toEqual([]);
});
test('a slow upward ramp and a long sustained lift do not qualify as a quick flick',()=>{
  const gate=createFlickGesture(config.motion),jumps=[];
  for(let t=0;t<2000;t+=20)for(const hand of ['L','R']) {
    const up=t<1000?0:t<1200?(t-1000)/200*12:t<1300?12:t<1400?-6:0;
    if(gate.push({hand,t,up,gravity:9.81}))jumps.push(t);
  }
  expect(jumps).toEqual([]);
});
test('a suspended game clock cannot grant an instant full-speed charge on its next frame',()=>{
  const p=createProgressivePace();p.speed(true,0);
  expect(p.speed(true,60000)).toBeLessThan(.02);
  p.reset();expect(p.speed(false,60001)).toBe(0);
});
