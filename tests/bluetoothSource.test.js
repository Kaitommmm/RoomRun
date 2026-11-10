import { test, expect, vi } from 'vitest';
import { createBluetoothSource } from '../src/input/bluetoothSource.js';
import { BLE_SERVICE, BLE_MOTION, BLE_CONTROL, BLE_BATTERY } from '../src/input/bleProtocol.js';

function packet(seq, buttons = 0, valid = true) {
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, 1); d.setUint8(1, buttons | (valid ? 128 : 0));
  d.setUint16(2, seq, true); d.setUint32(4, seq * 20, true);
  d.setInt16(10, 981, true); d.setInt16(16, 125, true);
  return d;
}
const settle = async () => { for (let i = 0; i < 12; ++i) await Promise.resolve(); };
class Characteristic extends EventTarget {
  writes = [];
  value = null;
  async startNotifications() { return this; }
  async writeValueWithResponse(bytes) { this.writes.push([...bytes]); }
  notify(value) { this.value = value; this.dispatchEvent(new Event('characteristicvaluechanged')); }
}
class Device extends EventTarget {
  constructor(id, battery = false) {
    super(); this.id = id; this.name = 'RoomRun-' + id;
    this.stream = new Characteristic(); this.control = new Characteristic();
    this.battery = new Characteristic();
    this.battery.value = new DataView(Uint8Array.from([1,69,77,15]).buffer);
    this.battery.readValue = async () => this.battery.value;
    const service = { getCharacteristic: async uuid => {
      if (uuid === BLE_MOTION) return this.stream;
      if (uuid === BLE_CONTROL) return this.control;
      if (uuid === BLE_BATTERY && battery) return this.battery;
      throw new DOMException('No matching characteristic','NotFoundError');
    }};
    this.gatt = {
      connected: false,
      connect: async () => { this.gatt.connected = true; return {
        getPrimaryService: async uuid => { expect(uuid).toBe(BLE_SERVICE); return service; },
      }; },
      disconnect: () => { this.gatt.connected = false; this.dispatchEvent(new Event('gattserverdisconnected')); },
    };
  }
}
function setup(devices = [new Device('left'), new Device('right')]) {
  const received = [], choices = [], memory = new Map();
  let next = 0, now = 100;
  const bluetooth = {
    requestDevice: async options => { choices.push(options); return devices[next++]; },
    getDevices: async () => devices,
    getAvailability: async () => true,
  };
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const source = createBluetoothSource({ bluetooth, secure: true, storage,
    receive: (message, time) => received.push({ message, time }), clock: () => now });
  return { source, devices, received, choices, memory, storage, bluetooth, setTime: value => { now = value; } };
}

test('two sticks connect without Wi-Fi settings, map hands, and send lane taps once', async () => {
  const s = setup();
  expect(await s.source.connect('L')).toBe(true);
  expect(await s.source.connect('R')).toBe(true);
  expect(s.choices[0].filters[0].services).toEqual([BLE_SERVICE]);
  expect(s.source.snapshot().L.connected).toBe(true);
  expect(s.devices[0].control.writes).toEqual([[0]]);
  s.devices[0].stream.notify(packet(1));
  s.devices[0].stream.notify(packet(2, 1));
  s.devices[0].stream.notify(packet(3, 1));
  s.devices[1].stream.notify(packet(1));
  s.devices[1].stream.notify(packet(2, 1));
  const taps = s.received.filter(x => x.message.t === 'tap').map(x => x.message.hand);
  expect(taps).toEqual(['L', 'R']);
  expect(s.received.find(x => x.message.t === 'm').message).toMatchObject({ a: [0, 1.25, 0], ag: [0, 9.81, 0] });
  s.source.dispose();
});

test('same device cannot occupy both hands and a bad sensor never sends stale motion', async () => {
  const device = new Device('same'), s = setup([device, device]);
  expect(await s.source.connect('L')).toBe(true);
  expect(await s.source.connect('R')).toBe(false);
  expect(s.source.snapshot().L.connected).toBe(true);
  device.stream.notify(packet(1, 0, false));
  device.stream.notify(packet(2, 1, false));
  expect(s.received.filter(x => x.message.t === 'm')).toHaveLength(0);
  expect(s.received.filter(x => x.message.t === 'tap')).toHaveLength(1);
  expect(s.source.snapshot().L.sensorOk).toBe(false);
  s.source.dispose();
});

