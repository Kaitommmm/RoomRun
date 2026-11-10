import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBleDecoder } from '../src/input/bleProtocol.js';

test('actual C++ firmware frames decode to game motion across timestamp and sequence wrap', () => {
  const lines = readFileSync(resolve('tests/fixtures/ble-firmware-frames.txt'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const decode = createBleDecoder();
  const frames = lines.map(line => decode(new Uint8Array(Buffer.from(line, 'hex'))));
  expect(frames[0]).toMatchObject({ seq: 65535, ts: 0xfffffff0, valid: true,
    ag: [-12.34, 9.81, 0], a: [1.23, -4.56, 7.89], tap: false });
  expect(frames[1]).toMatchObject({ seq: 0, ts: 0x100000004, mainDown: false });
  expect(frames[2]).toMatchObject({ seq: 1, ts: 0x100000018, valid: false, tap: true,
    ag: [0, 0, 0], a: [0, 0, 0] });
});

