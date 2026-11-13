// @vitest-environment node
import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createRelay } from '../server/relay.mjs';

let relay, dir, sockets;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'soip-relay-'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'index.html'), '<h1>game</h1>');
  writeFileSync(join(dir, 'outside.txt'), 'secret');
  relay = await createRelay({ port: 0, staticDir: join(dir, 'dist'), logDir: join(dir, 'logs') });
  sockets = [];
});
afterEach(async () => {
  for (const s of sockets) s.terminate();
  await relay.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Open a socket and collect parsed messages. */
async function connect(hello) {
  const ws = new WebSocket(`ws://localhost:${relay.port}/ws`);
  sockets.push(ws);
  const inbox = [];
  ws.on('message', (d) => inbox.push(JSON.parse(String(d))));
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  ws.send(JSON.stringify(hello));
  return { ws, inbox, send: (m) => ws.send(JSON.stringify(m)) };
}
const until = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 10)); }
};

test('relay forwards phone motion to game and logs it', async () => {
  const game = await connect({ t: 'hello', role: 'game' });
  await new Promise((r) => setTimeout(r, 30)); // game registered before the phone speaks
  const phone = await connect({ t: 'hello', role: 'phone', hand: 'L' });
  const m = { t: 'm', hand: 'L', ts: 123.5, a: [1, 2, 3], ag: [1, 11.8, 3], r: [10, 20, 30] };
  phone.send(m);
  await until(() => game.inbox.some((x) => x.t === 'm'));
  expect(game.inbox).toContainEqual({ t: 'hello', role: 'phone', hand: 'L' });
  expect(game.inbox.find((x) => x.t === 'm')).toEqual(m);
  const files = readdirSync(join(dir, 'logs'));
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^motion-\d{8}-\d{6}\.jsonl$/);
  await until(() => readFileSync(join(dir, 'logs', files[0]), 'utf8').trim().length > 0);
  const lines = readFileSync(join(dir, 'logs', files[0]), 'utf8').trim().split('\n');
  expect(lines).toHaveLength(1);
  const logged = JSON.parse(lines[0]);
  expect(logged).toMatchObject(m);
  expect(typeof logged.rt).toBe('number'); // relay receive time, for clock alignment later
});

test('relay forwards and logs phone taps as the registered hand', async () => {
  const game = await connect({ t: 'hello', role: 'game' });
  await new Promise((r) => setTimeout(r, 30));
  const phone = await connect({ t: 'hello', role: 'phone', hand: 'R' });
  phone.send({ t: 'tap', hand: 'L', ts: 50 }); // claims the other hand: relay trusts the registration
  await until(() => game.inbox.some((x) => x.t === 'tap'));
  expect(game.inbox.find((x) => x.t === 'tap')).toEqual({ t: 'tap', hand: 'R', ts: 50 });
  const [file] = readdirSync(join(dir, 'logs'));
  await until(() => readFileSync(join(dir, 'logs', file), 'utf8').includes('"tap"'));
});

test('ping gets pong and game gets rtt', async () => {
  const game = await connect({ t: 'hello', role: 'game' });
  const phone = await connect({ t: 'hello', role: 'phone', hand: 'R' });
  phone.send({ t: 'ping', id: 7, ts: 1000 });
  await until(() => phone.inbox.some((x) => x.t === 'pong'));
  expect(phone.inbox.find((x) => x.t === 'pong')).toEqual({ t: 'pong', id: 7, ts: 1000 });
  // the phone reports the round trip it measured on the previous ping
  phone.send({ t: 'ping', id: 8, ts: 2000, rtt: 42 });
  await until(() => game.inbox.some((x) => x.t === 'rtt'));
  expect(game.inbox.find((x) => x.t === 'rtt')).toEqual({ t: 'rtt', hand: 'R', ms: 42 });
});

test('/tunnel-url returns set url', async () => {
  const get = async () => (await fetch(`http://localhost:${relay.port}/tunnel-url`)).json();
  expect(await get()).toEqual({ url: null });
  relay.setTunnelUrl('https://red-cat-12.trycloudflare.com');
  expect(await get()).toEqual({ url: 'https://red-cat-12.trycloudflare.com' });
});

test('serves the built game and refuses paths outside it', async () => {
  const res = await fetch(`http://localhost:${relay.port}/`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/text\/html/);
  expect(await res.text()).toBe('<h1>game</h1>');
  // encoded slash survives URL normalising, so this reaches the server as /../outside.txt once decoded
  expect((await fetch(`http://localhost:${relay.port}/..%2Foutside.txt`)).status).toBe(404);
  expect((await fetch(`http://localhost:${relay.port}/nope.js`)).status).toBe(404);
});

test('garbage and unknown messages do not crash the relay', async () => {
  const game = await connect({ t: 'hello', role: 'game' });
  const phone = await connect({ t: 'hello', role: 'phone', hand: 'L' });
  phone.ws.send('not json');
  phone.send({ t: 'whatever' });
  phone.send({ t: 'm', hand: 'L', ts: 1, a: [0, 0, 0], ag: [0, 0, 0], r: [0, 0, 0] });
  await until(() => game.inbox.some((x) => x.t === 'm'));
});

test('motion from a socket that never said phone hello is dropped; hand is the registered one', async () => {
  const game = await connect({ t: 'hello', role: 'game' });
  const stranger = await connect({ t: 'hello', role: 'game' });
  stranger.send({ t: 'm', hand: 'L', ts: 1, a: [0, 0, 0], ag: [0, 0, 0], r: [0, 0, 0] });
  const phone = await connect({ t: 'hello', role: 'phone', hand: 'R' });
  phone.send({ t: 'm', hand: 'L', ts: 2, a: [0, 0, 0], ag: [0, 0, 0], r: [0, 0, 0] });
  await until(() => game.inbox.some((x) => x.t === 'm'));
  await new Promise((r) => setTimeout(r, 50));
  const ms = game.inbox.filter((x) => x.t === 'm');
  expect(ms).toHaveLength(1);
  expect(ms[0]).toMatchObject({ hand: 'R', ts: 2 });
});

test('oversized messages are refused', async () => {
  const phone = await connect({ t: 'hello', role: 'phone', hand: 'L' });
  const closed = new Promise((r) => phone.ws.once('close', r));
  phone.ws.send('x'.repeat(100_000));
  await closed;
});
