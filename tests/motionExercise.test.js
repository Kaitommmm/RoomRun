import { test, expect } from 'vitest';
import { createMotionDetector } from '../src/input/motion.js';
import currentConfig from '../src/config.js';
// Isolated legacy gate/cadence regressions; default effort/lift integration: effortLift.test.js.
const config={...currentConfig,motion:{...currentConfig.motion,jumpMode:'paired',runSpeedMode:'cadence',exerciseEffort:{enabled:false}}};

function rotate([x,y,z]) {
  const a=0.8,b=1.1;
  const u=x*Math.cos(a)-y*Math.sin(a), v=x*Math.sin(a)+y*Math.cos(a);
  return [u*Math.cos(b)+z*Math.sin(b),v,-u*Math.sin(b)+z*Math.cos(b)];
}
function drive({ fn, duration=5000, hands=['L'], rotation=v=>v, threshold=config.motion.exerciseThreshold } = {}) {
  const detector=createMotionDetector({...config.motion,runMode:'exercise',exerciseThreshold:threshold});
  const frames=[];
  for(let t=0;t<duration;t+=20) {
    const [x=0,y=0,z=0]=fn(t);
    const a=rotation([x,y,z]), ag=rotation([x,y,z+9.80665]);
    for(const hand of hands) detector.push({hand,ts:t,a,ag});
    frames.push({t,...detector.read(t)});
  }
  return {detector,frames,steps:frames.reduce((n,x)=>n+x.steps,0)};
}
const jog=(t)=>[1.5*Math.sin(t/1000*2*Math.PI*1.2),0,9*Math.sin(t/1000*2*Math.PI*2.4)];

test('gentle movement on any axis does not start exercise running',()=>{
  for(const fn of [t=>[3*Math.sin(t/1000*2*Math.PI*1.5),0,0],
    t=>[0,3*Math.sin(t/1000*2*Math.PI*1.5),0],
    t=>[0,0,3*Math.sin(t/1000*2*Math.PI*2.4)]]) {
    const result=drive({fn,rotation:rotate});
    expect(result.steps).toBe(0);
    expect(result.frames.every(x=>x.speed===0)).toBe(true);
  }
});

test('regular jogging-style body bounce works with one upright or tilted controller',()=>{
  const plain=drive({fn:jog}), tilted=drive({fn:jog,rotation:rotate});
  expect(plain.steps).toBeGreaterThanOrEqual(8);
  expect(tilted.steps).toBe(plain.steps);
  expect(tilted.frames.at(-1).speed).toBeGreaterThan(0.65);
  expect(tilted.detector.exerciseStatus(5000).ready).toBe(true);
});

test('one or two isolated strong pulses do not start running',()=>{
  const result=drive({fn:t=>[0,0,(t>=200&&t<280)||(t>=650&&t<730)?10:0],duration:1200});
  expect(result.steps).toBe(0);
  expect(result.frames.every(x=>x.speed===0)).toBe(true);
});

test('widely spaced strong arm pushes do not satisfy a continuous jogging rhythm',()=>{
  const result=drive({fn:t=>[0,0,10*Math.sin(t/1000*2*Math.PI*0.8)]});
  expect(result.steps).toBe(0);
  expect(result.frames.every(x=>x.speed===0)).toBe(true);
});

test('three unevenly timed strong pushes do not pass the rhythm gate',()=>{
  const result=drive({fn:t=>[0,0,[200,500,1180].some(start=>t>=start&&t<start+80)?10:0],duration:1700});
  expect(result.steps).toBe(0);
  expect(result.frames.every(x=>x.speed===0)).toBe(true);
});

test('both hands on the same body bounce do not double-count exercise steps',()=>{
  expect(drive({fn:jog,hands:['L','R']}).steps).toBe(drive({fn:jog}).steps);
});

test('exercise stops and requires a new rhythm after a pause',()=>{
  const result=drive({fn:t=>t<2500?jog(t):[0,0,0]});
  expect(result.frames.some(x=>x.speed>0.65)).toBe(true);
  expect(result.frames.at(-1).speed).toBeLessThan(0.02);
  expect(result.detector.exerciseStatus(5000)).toMatchObject({ready:false,beats:0,stepsPerMinute:0});
});

