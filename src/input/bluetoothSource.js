import { BLE_SERVICE, BLE_MOTION, BLE_CONTROL, BLE_BATTERY, HAPTIC_COMMAND, createBleDecoder, decodeBatteryFrame } from './bleProtocol.js';

const PRIORITY = { test: 0, hit: 1, pack: 2, caught: 3, stop: 100 };
export function createBluetoothSource({
  receive, onChange = () => {}, bluetooth = globalThis.navigator?.bluetooth,
  secure = globalThis.isSecureContext !== false,
  storage, clock = () => performance.now(),
}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const slots = Object.fromEntries(['L', 'R'].map(hand => [hand, {
    hand, device: null, stream: null, control: null, listener: null, disconnectListener: null,
    connected: false, connecting: false, sensorOk: null, name: '', error: '', generation: 0,
    writeBusy: false, pending: null,
    phase: 'idle', diagnostic: '', disconnectedToken: null,
    battery: null, batterySupported: false, batteryStream: null, batteryListener: null, batteryTimer: null,
  }]));
  let disposed = false;
  const remembered = hand => { try { return storage?.getItem('roomrun.ble.' + hand); } catch { return null; } };
  const snapshot = () => Object.fromEntries(Object.entries(slots).map(([hand, e]) => [hand, {
    connected: e.connected, connecting: e.connecting, sensorOk: e.sensorOk,
    name: e.name, error: e.error, remembered: !!e.device || !!remembered(hand),
    phase: e.phase, diagnostic: e.diagnostic,
    battery: e.battery ? { ...e.battery } : null, batterySupported: e.batterySupported,
  }]));
  const changed = () => onChange(snapshot());
  const rawError = error => ([error?.name, error?.message].filter(Boolean).join(': ') || String(error)).slice(0, 800);
  function phase(e, name) { e.phase = name; changed(); }
  function clean(e, disconnect = true) {
    clearTimeout(e.batteryTimer);
    e.batteryStream?.removeEventListener('characteristicvaluechanged', e.batteryListener);
    e.battery = e.batteryStream = e.batteryListener = e.batteryTimer = null;
    e.batterySupported = false;
    e.stream?.removeEventListener('characteristicvaluechanged', e.listener);
    e.device?.removeEventListener('gattserverdisconnected', e.disconnectListener);
    e.stream = e.control = e.listener = e.disconnectListener = null;
    e.connected = e.connecting = e.writeBusy = false;
    e.pending = null;
    e.sensorOk = null;
    if (disconnect) { try { e.device?.gatt?.disconnect(); } catch { /* already disconnected */ } }
  }
  const failureText = error => error?.name === 'NotFoundError' ? 'ยังไม่ได้เลือกจอย กดเชื่อมเพื่อลองอีกครั้ง' :
    error?.name === 'SecurityError' ? 'เปิดเกมผ่าน HTTPS หรือ localhost แล้วอนุญาต Bluetooth' :
    error?.message || 'เชื่อมไม่สำเร็จ เปิดจอยแล้วลองอีกครั้ง';

  async function connect(hand, selected = null) {
    const e = slots[hand];
    if (!e || disposed || e.connecting || e.connected) return false;
    if (!secure || !bluetooth?.requestDevice) {
      e.error = !secure ? 'เปิดผ่าน HTTPS หรือ localhost เพื่อใช้ Bluetooth' :
        'คอมใช้ Chrome/Edge; iPhone เปิดเกมใน Bluefy';
      changed(); return false;
    }
    if (Object.values(slots).some(other => other.connecting)) {
      e.error = 'รอให้จอยอีกข้างเชื่อมเสร็จก่อน'; changed(); return false;
    }
    const token = ++e.generation;
    e.connecting = true; e.error = ''; e.diagnostic = ''; e.disconnectedToken = null;
    e.phase = '1/7 device picker';
    changed();
    const current = () => !disposed && e.generation === token;
    const check = () => { if (!current()) throw new Error('Connection cancelled'); };
    try {
      // requestDevice runs directly from the click, before any unrelated await.
      const device = selected || await bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE] }] });
      check();
      if (Object.values(slots).some(other => other !== e && other.device?.id === device.id &&
          (other.connected || other.connecting))) throw new Error('จอยนี้เชื่อมอีกข้างแล้ว ให้เลือกจอยอีกอัน');
      e.device = device; e.name = device.name || 'RoomRun';
      e.disconnectListener = () => {
        if (!current()) return;
        const during = e.phase;
        e.disconnectedToken = token;
        ++e.generation;
        clean(e, false);
        e.error = 'จอยหลุดระหว่าง ' + during;
        e.diagnostic = 'Disconnected during ' + during + '. Browser received gattserverdisconnected.';
        changed();
      };
      device.addEventListener('gattserverdisconnected', e.disconnectListener);
      phase(e, '2/7 GATT connect');
      const server = await device.gatt.connect(); check();
      phase(e, '3/7 discover service');
      const service = await server.getPrimaryService(BLE_SERVICE); check();
      phase(e, '4/7 motor characteristic');
      e.control = await service.getCharacteristic(BLE_CONTROL); check();
      phase(e, '5/7 motion characteristic');
      e.stream = await service.getCharacteristic(BLE_MOTION); check();
      const write = e.control.writeValueWithResponse || e.control.writeValue;
      if (!write) throw new Error('เบราว์เซอร์นี้ส่งคำสั่งกลับจอยไม่ได้');
      phase(e, '6/7 stop motor write');
      await write.call(e.control, new Uint8Array([0])); check();
      const decode = createBleDecoder();
      e.listener = event => {
        if (!current()) return;
        const frame = decode(event.target?.value);
        if (!frame) return;
        if (e.sensorOk !== frame.valid) { e.sensorOk = frame.valid; changed(); }
        if (frame.valid) receive({ t: 'm', hand, ts: frame.ts, a: frame.a, ag: frame.ag }, clock());
        if (frame.tap) receive({ t: 'tap', hand, ts: frame.ts }, clock());
      };
      e.stream.addEventListener('characteristicvaluechanged', e.listener);
      receive({ t: 'hello', role: 'phone', hand }, clock());
      phase(e, '7/7 start notifications');
      await e.stream.startNotifications(); check();
      // Battery is optional: previous RoomRun firmware must remain playable.
      phase(e, 'battery monitor (optional)');
      try {
        e.batteryStream = await service.getCharacteristic(BLE_BATTERY); check();
        const batteryValue = value => {
          if (!current()) return;
          const frame = decodeBatteryFrame(value);
          if (!frame) return;
          e.battery = frame;
          clearTimeout(e.batteryTimer);
          e.batteryTimer = setTimeout(() => {
            if (!current()) return;
            e.battery = null; changed();
          }, 5000);
          changed();
        };
        e.batteryListener = event => batteryValue(event.target?.value);
        e.batteryStream.addEventListener('characteristicvaluechanged', e.batteryListener);
        await e.batteryStream.startNotifications(); check();
        e.batterySupported = true;
        batteryValue(await e.batteryStream.readValue()); check();
      } catch (error) {
        check();
        clearTimeout(e.batteryTimer);
        e.batteryStream?.removeEventListener('characteristicvaluechanged', e.batteryListener);
        e.batteryStream = e.batteryListener = e.batteryTimer = e.battery = null;
        e.batterySupported = false;
        // Do not break motion or haptics because the optional monitor is absent.
      }
      e.connected = true; e.connecting = false;
      e.phase = 'ready';
      try { storage?.setItem('roomrun.ble.' + hand, device.id); } catch { /* permission still usable this session */ }
      changed(); return true;
    } catch (error) {
      if (current()) {
        const during = e.phase;
        clean(e);
        e.error = 'เชื่อมไม่สำเร็จ: ' + during;
        e.diagnostic = rawError(error);
        if (error?.name === 'NotFoundError' && during === '1/7 device picker') e.error = failureText(error);
        changed();
      } else if (!disposed && e.disconnectedToken === token && e.generation === token + 1) {
        // A disconnect can arrive before the failed GATT operation rejects.
        // Keep its error, but never overwrite a newer connection's state.
        if (error?.message !== 'Connection cancelled') e.diagnostic += '\n' + rawError(error);
        changed();
      }
      return false;
    }
  }

  async function reconnect(hand) {
    const e = slots[hand];
    if (!e || e.connected || e.connecting || disposed) return false;
    let device = e.device;
    try {
      if (!device && bluetooth?.getDevices) {
        const id = remembered(hand);
        device = (await bluetooth.getDevices()).find(candidate => candidate.id === id);
      }
    } catch { /* use the normal chooser below, on a fresh click */ }
    if (!device) { e.error = 'กดเลือกจอยเพื่ออนุญาตการเชื่อมอีกครั้ง'; changed(); return false; }
    return connect(hand, device);
  }

  function disconnect(hand) {
    const e = slots[hand];
    if (!e) return;
    ++e.generation;
    clean(e);
    e.error = '';
    e.phase = 'idle'; e.diagnostic = ''; e.disconnectedToken = null;
    changed();
  }

  function transmit(e, item) {
    const token = e.generation;
    e.writeBusy = true;
    const write = e.control.writeValueWithResponse || e.control.writeValue;
    Promise.resolve().then(() => {
      if (!e.connected || token !== e.generation) return;
      return write.call(e.control, new Uint8Array([HAPTIC_COMMAND[item.pattern]]));
    }).catch(error => {
      if (token !== e.generation) return;
      ++e.generation;
      clean(e);
      e.phase = 'haptic write'; e.diagnostic = rawError(error);
      e.error = 'ส่งคำสั่งสั่นไม่สำเร็จ: ' + failureText(error);
      changed();
    }).finally(() => {
      if (token !== e.generation) return;
      e.writeBusy = false;
      const pending = e.pending;
      e.pending = null;
      if (pending && e.connected && clock() - pending.at < 300) transmit(e, pending);
    });
  }

  function sendHaptic(pattern, hand = null) {
    if (!Object.prototype.hasOwnProperty.call(HAPTIC_COMMAND, pattern) || disposed) return false;
    let accepted = false;
    for (const e of Object.values(slots)) {
      if ((hand && hand !== e.hand) || !e.connected || !e.control) continue;
      const item = { pattern, at: clock() };
      if (e.writeBusy) {
        if (!e.pending || PRIORITY[pattern] >= PRIORITY[e.pending.pattern]) e.pending = item;
      } else transmit(e, item);
      accepted = true;
    }
    return accepted;
  }

  return {
    connect, reconnect, disconnect, sendHaptic, snapshot,
    supported: !!bluetooth?.requestDevice && secure,
    async available() {
      try { return bluetooth?.getAvailability ? await bluetooth.getAvailability() : !!bluetooth?.requestDevice; }
      catch { return false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const hand of ['L', 'R']) disconnect(hand);
    },
  };
}

