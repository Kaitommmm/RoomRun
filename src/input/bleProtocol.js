export const BLE_SERVICE = 'd2870001-7b44-4c7b-a142-66d27c9a8b18';
export const BLE_MOTION = 'd2870002-7b44-4c7b-a142-66d27c9a8b18';
export const BLE_CONTROL = 'd2870003-7b44-4c7b-a142-66d27c9a8b18';
export const BLE_BATTERY = 'd2870004-7b44-4c7b-a142-66d27c9a8b18';
export const HAPTIC_COMMAND = Object.freeze({ stop: 0, hit: 1, caught: 2, pack: 3, test: 4 });

export function decodeBatteryFrame(value) {
  let view;
  if (value instanceof DataView) view = value;
  else if (ArrayBuffer.isView(value)) view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  else if (value instanceof ArrayBuffer) view = new DataView(value);
  else return null;
  if (view.byteLength !== 4 || view.getUint8(0) !== 1) return null;
  const percent = view.getUint8(1), millivolts = view.getUint16(2, true);
  if (percent === 255 && millivolts === 0) return { valid: false, percent: null, millivolts: null };
  if (percent > 100 || millivolts < 2800 || millivolts > 4350) return null;
  return { valid: true, percent, millivolts };
}

export function decodeBleFrame(value) {
  let view;
  if (value instanceof DataView) view = value;
  else if (ArrayBuffer.isView(value)) view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  else if (value instanceof ArrayBuffer) view = new DataView(value);
  else return null;
  if (view.byteLength !== 20 || view.getUint8(0) !== 1) return null;
  const flags = view.getUint8(1);
  if (flags & ~0x83) return null;
  const vector = start => [0, 1, 2].map(i => view.getInt16(start + i * 2, true) / 100);
  return {
    seq: view.getUint16(2, true), ts: view.getUint32(4, true),
    mainDown: !!(flags & 1), smallDown: !!(flags & 2), valid: !!(flags & 0x80),
    ag: vector(8), a: vector(14),
  };
}

export function createBleDecoder() {
  let lastSeq = null, lastRaw = null, timestamp = 0, mainDown = null, smallDown = null;
  return value => {
    const frame = decodeBleFrame(value);
    if (!frame) return null;
    if (lastSeq != null) {
      const advance = (frame.seq - lastSeq) & 0xffff;
      if (advance === 0 || advance > 0x8000) return null;
    }
    const advance = lastRaw == null ? 0 : (frame.ts - lastRaw) >>> 0;
    if (lastRaw != null && advance > 0x80000000) return null;
    timestamp = lastRaw == null ? frame.ts : timestamp + advance;
    // Holding the button while connecting must not create an unintended lane change.
    const tap = mainDown === false && frame.mainDown;
    const smallTap = smallDown === false && frame.smallDown;
    mainDown = frame.mainDown;
    smallDown = frame.smallDown;
    lastSeq = frame.seq;
    lastRaw = frame.ts;
    return { ...frame, ts: timestamp, tap, smallTap };
  };
}

