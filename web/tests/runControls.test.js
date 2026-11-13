import { test, expect, vi } from 'vitest';
import { createRunControls } from '../src/input/runControls.js';
import { createWorld, startRun, stepWorld } from '../src/sim/world.js';
import config from '../src/config.js';
import { createMotionDetector } from '../src/input/motion.js';
import { createPhoneSource } from '../src/input/phoneSource.js';
import { createKeyboardSource } from '../src/input/keyboard.js';
import { createCadence } from '../src/input/cadence.js';

function setup() {
  const world = createWorld(structuredClone(config), 41);
  const resetInputs = vi.fn(), stopMotors = vi.fn(), onChange = vi.fn();
  const controls = createRunControls({
    getPhase: () => world.phase,
    onStart: () => { resetInputs(); stopMotors(); startRun(world); },
    onPause: () => { resetInputs(); stopMotors(); },
    onResume: () => resetInputs(), onChange,
  });
  function advance(speed, seconds = 1) {
    if (controls.canAdvance(speed, config.player.startSpeedThreshold)) {
      stepWorld(world, { speed, steps:0, laneDelta:0, jump:false }, seconds);
    }
  }
  return { world, controls, advance, resetInputs, stopMotors, onChange };
}

test('right starts once, holding/repeating right does not reset a running game', () => {
  const s = setup();
  expect(s.controls.press('R')).toBe('start');
  expect(s.world.phase).toBe('running');
  s.advance(1); s.world.coins = 7;
  const distance = s.world.player.distance;
  expect(s.controls.press('R')).toBe(null);
  expect(s.world.player.distance).toBe(distance);
  expect(s.world.coins).toBe(7);
  expect(s.resetInputs).toHaveBeenCalledTimes(1);
});

test('left freezes distance, coins, dog gap and clock; right resumes the same run', () => {
  const s = setup(); s.controls.press('R'); s.advance(1); s.world.coins = 7;
  const before = { distance:s.world.player.distance, coins:s.world.coins, gap:s.world.chaser.gap, runTime:s.world.runTime };
  expect(s.controls.press('L')).toBe('pause');
  expect(s.controls.press('L')).toBe(null);
  for (let i=0;i<20;i++) s.advance(1);
  expect({ distance:s.world.player.distance, coins:s.world.coins, gap:s.world.chaser.gap, runTime:s.world.runTime }).toEqual(before);
  expect(s.stopMotors).toHaveBeenCalledTimes(2);
  expect(s.controls.press('R')).toBe('resume');
  expect(s.world.coins).toBe(7);
  s.advance(1);
  expect(s.world.player.distance).toBeGreaterThan(before.distance);
  expect(s.resetInputs).toHaveBeenCalledTimes(3);
});

test('restart and resume wait for fresh movement instead of letting the dog catch the player during sensor warmup', () => {
  const s = setup(); s.controls.press('R');
  s.world.chaser.gap = 0.1;
  for (let i=0;i<5;i++) s.advance(0);
  expect(s.world.phase).toBe('running');
  expect(s.world.chaser.gap).toBe(0.1);
  s.controls.press('L'); s.controls.press('R');
  for (let i=0;i<5;i++) s.advance(0);
  expect(s.world.chaser.gap).toBe(0.1);
  expect(s.controls.waitingForMotion).toBe(true);
  s.advance(1,0.01);
  expect(s.controls.waitingForMotion).toBe(false);
});

test('right starts a new round after caught and explicit restart clears pause', () => {
  const s = setup(); s.controls.press('R'); s.world.phase='caught'; s.world.coins=9;
  expect(s.controls.press('L')).toBe(null);
  expect(s.controls.press('R')).toBe('start');
  expect(s.world.phase).toBe('running'); expect(s.world.coins).toBe(0);
  s.controls.press('L'); s.controls.restart();
  expect(s.controls.paused).toBe(false);
});

test('left can hold the title screen; unrelated hand names do not start or stop', () => {
  const s = setup(); expect(s.controls.press('L')).toBe('pause');
  s.advance(1); expect(s.world.phase).toBe('title');
  expect(s.controls.press('other')).toBe(null);
  expect(s.controls.press('R')).toBe('start');
});

test('lane and jump actions accumulated while paused are discarded on resume', () => {
  const detector = createMotionDetector(), phone = createPhoneSource({ detector });
  const keyboard = createKeyboardSource({ cadence:createCadence() });
  const reset = () => { phone.reset(); keyboard.reset(); };
  const controls = createRunControls({ getPhase:()=> 'running', onStart:reset, onPause:reset, onResume:reset });
  controls.press('L');
  for (let t=100;t<=180;t+=20) for (const hand of ['L','R']) {
    phone.handleMessage({t:'m',hand,ts:t,a:[0,18,0],ag:[0,27.81,0]},t);
  }
  phone.handleMessage({t:'tap',hand:'R',ts:200},200);
  keyboard.handleKey('Space',false,200);
  keyboard.handleKey('ArrowLeft',false,200);
  controls.press('R');
  expect(phone.read(220)).toMatchObject({jump:false,laneDelta:0,speed:0});
  expect(keyboard.read(220)).toMatchObject({jump:false,laneDelta:0,speed:0});
  phone.dispose();
});