test('haptic writes are serialized and capture replaces a pending lower-priority command', async () => {
  const s = setup(); await s.source.connect('L');
  const control = s.devices[0].control; control.writes = [];
  let release;
  control.writeValueWithResponse = bytes => {
    control.writes.push([...bytes]);
    return control.writes.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  };
  expect(s.source.sendHaptic('hit')).toBe(true);
  await settle();
  expect(s.source.sendHaptic('hit')).toBe(true);
  expect(s.source.sendHaptic('caught')).toBe(true);
  s.source.sendHaptic('hit');
  release(); await settle();
  expect(control.writes).toEqual([[1], [2]]);
  expect(s.source.sendHaptic('toString')).toBe(false);
  s.source.dispose();
});

test('old queued feedback is dropped and disconnect clears pending commands', async () => {
  const s = setup(); await s.source.connect('L');
  const control = s.devices[0].control; control.writes = [];
  let release;
  control.writeValueWithResponse = bytes => { control.writes.push([...bytes]); return new Promise(r => { release = r; }); };
  s.source.sendHaptic('hit'); await settle();
  s.source.sendHaptic('caught'); s.setTime(1000);
  release(); await settle();
  expect(control.writes).toEqual([[1]]);
  s.source.sendHaptic('hit'); await settle();
  s.source.sendHaptic('caught');
  s.devices[0].gatt.disconnect();
  release(); await settle();
  expect(control.writes).toEqual([[1], [1]]);
  expect(s.source.sendHaptic('caught')).toBe(false);
  expect(s.source.snapshot().L.connected).toBe(false);
  s.source.dispose();
});

test('remembered permission permits reconnect without opening a device chooser', async () => {
  const s = setup(); await s.source.connect('L'); s.source.disconnect('L');
  expect(await s.source.reconnect('L')).toBe(true);
  expect(s.choices).toHaveLength(1);
  s.source.dispose();
  const source2 = createBluetoothSource({ receive() {}, bluetooth: s.bluetooth, storage: s.storage, secure: true });
  expect(await source2.reconnect('L')).toBe(true);
  expect(s.choices).toHaveLength(1);
  source2.dispose();
});

test('unsupported browsers/HTTP fail with guidance and cancelled pickers do not connect later', async () => {
  const missing = createBluetoothSource({ receive() {}, bluetooth: {}, storage: null, secure: true });
  expect(await missing.connect('L')).toBe(false);
  expect(missing.snapshot().L.error).toContain('Bluefy');
  const s = setup();
  let choose;
  s.bluetooth.requestDevice = () => new Promise(resolve => { choose = resolve; });
  const waiting = s.source.connect('L');
  s.source.disconnect('L');
  choose(s.devices[0]);
  expect(await waiting).toBe(false);
  expect(s.devices[0].gatt.connected).toBe(false);
  s.source.dispose();
});

test('a failed motor write disconnects and reports an error instead of keeping an old queue', async () => {
  const s = setup(); await s.source.connect('L');
  s.devices[0].control.writeValueWithResponse = async () => { throw new Error('GATT failure'); };
  s.source.sendHaptic('caught'); await settle();
  expect(s.source.snapshot().L.connected).toBe(false);
  expect(s.source.snapshot().L.error).toContain('GATT failure');
  expect(s.source.sendHaptic('hit')).toBe(false);
  s.source.dispose();
});

test('disconnect during GATT connect retains the rejected operation error and phase', async () => {
  const s = setup(), device = s.devices[0];
  device.gatt.connect = async () => {
    device.gatt.disconnect();
    throw new DOMException('Connection failed for unknown reason.', 'NetworkError');
  };
  expect(await s.source.connect('L')).toBe(false);
  expect(s.source.snapshot().L).toMatchObject({ connected: false, connecting: false, phase: '2/7 GATT connect' });
  expect(s.source.snapshot().L.error).toContain('2/7 GATT connect');
  expect(s.source.snapshot().L.diagnostic).toContain('NetworkError: Connection failed for unknown reason.');
  s.source.dispose();
});

