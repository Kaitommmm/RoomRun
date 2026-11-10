import { test, expect } from 'vitest';
import { decodeBatteryFrame } from '../src/input/bleProtocol.js';
import { readFileSync } from 'node:fs';

test('decodes actual C++ battery and unknown frames', () => {
  const lines = readFileSync(new URL('./fixtures/ble-battery-frames.txt',import.meta.url),'utf8').trim().split(/\r?\n/);
  const valid = Uint8Array.from(Buffer.from(lines[0],'hex'));
  expect(decodeBatteryFrame(valid)).toEqual({valid:true,percent:69,millivolts:3917});
  expect(decodeBatteryFrame(Uint8Array.from(Buffer.from(lines[1],'hex')))).toEqual({valid:false,percent:null,millivolts:null});
  const padded = new Uint8Array(9); padded.set(valid,3);
  expect(decodeBatteryFrame(padded.subarray(3,7))).toEqual({valid:true,percent:69,millivolts:3917});
});

test('rejects malformed battery packets without inventing a level', () => {
  for (const bytes of [[],[1,69,0],[2,69,77,15],[1,101,77,15],[1,69,0,0],[1,69,255,255],[1,255,77,15]]) {
    expect(decodeBatteryFrame(Uint8Array.from(bytes))).toBeNull();
  }
  expect(decodeBatteryFrame(null)).toBeNull();
});
