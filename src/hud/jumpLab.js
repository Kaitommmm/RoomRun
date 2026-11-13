import './jumpLab.css';
import { controlScheme } from '../controlScheme.js';

// Diagnostic view only; recording never changes the detector decision.
export function createJumpLab({ motion, recording, getSettings, onOpen }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'roomrun-jump-lab';
  dialog.setAttribute('aria-labelledby', 'rr-jump-title');
  dialog.innerHTML = `<header><div><small>ROOMRUN · ทดลองการกระโดด</small><h2 id="rr-jump-title">ทดสอบกระโดด / บันทึกสัญญาณ</h2></div><button type="button" data-close aria-label="ปิดหน้าทดสอบ">ปิด</button></header>
    <p data-controls-help>กระโดด: สะบัดจอยทั้งสองขึ้นพร้อมกันสั้น ๆ แล้วผ่อนมือ ให้จอยหยุดการสะบัด ไม่ต้องยกค้างหรือกระโดดจริง วิ่ง: แกว่งแขนสลับต่อเนื่องเพื่อค่อย ๆ เร่ง หยุดแล้วจะชะลอ</p>
    <div class="rr-jump-signal"><span data-signal="L">ซ้าย: รอข้อมูล</span><span data-signal="R">ขวา: รอข้อมูล</span></div>
    <canvas width="720" height="180" aria-label="กราฟแรงขึ้นของจอยสองข้าง"></canvas>
    <section><h3>บันทึกอาการขณะเล่น</h3><p>เชื่อมจอยทั้งสอง กดเริ่มบันทึก แล้วกดปุ่มเล็กขวาเพื่อเล่นต่อ ลองวิ่งและกระโดดตามปกติ บันทึกได้ 60 วินาที</p>
      <div class="rr-jump-actions"><button type="button" data-record>เริ่มบันทึกแล้วกลับไปเล่น</button><button type="button" data-download disabled>ดาวน์โหลดข้อมูลทดสอบ</button></div>
      <p data-summary role="status">ยังไม่มีข้อมูลบันทึก</p>
      <p class="rr-jump-note">ไฟล์เก็บสัญญาณสองมือและจังหวะที่เกมกระโดดจริง สำหรับส่งมาตรวจอาการที่พลาด ข้อมูลจะไม่ถูกอัปโหลดอัตโนมัติ</p></section>`;
  document.body.append(dialog);
  const $ = s => dialog.querySelector(s);
  const badge = document.createElement('button');
  badge.id = 'roomrun-recording'; badge.type = 'button'; badge.hidden = true;
  document.body.append(badge);
  const fresh = { L: null, R: null }, graph = [];
  let frame = null, lastPaint = -Infinity, lastCaption = '';
  function stopRecording() { recording.stop(); badge.hidden = true; lastCaption = ''; }
  badge.onclick = () => { stopRecording(); open(); };
  function controls() {
    $('[data-record]').textContent = recording.active ? 'หยุดบันทึก' : 'เริ่มบันทึกแล้วกลับไปเล่น';
    $('[data-download]').disabled = !recording.data?.samples.length || recording.active;
    const count = recording.data?.events.filter(e => e.event === 'jump').length ?? 0;
    $('[data-summary]').textContent = recording.data
      ? `${recording.data.samples.length} แพ็กเก็ต · เกมรับกระโดด ${count} ครั้ง${recording.active ? ' · กำลังบันทึก' : ''}`
      : 'ยังไม่มีข้อมูลบันทึก';
  }
  $('[data-record]').onclick = () => {
    if (recording.active) { stopRecording(); controls(); return; }
    if (!['L', 'R'].every(h => fresh[h] && performance.now() - fresh[h].at < 200)) {
      $('[data-summary]').textContent = 'รอข้อมูลสดจากจอยทั้งสองก่อนเริ่มบันทึก'; return;
    }
    recording.start('play', getSettings()); controls(); dialog.close();
  };
  $('[data-download]').onclick = () => {
    if (!recording.data || recording.active) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(recording.data)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `RoomRun_Rurtt_Jump_Trace_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  $('[data-close]').onclick = () => dialog.close();
  const unsubscribe = motion.observe(sample => {
    const now = performance.now(); fresh[sample.hand] = { at: now, up: sample.up };
    recording.push(sample);
    if (recording.active && recording.elapsed >= 60000) stopRecording();
    if (dialog.open) {
      graph.push({ t: now, hand: sample.hand, up: sample.up });
      while (graph.length && graph[0].t < now - 5000) graph.shift();
    }
    const caption = recording.active ? `● บันทึก ${Math.floor(recording.elapsed / 1000)}/60 วิ · กดเพื่อหยุด` : '';
    if (caption !== lastCaption) { lastCaption = caption; badge.hidden = !caption; badge.textContent = caption; }
  });
  function paint(now) {
    if (!dialog.open) return;
    if (now - lastPaint >= 100) {
      lastPaint = now; controls();
      for (const hand of ['L', 'R']) $('[data-signal="' + hand + '"]').textContent = `${hand === 'L' ? 'ซ้าย' : 'ขวา'}: ${fresh[hand] && now - fresh[hand].at < 200 ? fresh[hand].up.toFixed(1) + ' m/s²' : 'รอข้อมูล'}`;
      const canvas = $('canvas'), g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
      g.clearRect(0, 0, w, h); g.strokeStyle = '#ffffff22';
      for (const y of [30, 90, 150]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (const hand of ['L', 'R']) {
        g.strokeStyle = hand === 'L' ? '#8ce6d2' : '#ffbe70'; g.lineWidth = 2; g.beginPath();
        let previous = null;
        for (const s of graph.filter(s => s.hand === hand)) {
          const x = w * (1 - (now - s.t) / 5000), y = h / 2 - Math.max(-30, Math.min(30, s.up)) * 2.5;
          if (!previous || s.t - previous.t > 100) g.moveTo(x, y); else g.lineTo(x, y);
          previous = s;
        }
        g.stroke();
      }
    }
    frame = requestAnimationFrame(paint);
  }
  dialog.addEventListener('close', () => { cancelAnimationFrame(frame); frame = null; });
  function open() {
    if (dialog.open) return;
    const help=controlScheme(getSettings()); $('[data-controls-help]').textContent=help.jump+' '+help.run;
    onOpen(); dialog.showModal(); controls(); lastPaint = -Infinity; frame = requestAnimationFrame(paint);
  }
  return { open, close() { if(dialog.open)dialog.close(); }, get isOpen() { return dialog.open; }, dispose() { unsubscribe(); cancelAnimationFrame(frame); dialog.remove(); badge.remove(); } };
}