test('linear acceleration alone supports exercise, and maximum sensitivity still rejects light waving',()=>{
  expect(drive({fn:t=>[0,0,3*Math.sin(t/1000*2*Math.PI*2.4)],threshold:4.4/1.2}).steps).toBe(0);
  const detector=createMotionDetector(config.motion);
  for(let t=0;t<3000;t+=20) { detector.push({hand:'L',ts:t,a:jog(t)}); detector.read(t); }
  expect(detector.read(3000).speed).toBeGreaterThan(0.5);
});

test('exercise accepts all three axes, either starting direction and diagonal mounts at the same pace',()=>{
  const results=[];
  for(const axis of [0,1,2]) for(const sign of [-1,1]) for(const rotation of [v=>v,rotate]) {
    results.push(drive({fn:t=>[0,1,2].map(i=>i===axis?sign*7*Math.sin(t/1000*2*Math.PI*2):0),rotation,duration:6000}));
  }
  for(const result of results) {
    expect(result.steps).toBeGreaterThanOrEqual(8);
    expect(result.frames.at(-1).speed).toBeCloseTo(.91,1);
    expect(result.steps).toBe(results[0].steps);
  }
});

test('all-direction exercise rejects stationary offsets and single-sample spikes',()=>{
  for(const fn of [()=>[5,-3,2],t=>t%500===0?[12,-8,6]:[0,0,0]]) {
    const result=drive({fn});
    expect(result.steps).toBe(0);
    expect(result.frames.at(-1).speed).toBe(0);
  }
});

test('moderate exercise bounce starts more easily while retaining the rhythm requirement',()=>{
  const result=drive({fn:t=>[0,0,5.2*Math.sin(t/1000*2*Math.PI*2)],duration:6000});
  expect(result.steps).toBeGreaterThanOrEqual(8);
  expect(result.frames.at(-1).speed).toBeGreaterThan(0.55);
});

test('character speed follows detected cadence across slow, medium and fast jogging',()=>{
  const rates=[1,1.4,1.8,2.5];
  const speeds=rates.map(hz=>drive({fn:t=>[0,0,7*Math.sin(t/1000*2*Math.PI*hz)],duration:6000}).frames.at(-1).speed);
  const expected=[.45,.64,.82,1];
  expected.forEach((value,i)=>expect(speeds[i]).toBeCloseTo(value,1));
  for(let i=1;i<speeds.length;i++) expect(speeds[i]-speeds[i-1]).toBeGreaterThan(0.1);
});

test('shaking harder at the same cadence does not give an extra speed boost',()=>{
  const speeds=[6,11].map(amp=>drive({fn:t=>[0,0,amp*Math.sin(t/1000*2*Math.PI*2)],duration:6000}).frames.at(-1).speed);
  expect(Math.abs(speeds[0]-speeds[1])).toBeLessThan(0.04);
});

test('changing running pace does not reset a rhythm that was already acquired',()=>{
  const fn=t=>{
    const seconds=t/1000;
    const phase=1.6*Math.min(seconds,3)+3*Math.max(0,Math.min(seconds-3,3))+1.6*Math.max(0,seconds-6);
    return [0,0,7*Math.sin(2*Math.PI*phase)];
  };
  const result=drive({fn,duration:9000});
  expect(result.frames.filter(x=>x.t>2500).every(x=>x.speed>0.1)).toBe(true);
  expect(result.frames.find(x=>x.t===5800).speed).toBeGreaterThan(result.frames.find(x=>x.t===2800).speed+0.25);
  expect(result.frames.at(-1).speed).toBeLessThan(.8);
  expect(result.frames.at(-1).speed).toBeLessThan(result.frames.find(x=>x.t===5800).speed-.15);
});

test('one missed jogging pulse slows the character instead of stopping the run outright',()=>{
  const result=drive({fn:t=>[0,0,t>=3050&&t<3300?0:7*Math.sin(t/1000*2*Math.PI*2)],duration:5000});
  expect(result.frames.filter(x=>x.t>=3000&&x.t<=4200).every(x=>x.speed>0.1)).toBe(true);
  expect(result.frames.at(-1).speed).toBeGreaterThan(0.55);
});
