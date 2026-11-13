import './settingsPanel.css';
import { controlScheme } from '../controlScheme.js';
import { sensitivityFromMotion } from '../settings.js';

export function createSettingsPanel({ store, motion, onOpen = () => {}, onClose = () => {}, onJumpDiagnostics = () => {}, onSoundTest = () => Promise.resolve(false) }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'roomrun-settings';
  dialog.setAttribute('aria-labelledby', 'rr-settings-title');
  dialog.innerHTML = `
    <header><div><small>ROOMRUN</small><h2 id="rr-settings-title">ตั้งค่าเกม</h2></div><button type="button" data-close aria-label="ปิดการตั้งค่า">ปิด</button></header>
    <p class="rr-settings-intro">เกมหยุดชั่วคราวระหว่างตั้งค่า เปลี่ยนค่าแล้วใช้ได้ทันที</p>
    <fieldset><legend>จอยและการเคลื่อนไหว</legend>
      <label for="rr-run-speed">การวิ่ง</label>
      <select id="rr-run-speed" data-setting="runSpeedMode"><option value="progressive">ค่อย ๆ เร่งตามเวลา</option><option value="effort">แรงแกว่งและจังหวะ</option></select>
      <p class="rr-setting-tip" data-mode-tip></p>
      <label for="rr-jump-input">การกระโดด</label>
      <select id="rr-jump-input" data-setting="jumpInput"><option value="flick">สะบัดจอยสองข้างขึ้นพร้อมกัน</option><option value="button">กดปุ่มเล็กขวา</option></select>
      <p class="rr-setting-tip" data-jump-tip></p>
      <label for="rr-sensitivity">ความไวของจอย <output data-value="sensitivity"></output></label>
      <input id="rr-sensitivity" data-setting="sensitivity" type="range" min="50" max="250" step="5">
      <button type="button" data-tune>ปรับความไวจากท่าเล่น · 3 วินาที</button>
      <p class="rr-setting-tip" data-tune-status role="status">เลือกทุกทิศทาง แล้วแตะปุ่มและขยับจอยตามท่าที่ใช้เล่นจริง</p>
      <p class="rr-setting-tip" data-exercise-status role="status"></p>
      <p class="rr-setting-tip">ค่าสูงนับก้าวง่ายขึ้น ถ้าวางนิ่งแล้ววิ่งเอง ให้ลดความไว · การกระโดดยังใช้แรงขึ้นลงของจอยสองข้าง</p>
      <div class="rr-motion-meter"><span>จอยซ้าย</span><meter data-meter="L" min="0" max="15" value="0"></meter><output data-motion="L">ยังไม่มีข้อมูล</output><small data-detected="L"></small></div>
      <div class="rr-motion-meter"><span>จอยขวา</span><meter data-meter="R" min="0" max="15" value="0"></meter><output data-motion="R">ยังไม่มีข้อมูล</output><small data-detected="R"></small></div>
      <p class="rr-setting-tip">ถือจอยแนวตั้งหรือนอนก็ได้ จับการขยับขึ้นลง ซ้ายขวา หน้า–หลัง และแนวเฉียง เซนเซอร์ที่มือยืนยันการก้าวเท้าจริงไม่ได้</p>
      <label class="rr-setting-check"><input type="checkbox" data-setting="vibration"> แรงสั่นในเกม</label>
    </fieldset>
    <fieldset><legend>เสียง</legend>
      <button type="button" data-sound>เปิด / ทดสอบเสียง</button><p class="rr-setting-tip" data-sound-status role="status">กดเพื่อเปิดและทดสอบเสียง หากไม่ได้ยินให้ตรวจระดับเสียงและโหมดเงียบ</p>
      <label for="rr-music">เพลง <output data-value="music"></output></label><input id="rr-music" data-setting="music" type="range" min="0" max="100" step="5">
      <label for="rr-effects">เอฟเฟกต์ <output data-value="effects"></output></label><input id="rr-effects" data-setting="effects" type="range" min="0" max="100" step="5">
      <p class="rr-setting-tip">เลื่อนเป็น 0 เพื่อปิดเสียงส่วนนั้น บน iPhone ให้ปิดโหมดเงียบและเพิ่มระดับเสียงสื่อด้วย</p>
    </fieldset>
    <fieldset><legend>ภาพ</legend><label for="rr-graphics">คุณภาพกราฟิก</label>
      <select id="rr-graphics" data-setting="graphics"><option value="standard">มาตรฐาน</option><option value="battery">ประหยัด · ลดความละเอียดและแสงเรือง</option></select>
    </fieldset>
    <footer><small data-save-status></small><button type="button" data-reset>คืนค่าเริ่มต้น</button><button type="button" data-done>กลับไปเล่น</button></footer>`;
  const jumpButton = document.createElement('button');
  jumpButton.type = 'button'; jumpButton.textContent = 'ทดสอบกระโดด / บันทึกสัญญาณ';
  jumpButton.onclick = onJumpDiagnostics;
  const jumpSection = document.createElement('fieldset');
  const jumpLegend = document.createElement('legend'); jumpLegend.textContent = 'การกระโดด';
  jumpSection.append(jumpLegend, jumpButton); dialog.querySelector('footer').before(jumpSection);
  document.body.append(dialog);
  let soundTimer;
  dialog.querySelector('[data-sound]').onclick = () => {
    const button=dialog.querySelector('[data-sound]'),status=dialog.querySelector('[data-sound-status]');
    button.disabled=true;status.textContent='กำลังเปิดและทดสอบเสียง…';
    // Keep AudioContext unlock in the user click, including on iPhone.
    let result;try { result=onSoundTest(); } catch { result=false; }
    const timeout=new Promise(resolve=>{soundTimer=setTimeout(()=>resolve(false),3000);});
    Promise.race([Promise.resolve(result).catch(()=>false),timeout]).then(ready=>{
      clearTimeout(soundTimer);if(!dialog.isConnected)return;
      button.disabled=false;
      status.textContent=ready?'เปิดเสียงแล้ว · หากไม่ได้ยินให้ตรวจระดับเสียงและโหมดเงียบ':'ยังเปิดเสียงไม่ได้ · ลองกดอีกครั้งและตรวจระดับเสียง';
    });
  };
  let tuning = false, tuningTimer = null;
  function sync() {
    const values = store.get();
    const exercise = values.runMode === 'exercise';
    const sensitivity = dialog.querySelector('[data-setting="sensitivity"]');
    sensitivity.min = exercise ? '60' : '50'; sensitivity.max = exercise ? '120' : '250';
    dialog.querySelectorAll('[data-setting]').forEach(input => {
      const value = input.dataset.setting === 'sensitivity' && exercise ? values.exerciseSensitivity : values[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
    });
    dialog.querySelectorAll('[data-value]').forEach(output => { output.textContent = (output.dataset.value === 'sensitivity' && exercise ? values.exerciseSensitivity : values[output.dataset.value]) + '%'; });
    const help=controlScheme(values);
    dialog.querySelector('[data-mode-tip]').textContent = help.run;
    dialog.querySelector('[data-jump-tip]').textContent = help.jump + ' หน้าเมนู/ตอนพัก ปุ่มเล็กขวายังใช้เริ่มเกม/วิ่งต่อ';
    dialog.querySelector('[data-exercise-status]').hidden = !exercise;
    dialog.querySelector('[data-tune]').disabled = tuning || values.runMode === 'vertical';
    dialog.querySelector('[data-tune]').textContent = exercise ? 'วัดท่าออกกำลังกาย · 3 วินาที' : 'ปรับความไวจากท่าเล่น · 3 วินาที';
    if (!tuning) dialog.querySelector('[data-tune-status]').textContent = exercise
      ? 'การปรับอัตโนมัติใช้แรงขยับทุกทิศทาง และยังคงเกณฑ์แรงขั้นต่ำของโหมดออกกำลังกาย'
      : 'แตะปุ่มแล้วขยับจอยตามท่าที่ใช้เล่นจริง';
    for (const key of ['sensitivity', 'runSpeedMode', 'jumpInput']) dialog.querySelector(`[data-setting="${key}"]`).disabled = tuning;
    dialog.querySelector('[data-reset]').disabled = tuning;
    dialog.querySelector('[data-save-status]').textContent = store.saved ? 'จำค่าไว้ในเบราว์เซอร์นี้' : 'ใช้ค่าได้ในรอบนี้ เบราว์เซอร์ไม่อนุญาตให้จำค่า';
  }
  dialog.querySelectorAll('[data-setting]').forEach(input => {
    input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
      const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
      const key = input.dataset.setting === 'sensitivity' && store.get().runMode === 'exercise' ? 'exerciseSensitivity' : input.dataset.setting;
      store.set({ [key]: value, ...(key === 'runSpeedMode' ? {runMode:'exercise'} : {}) });
    });
  });
  dialog.querySelector('[data-reset]').onclick = () => store.reset();
  dialog.querySelector('[data-tune]').onclick = () => {
    if (tuning) return;
    tuning = true; sync();
    const started = performance.now();
    const mode = store.get().runMode;
    const status = dialog.querySelector('[data-tune-status]');
    status.textContent = mode === 'exercise' ? 'กำลังวัด 3 วินาที… วิ่งอยู่กับที่พร้อมแกว่งแขนตามท่าที่จะเล่นจริง ขยับได้ทุกทิศทาง' : 'กำลังวัด 3 วินาที… ถือจอยตามท่าเล่น แล้วขยับเป็นจังหวะต่อเนื่อง';
    tuningTimer = setTimeout(() => {
      tuning = false; tuningTimer = null;
      const fresh = Object.values(motion.levels(performance.now())).some(x => x.magnitude != null);
      const sensitivity = fresh ? sensitivityFromMotion(motion.samplesSince(started), mode) : null;
      sync();
      if (sensitivity == null) status.textContent = mode === 'exercise'
        ? 'แรงขยับยังไม่พอหรือข้อมูลไม่ครบ คงค่าเดิมไว้ ตรวจการเชื่อมต่อ แล้วลองขยับต่อเนื่องใหม่'
        : 'ยังวัดการขยับไม่พอ ตรวจว่าจอยเชื่อมอยู่ แล้วลองขยับต่อเนื่องอีกครั้ง';
      else {
        store.set(mode === 'exercise' ? { exerciseSensitivity:sensitivity } : { sensitivity });
        status.textContent = `ตั้งความไว ${sensitivity}% แล้ว ลองกลับไปเล่นได้เลย`;
      }
    }, 3000);
  };
  for (const selector of ['[data-close]', '[data-done]']) dialog.querySelector(selector).onclick = () => dialog.close();
  let frame = null, lastUpdate = -Infinity;
  function update(now) {
    if (!dialog.open) return;
    if (now - lastUpdate >= 100) {
      lastUpdate = now;
      const exercise = motion.exerciseStatus(now);
      dialog.querySelector('[data-exercise-status]').textContent = exercise.ready ? (exercise.progressive ? (exercise.runningNow ? 'ตรวจพบการวิ่งต่อเนื่อง · กำลังเร่ง' : 'ไม่พบจังหวะวิ่งล่าสุด · กำลังชะลอ') : `จังหวะ ${exercise.stepsPerMinute} รอบ/นาที · แรงแกว่ง ${exercise.effortPercent}%`) : `รอจังหวะต่อเนื่อง ${exercise.beats}/3 · แกว่งแขนสลับ`;
      for (const [hand, value] of Object.entries(motion.levels(now))) {
        dialog.querySelector(`[data-meter="${hand}"]`).value = value.magnitude ?? 0;
        dialog.querySelector(`[data-motion="${hand}"]`).textContent = value.magnitude == null ? 'ยังไม่มีข้อมูล' : value.magnitude.toFixed(1) + ' m/s²';
        dialog.querySelector(`[data-detected="${hand}"]`).textContent = value.peak == null ? '' : `สูงสุด ${value.peak.toFixed(1)} · นับทดสอบ ${value.steps} ก้าว`;
      }
    }
    frame = requestAnimationFrame(update);
  }
  dialog.addEventListener('close', () => {
    cancelAnimationFrame(frame); frame = null;
    if (tuning) { clearTimeout(tuningTimer); tuningTimer = null; tuning = false; dialog.querySelector('[data-tune-status]').textContent = 'ยกเลิกการวัดแล้ว แตะปุ่มเพื่อลองใหม่'; sync(); }
    onClose();
  });
  const unsubscribe = store.subscribe(sync);
  sync();
  return {
    get isOpen() { return dialog.open; },
    close() { if (dialog.open) dialog.close(); },
    open() {
      if (dialog.open) return;
      dialog.showModal(); onOpen(); lastUpdate = -Infinity; frame = requestAnimationFrame(update);
    },
    dispose() { clearTimeout(soundTimer); if (dialog.open) dialog.close(); cancelAnimationFrame(frame); unsubscribe(); dialog.remove(); },
  };
}
