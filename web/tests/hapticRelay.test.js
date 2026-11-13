// @vitest-environment node
// Exercise production game, sender and relay code with an in-memory WebSocket transport.
// Network sockets are deliberately not used, so this also runs in restricted sandboxes.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import config from '../src/config.js';
import { createWorld, startRun, stepWorld, triggerChase } from '../src/sim/world.js';
import { createPhoneSource } from '../src/input/phoneSource.js';
import { createGameHaptics } from '../src/input/haptics.js';

const bus = vi.hoisted(() => ({ server: null }));
vi.mock('node:http', () => ({
  createServer: () => ({
    once() {},
    removeListener() {},
    listen(_port, done) { done(); },
    address() { return { port: 8787 }; },
    close(done) { done(); },
  }),
}));
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    WebSocketServer: class extends EventEmitter {
      constructor() { super(); this.clients = new Set(); bus.server = this; }
      close(done) { done(); }
    },
  };
});
import { createRelay } from '../server/relay.mjs';

class BrowserSocket extends EventTarget {
  static instances = [];
  constructor() {
    super();
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.inbox = [];
    this.peer = new EventEmitter();
    this.peer.readyState = 0;
    this.peer.bufferedAmount = 0;
    this.peer.send = text => {
      this.inbox.push(JSON.parse(text));
      this.dispatchEvent(new MessageEvent('message', { data: text }));
    };
    this.peer.terminate = () => this.close();
    bus.server.clients.add(this.peer);
    bus.server.emit('connection', this.peer);
    BrowserSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      this.readyState = this.peer.readyState = 1;
      this.dispatchEvent(new Event('open'));
    });
  }
  send(text) {
    if (this.readyState !== 1) throw new Error('socket is closed');
    this.peer.emit('message', Buffer.from(text));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = this.peer.readyState = 3;
    bus.server.clients.delete(this.peer);
    this.peer.emit('close');
    this.dispatchEvent(new Event('close'));
  }
}
const flush = () => new Promise(resolve => queueMicrotask(resolve));
const buzzes = client => client.inbox.filter(m => m.t === 'buzz');

