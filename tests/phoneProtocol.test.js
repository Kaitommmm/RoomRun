import { test, expect } from 'vitest';
import { motionMessage, wsUrl } from '../src/phone/protocol.js';

test('motionMessage packs a DeviceMotionEvent, rounded to keep packets small', () => {
  const e = {
    acceleration: { x: 0.123456, y: -1.5, z: 2 },
    accelerationIncludingGravity: { x: 0.1, y: 9.80665, z: -0.0004 },
    rotationRate: { alpha: 10.55555, beta: -20, gamma: 30 },
  };
  expect(motionMessage('L', e, 1234.5678)).toEqual({
    t: 'm', hand: 'L', ts: 1234.568, a: [0.123, -1.5, 2], ag: [0.1, 9.807, 0], r: [10.556, -20, 30],
  });
});

test('missing sensor parts become nulls instead of crashing (some Androids give no acceleration)', () => {
  const e = { acceleration: null, accelerationIncludingGravity: { x: null, y: 1, z: 2 }, rotationRate: null };
  expect(motionMessage('R', e, 5)).toEqual({ t: 'm', hand: 'R', ts: 5, a: null, ag: [null, 1, 2], r: null });
});

test('wsUrl follows the page: wss behind the https tunnel, ws on plain http', () => {
  expect(wsUrl({ protocol: 'https:', host: 'red-cat-12.trycloudflare.com' })).toBe('wss://red-cat-12.trycloudflare.com/ws');
  expect(wsUrl({ protocol: 'http:', host: 'localhost:8787' })).toBe('ws://localhost:8787/ws');
});