test.each(['service', 'write', 'notifications'])('reports the failing %s stage instead of a generic disconnect', async kind => {
  const s = setup(), device = s.devices[0];
  let expected;
  if (kind === 'service') {
    device.gatt.connect = async () => ({ getPrimaryService: async () => {
      throw new DOMException('No matching service.', 'NotFoundError');
    }});
    expected = '3/7 discover service';
  } else if (kind === 'write') {
    device.control.writeValueWithResponse = async () => { throw new Error('Write failed.'); };
    expected = '6/7 stop motor write';
  } else {
    device.stream.startNotifications = async () => { throw new Error('Subscription failed.'); };
    expected = '7/7 start notifications';
  }
  expect(await s.source.connect('L')).toBe(false);
  const state = s.source.snapshot().L;
  expect(state.phase).toBe(expected);
  expect(state.error).toContain(expected);
  expect(state.diagnostic).toMatch(/No matching service|Write failed|Subscription failed/);
  expect(state.connected).toBe(false);
  s.source.dispose();
});

test('late rejection from an old disconnected attempt cannot overwrite a successful reconnect', async () => {
  const s = setup(), device = s.devices[0], originalConnect = device.gatt.connect;
  let reject;
  device.gatt.connect = () => new Promise((resolve, fail) => { reject = fail; });
  const first = s.source.connect('L');
  await settle();
  device.gatt.disconnect();
  device.gatt.connect = originalConnect;
  expect(await s.source.reconnect('L')).toBe(true);
  reject(new Error('Late failure'));
  expect(await first).toBe(false);
  expect(s.source.snapshot().L).toMatchObject({ connected: true, phase: 'ready', error: '', diagnostic: '' });
  s.source.dispose();
});

test('battery read/notify stays per hand; invalid sensing is unknown and does not break controls', async () => {
  const s = setup([new Device('battery',true),new Device('older')]);
  await s.source.connect('L'); await s.source.connect('R');
  expect(s.source.snapshot().L.battery).toEqual({valid:true,percent:69,millivolts:3917});
  expect(s.source.snapshot().R).toMatchObject({connected:true,batterySupported:false,battery:null});
  s.devices[0].battery.notify(new DataView(Uint8Array.from([1,20,144,13]).buffer));
  expect(s.source.snapshot().L.battery).toMatchObject({percent:20,millivolts:3472});
  s.devices[0].battery.notify(new DataView(Uint8Array.from([1,255,0,0]).buffer));
  expect(s.source.snapshot().L.battery.valid).toBe(false);
  s.devices[0].stream.notify(packet(1));
  expect(s.received.some(x=>x.message.t==='m')).toBe(true);
  expect(s.source.sendHaptic('test','L')).toBe(true);
  s.source.disconnect('L');
  expect(s.source.snapshot().L.battery).toBeNull();
  s.source.dispose();
});

test('battery notification timeout clears the displayed level without disconnecting the game', async () => {
  vi.useFakeTimers();
  const s = setup([new Device('battery',true)]);
  try {
    await s.source.connect('L');
    await vi.advanceTimersByTimeAsync(5001);
    expect(s.source.snapshot().L).toMatchObject({connected:true,batterySupported:true,battery:null});
  } finally { s.source.dispose(); vi.useRealTimers(); }
});

test('optional battery subscription failure leaves motion/haptics connected', async () => {
  const s = setup([new Device('battery',true)]);
  s.devices[0].battery.startNotifications = async () => { throw new Error('Not supported'); };
  expect(await s.source.connect('L')).toBe(true);
  expect(s.source.snapshot().L).toMatchObject({connected:true,batterySupported:false,battery:null});
  s.source.dispose();
});


test('small button press is sent as its own message, separate from lane taps', async () => {
  const s = setup();
  await s.source.connect('L');
  s.devices[0].stream.notify(packet(1));
  s.devices[0].stream.notify(packet(2, 2));
  s.devices[0].stream.notify(packet(3, 2));
  expect(s.received.filter(x => x.message.t === 'small').map(x => x.message.hand)).toEqual(['L']);
  expect(s.received.filter(x => x.message.t === 'tap')).toHaveLength(0);
  s.source.dispose();
});

test('a stick that drops can be reconnected without opening the device picker again', async () => {
  const s = setup();
  await s.source.connect('L');
  s.devices[0].gatt.disconnect();
  expect(s.source.snapshot().L.connected).toBe(false);
  expect(await s.source.reconnect('L')).toBe(true);
  expect(s.choices).toHaveLength(1);
  s.source.dispose();
});