let relay, dir, sources;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'roomrun-haptic-memory-'));
  mkdirSync(join(dir, 'dist'));
  BrowserSocket.instances = [];
  sources = [];
  vi.stubGlobal('WebSocket', BrowserSocket);
  relay = await createRelay({ port: 0, staticDir: join(dir, 'dist'), logDir: join(dir, 'logs') });
});
afterEach(async () => {
  for (const source of sources) source.dispose();
  for (const client of BrowserSocket.instances) client.close();
  await relay.close();
  vi.unstubAllGlobals();
  // mkdtemp creates only this task's own temporary directory.
  expect(resolve(dir).startsWith(resolve(tmpdir()) + sep)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});
async function connect(hello) {
  const client = new BrowserSocket();
  await flush();
  client.send(JSON.stringify(hello));
  return client;
}
async function gameSource() {
  const source = createPhoneSource({
    url: 'ws://localhost:8787/ws',
    detector: { push() {}, read: () => ({ speed: 0, laneDelta: 0 }) },
  });
  sources.push(source);
  await flush();
  return source;
}

test('real collision/capture/pack events reach both sticks as firmware-compatible commands', async () => {
  const left = await connect({ t: 'hello', role: 'phone', hand: 'L', dev: 'stick' });
  const right = await connect({ t: 'hello', role: 'phone', hand: 'R', dev: 'stick' });
  const phone = await connect({ t: 'hello', role: 'phone', hand: 'L' });
  const source = await gameSource();
  let now = 0;
  const haptics = createGameHaptics(p => source.sendHaptic(p), () => now);
  const cfg = structuredClone(config);
  cfg.track.startClear = 1e9;
  const world = createWorld(cfg, 1);
  startRun(world);
  const idle = { speed: 0, laneDelta: 0, jump: false, steps: 0 };
  world.track.obstacles.push({ id: 1, kind: 'cart', type: 'lane', lane: 0, z: 0, hit: false });
  expect(haptics.onEvents(stepWorld(world, idle, 1 / 120))).toBe(true);
  now = 10;
  world.chaser.gap = 0;
  expect(haptics.onEvents(stepWorld(world, idle, 1 / 120))).toBe(true);
  now = 1000;
  startRun(world);
  haptics.onEvents(['run-start']);
  triggerChase(world);
  haptics.onEvents(stepWorld(world, { ...idle, speed: 1 }, 1 / 120));
  world.chase.t = 0;
  expect(haptics.onEvents(stepWorld(world, { ...idle, speed: 1 }, 1 / 120))).toBe(true);
  const patterns = ['hit', 'caught', 'stop', 'pack'];
  expect(buzzes(left).map(m => m.pattern)).toEqual(patterns);
  expect(buzzes(right)).toEqual(buzzes(left));
  expect(buzzes(phone)).toEqual([]);
  mkdirSync(resolve('../validation'), { recursive: true });
  writeFileSync(resolve('../validation/relay-frames.jsonl'),
    buzzes(left).map(m => JSON.stringify(m)).join('\n') + '\n');
});

test('relay accepts named feedback only from registered games and normalizes the frame', async () => {
  const stick = await connect({ t: 'hello', role: 'phone', hand: 'L', dev: 'stick' });
  const stranger = await connect({ t: 'hello', role: 'unknown' });
  stranger.send(JSON.stringify({ t: 'buzz', pattern: 'caught' }));
  stick.send(JSON.stringify({ t: 'buzz', pattern: 'caught' }));
  expect(buzzes(stick)).toEqual([]);
  const game = await connect({ t: 'hello', role: 'game' });
  game.send(JSON.stringify({ t: 'buzz', pattern: 'forever', duration: 999999 }));
  expect(buzzes(stick)).toEqual([]);
  game.send(JSON.stringify({ t: 'buzz', pattern: 'hit', duration: 999999, extra: 'ignored' }));
  expect(buzzes(stick)).toEqual([{ t: 'buzz', pattern: 'hit' }]);
});

test('sender drops offline/invalid/congested feedback and does not replay on reconnect', async () => {
  const stick = await connect({ t: 'hello', role: 'phone', hand: 'L', dev: 'stick' });
  const source = await gameSource();
  const browser = BrowserSocket.instances.at(-1);
  browser.bufferedAmount = 128;
  expect(source.sendHaptic('hit')).toBe(false);
  browser.bufferedAmount = 0;
  expect(source.sendHaptic('forever')).toBe(false);
  expect(buzzes(stick)).toEqual([]);
  expect(source.sendHaptic('pack')).toBe(true);
  source.dispose();
  expect(buzzes(stick).map(m => m.pattern)).toEqual(['pack', 'stop']);
  expect(source.sendHaptic('caught')).toBe(false);
  const next = await gameSource();
  expect(buzzes(stick).map(m => m.pattern)).toEqual(['pack', 'stop']);
  expect(next.sendHaptic('hit')).toBe(true);
});

test('slow sticks are skipped; disconnecting the game sends stop to live sticks', async () => {
  const slow = await connect({ t: 'hello', role: 'phone', hand: 'L', dev: 'stick' });
  const fast = await connect({ t: 'hello', role: 'phone', hand: 'R', dev: 'stick' });
  slow.peer.bufferedAmount = 500;
  const source = await gameSource();
  expect(source.sendHaptic('caught')).toBe(true);
  expect(buzzes(slow)).toEqual([]);
  expect(buzzes(fast)).toEqual([{ t: 'buzz', pattern: 'caught' }]);
  source.dispose();
  expect(buzzes(fast).at(-1)).toEqual({ t: 'buzz', pattern: 'stop' });
});

test('adding feedback preserves motion forwarding, tap hand selection and ping/pong', async () => {
  const stick = await connect({ t: 'hello', role: 'phone', hand: 'R', dev: 'stick' });
  const source = await gameSource();
  stick.send(JSON.stringify({ t: 'tap', hand: 'L', ts: 1 }));
  expect(source.read(10).laneDelta).toBe(1);
  expect(source.read(11).laneDelta).toBe(0);
  stick.send(JSON.stringify({ t: 'ping', id: 7, ts: 100 }));
  expect(stick.inbox.at(-1)).toEqual({ t: 'pong', id: 7, ts: 100 });
});

