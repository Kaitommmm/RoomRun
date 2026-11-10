import { test, expect } from 'vitest';
import { decodeBleFrame, createBleDecoder } from '../src/input/bleProtocol.js';

export function packet({ seq = 1, ts = 100, buttons = 0, valid = true, ag = [0, 9.81, 0], a = [0, 0, 0] } = {}) {
  const buffer = new ArrayBuffer(20), data = new DataView(buffer);
  data.setUint8(0, 1); data.setUint8(1, buttons | (valid ? 128 : 0));
  data.setUint16(2, seq, true); data.setUint32(4, ts, true);
  for (let i = 0; i < 3; ++i) {
    data.setInt16(8 + i * 2, Math.round(ag[i] * 100), true);
    data.setInt16(14 + i * 2, Math.round(a[i] * 100), true);
  }
  return data;
}

test('20-byte little-endian frames preserve signed motion and both buttons', () => {
  const value = decodeBleFrame(packet({ buttons: 3, a: [-1.25, 2.5, -3.75] }));
  expect(value).toMatchObject({ seq: 1, ts: 100, mainDown: true, smallDown: true, valid: true, a: [-1.25, 2.5, -3.75] });
  expect(value.ag).toEqual([0, 9.81, 0]);
});

test('decoder respects typed-array offsets and refuses incompatible frames', () => {
  const big = new Uint8Array(40);
  big.set(new Uint8Array(packet().buffer), 7);
  expect(decodeBleFrame(big.subarray(7, 27)).seq).toBe(1);
  expect(decodeBleFrame(new ArrayBuffer(19))).toBe(null);
  expect(decodeBleFrame(new ArrayBuffer(21))).toBe(null);
  const wrong = packet(); wrong.setUint8(0, 2);
  expect(decodeBleFrame(wrong)).toBe(null);
  wrong.setUint8(0, 1); wrong.setUint8(1, 4);
  expect(decodeBleFrame(wrong)).toBe(null);
  expect(decodeBleFrame(null)).toBe(null);
});

test('initial held buttons do not tap; each subsequent stable press taps once', () => {
  const decode = createBleDecoder();
  expect(decode(packet({ seq: 1, buttons: 1 })).tap).toBe(false);
  expect(decode(packet({ seq: 2, buttons: 1 })).tap).toBe(false);
  expect(decode(packet({ seq: 3, buttons: 0 })).tap).toBe(false);
  expect(decode(packet({ seq: 4, buttons: 1 })).tap).toBe(true);
  expect(decode(packet({ seq: 5, buttons: 1 })).tap).toBe(false);
});

test('duplicate/old sequence frames are ignored and both counters can wrap', () => {
  const decode = createBleDecoder();
  expect(decode(packet({ seq: 65535, ts: 0xfffffff0 })).ts).toBe(0xfffffff0);
  expect(decode(packet({ seq: 65535, ts: 0xfffffff0 }))).toBe(null);
  expect(decode(packet({ seq: 65534, ts: 0xffffffe0 }))).toBe(null);
  expect(decode(packet({ seq: 0, ts: 4 })).ts).toBe(0x100000004);
  expect(decode(packet({ seq: 1, ts: 24 })).ts).toBe(0x100000018);
});

