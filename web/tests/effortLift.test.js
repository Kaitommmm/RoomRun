import { test, expect } from 'vitest';
import config from '../src/config.js';
import { createMotionDetector as createDetector } from '../src/input/motion.js';
// Previous effort/lift mode remains an isolated selectable regression stage.
const createMotionDetector=()=>createDetector({...config.motion,runSpeedMode:'effort',jumpMode:'lift'});

function play({ seconds=8, hz=2.5, width=.025, sampleMs=20, gesture=()=>0, gap=()=>false, rotate=v=>v, change=null }={}) {
  const d=createMotionDetector(), frames=[];
  for(let t=0;t<seconds*1000;t+=sampleMs) {
    for(const hand of ['L','R']) {
      if(gap(hand,t))continue;
      const amp=(2*Math.PI*hz)**2 * (change?.(t)??width);
      const x=amp*Math.sin(2*Math.PI*hz*t/1000)*(hand==='L'?1:-1);
      const up=gesture(hand,t);
      d.push({hand,ts:t,a:rotate([x,up,0]),ag:rotate([x,up+9.81,0])});
    }
    frames.push({t,...d.read(t)});
  }
  return {d,frames,speed:frames.at(-1).speed,jumps:frames.filter(f=>f.jump)};
}
const rotate=([x,y,z])=>[x*.6+y*.8,-x*.8+y*.6,z];

test.each([20,1000/60,1000/30])('default speed needs larger motion as well as faster rhythm (%s ms)',sampleMs=>{
  const small=play({sampleMs,width:.025}),wide=play({sampleMs,width:.15});
  expect(small.speed).toBeLessThan(.5);
  expect(wide.speed).toBeGreaterThan(.9);
  expect(wide.speed-small.speed).toBeGreaterThan(.45);
  expect(wide.jumps).toHaveLength(0);
});
test('waiting longer cannot turn the same small fast movement into a sprint',()=>{
  const result=play({seconds:30});
  expect(Math.max(...result.frames.map(f=>f.speed))).toBeLessThan(.5);
});
test.each([4,6,7])('very short rapid shakes stay limited even when the step counter skips pulses (%s Hz)',hz=>{
  expect(play({hz,width:.015}).speed).toBeLessThan(.5);
});
test('fast running also needs a quicker rhythm, not one large slow sweep',()=>{
  const slow=play({width:.15,hz:1.2}),fast=play({width:.15,hz:2.5});
  expect(slow.speed).toBeLessThan(.65);expect(fast.speed).toBeGreaterThan(.9);
});
test('sustained larger motion ramps up, then smaller motion promptly slows down',()=>{
  const r=play({seconds:12,change:t=>t<4000?.025:t<8000?.15:.025});
  const at=t=>r.frames.find(f=>f.t===t).speed;
  expect(at(4200)).toBeLessThan(.8);expect(at(6500)).toBeGreaterThan(.9);
  expect(at(10500)).toBeLessThan(.5);
});
test('one strong flick among small swings cannot immediately produce a sprint',()=>{
  const r=play({change:t=>t>=4000&&t<4060?.15:.025});
  expect(Math.max(...r.frames.map(f=>f.speed))).toBeLessThan(.6);
});
test('effort speed is unchanged by controller mounting rotation',()=>{
  expect(play({width:.10,rotate}).speed).toBeCloseTo(play({width:.10}).speed,5);
});
test.each([20,1000/60,1000/30])('default two-hand deliberate lift works with modest force while running (%s ms)',sampleMs=>{
  const r=play({sampleMs,width:.05,gesture:(hand,t)=>t>=3000+(hand==='R'?40:0)&&t<3200+(hand==='R'?40:0)?7:0});
  expect(r.jumps).toHaveLength(1);expect(r.jumps[0].t).toBeGreaterThan(3070);expect(r.jumps[0].t).toBeLessThan(3270);
});
test('the chosen gesture works without a real jump, low gravity or stationary rearm',()=>{
  const r=play({gesture:(_,t)=>(t>=3000&&t<3200)||(t>=3900&&t<4100)?7:0});
  expect(r.jumps).toHaveLength(2);
});
test('short running impacts and single-hand lifts do not jump',()=>{
  for(const gesture of [(_,t)=>t%360<60?25:0,(h,t)=>h==='L'&&t>=3000&&t<3300?12:0])
    expect(play({gesture}).jumps).toHaveLength(0);
});
test('opposite and badly separated upward strokes do not jump',()=>{
  for(const gesture of [(h,t)=>16*Math.sin(2*Math.PI*2*t/1000)*(h==='L'?1:-1),
    (h,t)=>t>=3000+(h==='R'?220:0)&&t<3200+(h==='R'?220:0)?9:0])
    expect(play({gesture}).jumps).toHaveLength(0);
});
test('holding an upward sensor level only fires once and a real release allows another lift',()=>{
  expect(play({gesture:(_,t)=>t>=3000?9:0}).jumps).toHaveLength(1);
});
test('missing/stale hand samples cannot qualify a lift; the next fresh lift still works',()=>{
  const r=play({gap:(h,t)=>h==='R'&&t>=3040&&t<3300,
    gesture:(_,t)=>(t>=3000&&t<3200)||(t>=5000&&t<5200)?9:0});
  expect(r.jumps).toHaveLength(1);expect(r.jumps[0].t).toBeGreaterThan(5000);
});
test('reset clears effort, pending gesture and restart speed',()=>{
  const r=play({width:.15});expect(r.speed).toBeGreaterThan(.9);
  r.d.reset();expect(r.d.read(9000)).toEqual({speed:0,laneDelta:0,jump:false,steps:0});
});
test.each([1.2,2,2.8])('learned shared running bounce does not become repeated jumps at %s Hz',hz=>{
  const d=createMotionDetector(),jumps=[];
  for(let t=0;t<12000;t+=20) {
    d.setJumpEnabled(t>=2000);
    for(const hand of ['L','R']) {
      const up=8*Math.sin(2*Math.PI*hz*t/1000);
      d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});
    }
    if(d.read(t).jump)jumps.push(t);
  }
  expect(jumps).toEqual([]);
});
test('stronger shared running bounce also stays separate from the lift command after learning',()=>{
  const d=createMotionDetector(),jumps=[];
  for(let t=0;t<10000;t+=20) {
    d.setJumpEnabled(t>=2000);
    for(const hand of ['L','R']) {
      const up=18*Math.sin(2*Math.PI*1.4*t/1000);
      d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});
    }
    if(d.read(t).jump)jumps.push(t);
  }
  expect(jumps).toEqual([]);
});
test('stopping motion cannot keep the effort limiter running indefinitely',()=>{
  const r=play({seconds:12,change:t=>t<6000?.15:0});
  expect(r.frames.find(f=>f.t===5500).speed).toBeGreaterThan(.9);
  expect(r.speed).toBeLessThan(.01);
});
