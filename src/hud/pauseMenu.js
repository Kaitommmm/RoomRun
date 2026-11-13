export function pauseMenuState({ paused, waitingForMotion, lost = [], phase = 'running' }) {
  const title = phase === 'title';
  const available = paused && !lost.length;
  return {
    visible: paused || waitingForMotion,
    title: lost.length ? 'จอยหลุด · กำลังเชื่อมต่อ' : paused ? 'พักเกมแล้ว' : 'พร้อมวิ่งต่อ',
    message: lost.length
      ? `รอจอย${lost.map(h => h === 'L' ? 'ซ้าย' : 'ขวา').join('และ')} · หรือกดปุ่มใหญ่ซ้ายเพื่อกลับเมนู`
      : paused ? title ? 'กดปุ่มเล็กขวาเพื่อเริ่มเกม' : 'เลือกรายการด้านล่าง หรือใช้ปุ่มบนจอย'
        : 'ขยับวิ่งอีกครั้งเพื่อวิ่งต่อ',
    canResume: available,
    canRestart: available && phase === 'running',
    canMenu: paused && phase === 'running',
    resume: title ? 'เริ่มเกม · ปุ่มเล็กขวา' : 'วิ่งต่อ · ปุ่มเล็กขวา',
    restart: 'เริ่มใหม่ · ปุ่มใหญ่ขวา',
    menu: 'กลับเมนู · ปุ่มใหญ่ซ้าย',
    consequence: 'เริ่มใหม่หรือกลับเมนูจะล้างระยะทาง เหรียญ และคอมโบในรอบนี้',
  };
}
