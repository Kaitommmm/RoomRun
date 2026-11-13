import { test, expect } from 'vitest';
import config from '../src/config.js';
import { createWorld, startRun } from '../src/sim/world.js';
import { createRunControls } from '../src/input/runControls.js';
import { smallButtonAction, mainButtonAction } from '../src/input/controllerActions.js';
import { pauseMenuState } from '../src/hud/pauseMenu.js';

function setup() {
  const world = createWorld(structuredClone(config), 3); startRun(world);
  let resets = 0;
  const c = createRunControls({ getPhase: () => world.phase, onStart() { resets++; startRun(world); }, onPause() {}, onResume() {} });
  const small = hand => { const action = smallButtonAction({ hand, phase: world.phase }); if(action === 'pause') c.pause(); else if(action === 'start') c.start(); };
  const big = (hand, extra = {}) => { const action = mainButtonAction({ hand, paused:c.paused, phase:world.phase, ...extra }); if(action === 'restart') c.restart(); return action; };
  return { world, c, small, big, resets: () => resets };
}
test('pause then small right continues exactly the same run', () => {
  const s = setup(); s.world.player.distance = 137; s.world.coins = 23; s.world.combo = 8;
  s.small('L'); expect(s.c.paused).toBe(true); s.small('R');
  expect([s.world.player.distance, s.world.coins, s.world.combo]).toEqual([137,23,8]); expect(s.resets()).toBe(0);
  expect(s.c.canAdvance(0)).toBe(false); expect(s.c.canAdvance(1)).toBe(true);
});
test('pause then main right starts a new run and waits for fresh running', () => {
  const s = setup(); s.world.player.distance = 137; s.world.coins = 23; s.world.combo = 8;
  s.small('L'); expect(s.big('R')).toBe('restart');
  expect([s.world.player.distance,s.world.coins,s.world.combo]).toEqual([0,0,0]); expect(s.resets()).toBe(1);
  expect(s.c.paused).toBe(false); expect(s.c.canAdvance(0)).toBe(false);
  expect(s.world.player.lane).toBe(0); expect(s.big('R')).toBe('lane'); expect(s.resets()).toBe(1);
});
test('main right remains a lane command during a run and avatar selection; paused left routes to the menu', () => {
  const s = setup(); expect(s.big('R')).toBe('lane'); expect(s.resets()).toBe(0);
  s.small('L'); expect(s.big('L')).toBe('menu'); expect(s.c.paused).toBe(true);
  expect(mainButtonAction({hand:'R',phase:'caught'})).toBe('lane');
});
test('missing sticks or an open dialog cannot trigger hidden restarts or queued lanes', () => {
  const s = setup(); s.small('L');
  expect(s.big('R',{sticksLost:true})).toBe('ignore'); expect(s.big('R',{blocked:true})).toBe('ignore'); expect(s.resets()).toBe(0);
  expect(mainButtonAction({hand:'R',phase:'running',blocked:true})).toBe('ignore');
});
test('pause UI names both physical buttons and says that restart clears progress', () => {
  const menu = pauseMenuState({paused:true,waitingForMotion:false,phase:'running'});
  expect(menu.canResume).toBe(true); expect(menu.canRestart).toBe(true);
  expect(menu.resume).toContain('ปุ่มเล็กขวา'); expect(menu.restart).toContain('ปุ่มใหญ่ขวา'); expect(menu.consequence).toContain('ล้างระยะ');
  expect(pauseMenuState({paused:true,lost:['L'],phase:'running'}).canRestart).toBe(false);
  expect(pauseMenuState({paused:true,phase:'title'}).canRestart).toBe(false);
  expect(pauseMenuState({paused:false,waitingForMotion:true,phase:'running'}).canRestart).toBe(false);
});
