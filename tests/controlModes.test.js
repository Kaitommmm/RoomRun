import {test,expect} from 'vitest';
import config from '../src/config.js';
import {createMotionDetector} from '../src/input/motion.js';
import {DEFAULT_SETTINGS,SETTINGS_KEY,normalizeSettings,createSettingsStore,applyMotionSettings} from '../src/settings.js';
import {smallButtonAction,mainButtonAction} from '../src/input/controllerActions.js';
import {createRunControls} from '../src/input/runControls.js';
import {createPhoneSource} from '../src/input/phoneSource.js';
import {createWorld,startRun} from '../src/sim/world.js';
import {resetWorldToMenu} from '../src/sessionMenu.js';
import {controlScheme} from '../src/controlScheme.js';
import {pauseMenuState} from '../src/hud/pauseMenu.js';

const configured=(patch={})=>{
  const cfg=structuredClone(config);applyMotionSettings(cfg,normalizeSettings({...DEFAULT_SETTINGS,...patch}));
  return {cfg,d:createMotionDetector(cfg.motion)};
};
test.each(['progressive','effort'])('both jump options persist independently of %s running',runSpeedMode=>{
  for(const jumpInput of ['flick','button']) {
    const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
    const s=createSettingsStore(storage);s.set({runSpeedMode,jumpInput});
    expect(createSettingsStore(storage).get()).toMatchObject({runSpeedMode,jumpInput});
    expect(JSON.parse(data.get(SETTINGS_KEY))).toMatchObject({runSpeedMode,jumpInput});
  }
});
test('invalid mode names fall back to current defaults; v3 preferences migrate without losing audio',()=>{
  expect(normalizeSettings({runSpeedMode:'bad',jumpInput:'bad'})).toMatchObject({runSpeedMode:'progressive',jumpInput:'flick'});
  const storage={getItem:key=>key==='roomrun.settings.v3'?JSON.stringify({runMode:'exercise',music:10,effects:30,vibration:false,exerciseSensitivity:110}):null};
  expect(createSettingsStore(storage).get()).toMatchObject({runSpeedMode:'progressive',jumpInput:'flick',music:10,effects:30,vibration:false,exerciseSensitivity:110});
});
test('small right jumps only during active button-mode play, and starts/resumes elsewhere',()=>{
  expect(smallButtonAction({hand:'R',phase:'running',jumpInput:'button'})).toBe('jump');
  expect(smallButtonAction({hand:'R',phase:'running',paused:true,jumpInput:'button'})).toBe('start');
  expect(smallButtonAction({hand:'R',phase:'title',jumpInput:'button'})).toBe('start');
  expect(smallButtonAction({hand:'R',phase:'caught',picking:true,jumpInput:'button'})).toBe('sign');
  for(const patch of [{blocked:true},{sticksLost:true}])expect(smallButtonAction({hand:'R',phase:'running',jumpInput:'button',...patch})).toBe(null);
  expect(smallButtonAction({hand:'L',phase:'running',jumpInput:'button'})).toBe('pause');
});
test('button jump is delivered through the game input once, with cooldown and no post-reset action',()=>{
  const {d}=configured({jumpInput:'button'}),phone=createPhoneSource({detector:d});
  d.setJumpEnabled(false);expect(d.requestJump(900)).toBe(false);
  d.setJumpEnabled(true);expect(d.requestJump(1000)).toBe(true);
  expect(phone.read(1000).jump).toBe(true);expect(phone.read(1020).jump).toBe(false);
  expect(d.requestJump(1100)).toBe(false);expect(d.requestJump(1800)).toBe(true);
  phone.reset();expect(phone.read(1820).jump).toBe(false);phone.dispose();
  expect(configured({jumpInput:'flick'}).d.requestJump(1000)).toBe(false);
});
test('button mode ignores physical flicks while flick mode retains the approved gesture',()=>{
  for(const jumpInput of ['flick','button']) {
    const {d}=configured({jumpInput}),jumps=[];
    for(let t=0;t<2600;t+=20) {
      const up=t>=2000&&t<2060?16:t>=2060&&t<2140?-6:0;
      for(const hand of ['L','R'])d.push({hand,ts:t,a:[0,up,0],ag:[0,up+9.81,0]});
      if(d.read(t).jump)jumps.push(t);
    }
    expect(jumps).toHaveLength(jumpInput==='flick'?1:0);
  }
});
test('running selection changes actual speed behavior for the same small fast movement',()=>{
  const results={};
  for(const runSpeedMode of ['progressive','effort']) {
    const {d}=configured({runSpeedMode});let speed=0;
    for(let t=0;t<12000;t+=20) {
      const x=6*Math.sin(2*Math.PI*2.5*t/1000);
      for(const hand of ['L','R'])d.push({hand,ts:t,a:[hand==='L'?x:-x,0,0],ag:[hand==='L'?x:-x,9.81,0]});
      speed=d.read(t).speed;
    }
    results[runSpeedMode]=speed;
  }
  expect(results.progressive).toBeGreaterThan(.99);expect(results.effort).toBeLessThan(.5);
});
test('pause then main left returns to title, clears the round and inputs, then small right starts cleanly',()=>{
  const world=createWorld(config,7);startRun(world);world.coins=12;world.combo=8;world.player.distance=123;
  const identity=world,{d}=configured({jumpInput:'button'}),phone=createPhoneSource({detector:d});
  let menus=0;
  const c=createRunControls({getPhase:()=>world.phase,onStart:()=>{phone.reset();startRun(world);},onPause:()=>phone.reset(),onResume:()=>phone.reset(),
    onMenu:()=>{menus++;phone.reset();resetWorldToMenu(world);}});
  expect(mainButtonAction({hand:'L',phase:world.phase})).toBe('lane');expect(c.menu()).toBe(null);
  c.pause();d.requestJump(1000);phone.handleMessage({t:'tap',hand:'R'},1000);
  expect(mainButtonAction({hand:'L',paused:c.paused,phase:world.phase})).toBe('menu');expect(c.menu()).toBe('menu');
  expect(world).toBe(identity);expect(world.phase).toBe('title');expect([world.player.distance,world.coins,world.combo]).toEqual([0,0,0]);
  expect(c.paused).toBe(false);expect(menus).toBe(1);
  expect(phone.read(1020)).toMatchObject({speed:0,jump:false,laneDelta:0});
  expect(smallButtonAction({hand:'R',phase:world.phase,jumpInput:'button'})).toBe('start');
  c.start();expect(world.phase).toBe('running');expect(c.canAdvance(0)).toBe(false);phone.dispose();
});
test('pause menu names left-main return, right-main restart and right-small resume, even if a stick is lost',()=>{
  const state=pauseMenuState({paused:true,phase:'running'});
  expect(state.menu).toContain('ปุ่มใหญ่ซ้าย');expect(state.canMenu).toBe(true);
  expect(state.resume).toContain('ปุ่มเล็กขวา');expect(state.restart).toContain('ปุ่มใหญ่ขวา');
  expect(pauseMenuState({paused:true,phase:'running',lost:['R']}).canMenu).toBe(true);
  expect(mainButtonAction({hand:'L',paused:true,phase:'running',sticksLost:true})).toBe('menu');
  expect(mainButtonAction({hand:'L',paused:true,phase:'running',blocked:true})).toBe('ignore');
});
test.each(['progressive','effort'])('menu instructions match both jump choices in %s mode',runSpeedMode=>{
  for(const jumpInput of ['flick','button']) {
    const help=controlScheme({runSpeedMode,jumpInput});
    expect(help.howTo).toContain(help.run);expect(help.howTo).toContain(help.jump);
    expect(help.run).toContain(runSpeedMode==='progressive'?'6 วินาที':'กว้างและถี่');
    expect(help.jump).toContain(jumpInput==='button'?'กดปุ่มเล็กขวา':'สะบัดจอยสองข้าง');
    expect(help.howTo.join(' ')).toContain('ปุ่มใหญ่ซ้าย = กลับเมนู');
    expect(help.howTo.join(' ')).toContain('หน้าเมนู / ตอนพัก: ปุ่มเล็กขวา');
  }
});
