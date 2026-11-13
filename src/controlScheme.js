// One source for title-screen instructions, settings tips and controller labels.
export function controlScheme({runSpeedMode='progressive',jumpInput='flick'}={}) {
  const effort=runSpeedMode==='effort',button=jumpInput==='button';
  const runLabel=effort?'แรงแกว่งและจังหวะ':'ค่อย ๆ เร่งตามเวลา';
  const jumpLabel=button?'ปุ่มเล็กขวา':'สะบัดจอยสองข้าง';
  const run=effort?'แกว่งแขนกว้างและถี่ต่อเนื่องเพื่อวิ่งเร็ว แกว่งน้อยหรือช้าจะวิ่งช้าลง'
    :'วิ่งต่อเนื่องแล้วค่อย ๆ เร่งจนเต็มประมาณ 6 วินาที หยุดขยับแล้วค่อย ๆ ชะลอ';
  const jump=button?'ขณะเล่น: กดปุ่มเล็กขวา'
    :'ขณะเล่น: สะบัดจอยสองข้างขึ้นพร้อมกันสั้น ๆ แล้วผ่อนมือ = กระโดด';
  return {runLabel,jumpLabel,run,jump,howTo:[run,jump,
    'ขณะเล่น: ปุ่มใหญ่ซ้าย/ขวา = เปลี่ยนเลน\nปุ่มเล็กซ้าย = พัก',
    'หน้าเมนู / ตอนพัก: ปุ่มเล็กขวา = เริ่มเกม / วิ่งต่อ',
    'ตอนพัก: ปุ่มใหญ่ซ้าย = กลับเมนู\nปุ่มใหญ่ขวา = เริ่มใหม่']};
}
