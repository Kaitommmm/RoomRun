import './bluetoothPanel.css';
import { createDeviceView } from './deviceView.js';

export function createBluetoothPanel(controller, { onRestart = () => {}, onViewChange = () => {}, onSoundTest = () => Promise.resolve(false), onSettings = () => {} } = {}) {
  const panel = document.createElement('details');
  panel.id = 'roomrun-bluetooth';
  panel.open = true;
  panel.innerHTML = `
    <summary><span>RoomRun Bluetooth</span><b data-count>0 / 2</b></summary>
    <div class="rr-bt-body">
      <div class="rr-view-picker" role="group" aria-label="มุมมองการเล่น">
        <button type="button" data-view="desktop" aria-pressed="false">คอม</button>
        <button type="button" data-view="mobile" aria-pressed="false">มือถือ</button>
        <button type="button" data-view="auto" aria-pressed="false">อัตโนมัติ</button>
      </div>
      <small class="rr-view-label" data-view-label></small>
      <button type="button" class="rr-settings-open" data-settings>ตั้งค่าเกม</button>
      <p class="rr-bt-mode" data-run-mode></p>
      <p class="rr-device-guide" data-device-guide></p>
      <p class="rr-rotate-hint">วางมือถือแนวนอนเพื่อเห็นสนามได้กว้างขึ้น</p>
      <div class="rr-audio-controls"><button type="button" data-sound>เปิด / ทดสอบเสียง</button><p data-sound-status role="status">ถ้าเงียบ ให้ปิดโหมดเงียบของ iPhone และเพิ่มระดับเสียงสื่อ</p></div>
      <p class="rr-bt-intro">เปิดจอย แล้วเลือกด้านที่ต้องการเชื่อม<br><small>ไม่ต้องตั้ง Wi-Fi หรือ IP</small></p>
      <div data-slots></div>
      <small>RoomRun Battery 1 · Bluetooth diagnostics 2</small>
      <p class="rr-bt-battery-help">% เป็นค่าประมาณจากแรงดัน ขณะชาร์จค่าอาจสูงขึ้น ดูสถานะชาร์จ/เต็มจากไฟชาร์จบน XIAO</p>
      <p class="rr-bt-help" data-help role="status"></p>
      <a class="rr-bluefy" href="https://apps.apple.com/app/id1492822055" target="_blank" rel="noopener noreferrer">Bluefy สำหรับ iPhone</a>
      <div class="rr-bt-actions"><button type="button" data-start>เริ่มเกมใหม่</button><button type="button" data-hide>ย่อหน้าต่างนี้</button></div>
      <div class="rr-bt-mobile"><span>เล่นบน iPhone ผ่าน Bluefy</span><p data-mobile-help>iPhone ต้องเปิดลิงก์เกมแบบ HTTPS ใน Bluefy</p><button type="button" data-copy hidden>คัดลอกลิงก์เกม</button></div>
    </div>`;
  const slots = {};
  panel.querySelector('[data-settings]').onclick = onSettings;
  let soundTimer;
  panel.querySelector('[data-sound]').onclick = () => {
    const button = panel.querySelector('[data-sound]');
    const status = panel.querySelector('[data-sound-status]');
    button.disabled = true;
    status.textContent = 'กำลังเปิดเสียง…';
    // Invoke synchronously within the click; waiting first loses user activation.
    let result;
    try { result = onSoundTest(); } catch { result = false; }
    const timeout = new Promise(resolve => { soundTimer = setTimeout(() => resolve(false), 3000); });
    Promise.race([Promise.resolve(result).catch(() => false), timeout]).then(ready => {
      clearTimeout(soundTimer);
      if (!panel.isConnected) return;
      button.disabled = false;
      status.textContent = ready ? 'ส่งเสียงทดสอบแล้ว · ถ้าไม่ได้ยิน ให้ปิดโหมดเงียบและตรวจระดับเสียง / หูฟัง'
        : 'ยังเปิดเสียงไม่ได้ ลองแตะอีกครั้ง และตรวจโหมดเงียบ / ระดับเสียง';
    });
  };
  const deviceView = createDeviceView((mode, preference) => {
    document.documentElement.dataset.deviceView = mode;
    panel.querySelectorAll('[data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === preference));
    });
    panel.querySelector('[data-view-label]').textContent =
      (preference === 'auto' ? 'อัตโนมัติ · ' : 'มุมมอง · ') + (mode === 'mobile' ? 'มือถือ' : 'คอม');
    panel.querySelector('[data-device-guide]').textContent = mode === 'mobile'
      ? 'iPhone / iPad เปิดผ่าน Bluefy · Android เปิดผ่าน Chrome แล้วเลือกจอยด้านล่าง'
      : 'เปิดผ่าน Chrome หรือ Edge แล้วเลือกจอย หรือใช้ A / D สลับกันเพื่อวิ่ง · ลูกศรเปลี่ยนเลน · Space กระโดด';
    onViewChange(mode);
  });
  panel.querySelectorAll('[data-view]').forEach(button => {
    button.onclick = () => deviceView.select(button.dataset.view);
  });
  for (const hand of ['L', 'R']) {
    const row = document.createElement('section');
    row.className = 'rr-bt-slot';
    row.innerHTML = `<div class="rr-bt-slot-head"><b>${hand === 'L' ? 'L · จอยซ้าย' : 'R · จอยขวา'}</b><span data-status>ยังไม่เชื่อม</span></div>
      <small data-name></small><div class="rr-bt-buttons"><button type="button" data-connect>เลือกจอย</button><button type="button" data-reconnect hidden>เชื่อมเดิม</button><button type="button" data-test hidden>ลองสั่น</button></div><p data-error role="status"></p>`;
    const phase = document.createElement('small');
    phase.dataset.phase = '';
    const diagnostic = document.createElement('pre');
    diagnostic.dataset.diagnostic = '';
    row.append(phase, diagnostic);
    const battery = document.createElement('p');
    battery.dataset.battery = '';
    row.querySelector('[data-name]').after(battery);
    slots[hand] = row;
    row.querySelector('[data-connect]').onclick = () => {
      if (controller.snapshot()[hand].connected) controller.disconnect(hand);
      else controller.connect(hand);
    };
    row.querySelector('[data-reconnect]').onclick = () => controller.reconnect(hand);
    row.querySelector('[data-test]').onclick = () => controller.sendHaptic('test', hand);
    panel.querySelector('[data-slots]').append(row);
  }
  const help = panel.querySelector('[data-help]');
  const bluefy = panel.querySelector('.rr-bluefy');
  bluefy.hidden = controller.supported;
  if (!controller.supported) help.textContent = 'คอม: เปิดเกมใน Chrome หรือ Edge · iPhone: เปิดลิงก์ HTTPS ใน Bluefy';
  else controller.available().then(available => {
    if (!available) help.textContent = 'ไม่พบ Bluetooth ที่พร้อมใช้ กรุณาเปิด Bluetooth บนอุปกรณ์นี้แล้วลองอีกครั้ง';
  });
  panel.querySelector('[data-start]').onclick = () => {
    onRestart();
    if (deviceView.current === 'mobile') panel.open = false;
  };
  panel.querySelector('[data-hide]').onclick = () => { panel.open = false; };
  let mobileUrl = null;
  panel.querySelector('[data-copy]').onclick = async () => {
    if (!mobileUrl) return;
    try {
      await navigator.clipboard.writeText(mobileUrl);
      panel.querySelector('[data-mobile-help]').textContent = 'คัดลอกแล้ว เปิด Bluefy บน iPhone แล้ววางลิงก์นี้';
    } catch {
      panel.querySelector('[data-mobile-help]').textContent = mobileUrl;
    }
  };
  document.body.append(panel);
  function update(state = controller.snapshot()) {
    let count = 0;
    for (const hand of ['L', 'R']) {
      const s = state[hand], row = slots[hand];
      if (s.connected) ++count;
      row.dataset.connected = String(s.connected);
      const status = row.querySelector('[data-status]');
      status.textContent = s.connecting ? 'กำลังเชื่อม…' :
        s.connected ? (s.sensorOk === false ? 'เชื่อมแล้ว · ตรวจ gyro' : s.sensorOk ? 'พร้อมเล่น' : 'รอข้อมูลจอย…') : 'ยังไม่เชื่อม';
      row.querySelector('[data-name]').textContent = s.name;
      const button = row.querySelector('[data-connect]');
      button.textContent = s.connected ? 'ตัดการเชื่อมต่อ' : 'เลือกจอย';
      button.disabled = s.connecting || !controller.supported;
      row.querySelector('[data-reconnect]').hidden = !s.remembered || s.connected;
      row.querySelector('[data-reconnect]').disabled = s.connecting || !controller.supported;
      row.querySelector('[data-test]').hidden = !s.connected;
      row.querySelector('[data-error]').textContent = s.error || '';
      row.querySelector('[data-phase]').textContent = s.phase && s.phase !== 'idle' ? s.phase : '';
      row.querySelector('[data-phase]').hidden = !s.connecting && !s.error;
      row.querySelector('[data-diagnostic]').textContent = s.diagnostic || '';
      row.querySelector('[data-diagnostic]').hidden = !s.diagnostic;
      const battery = row.querySelector('[data-battery]');
      battery.dataset.level = '';
      if (!s.connected) battery.textContent = '';
      else if (!s.batterySupported) battery.textContent = 'ยังไม่มีข้อมูลแบต — ใช้เฟิร์มแวร์ RoomRun Battery 1 และวงจรวัด D1';
      else if (!s.battery) battery.textContent = 'รอข้อมูลแบตใหม่…';
      else if (!s.battery.valid) battery.textContent = 'อ่านแบตไม่ได้ — ตรวจวงจรแบ่งแรงดันและ D1';
      else {
        const { percent, millivolts } = s.battery;
        battery.dataset.level = percent <= 25 ? 'low' : percent <= 50 ? 'medium' : 'high';
        battery.textContent = 'แบต ≈ ' + percent + '% · ' + (millivolts / 1000).toFixed(3) + ' V' +
          (percent <= 25 ? ' · แบตต่ำ เตรียมชาร์จ' : '');
      }
    }
    panel.querySelector('[data-count]').textContent = count + ' / 2';
  }
  update();
  return {
    update,
    setRunMode(mode) {
      panel.querySelector('[data-run-mode]').textContent = mode === 'exercise' ? 'ออกกำลังกาย · ทุกทิศทาง'
        : mode === 'allAxes' ? 'เล่นเบา / ทดสอบ · ทุกทิศทาง' : 'ขึ้นลงตามแรงโน้มถ่วง · แบบเดิม';
    },
    setMobileUrl(url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return;
        parsed.searchParams.set('view', 'mobile');
        mobileUrl = parsed.href;
        panel.querySelector('[data-mobile-help]').textContent = mobileUrl;
        panel.querySelector('[data-copy]').hidden = false;
      } catch { /* no public game link yet */ }
    },
    dispose() { clearTimeout(soundTimer); deviceView.dispose(); panel.remove(); },
  };
}

