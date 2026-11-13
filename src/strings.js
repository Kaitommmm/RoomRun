// Every piece of on-screen text. Thai labels, Arabic digits.
export default {
  title: 'ระวังหมาดุ',
  startKeyboard: 'กด A กับ D สลับกันเพื่อวิ่ง',
  startPhone: 'แกว่งแขนเพื่อวิ่ง',
  meters: (m) => `${m} ม.`,            // m already formatted
  gap: (m) => `หมาห่าง ${m} ม.`,
  chaseBanner: (sec) => `ฝูงหมาไล่! ${sec} วิ`,
  survived: 'รอดแล้ว!',
  caught: 'หมาทันแล้ว!',
  restart: 'กด R เพื่อเล่นอีกครั้ง',
  nearMiss: 'เฉียด!',
  combo: (m) => `x${m}`,
  comboLost: 'คอมโบหลุด',
  board: {
    title: 'อันดับสูงสุด',
    score: (n) => `คะแนน ${n}`,             // n already formatted
    pickHead: 'ติดอันดับ! เลือกตัวละคร',
    pickHint: 'เลือกสัตว์ · ปุ่มหลัก = เปลี่ยน · ปุ่มเล็กขวา = ยืนยัน',
    // caught screen: the board entry just above this run (n already formatted)
    soClose: (n, icon, name, close) => n === '0' ? `เสมอ ${icon} ${name}! อีกแค่ 1 คะแนน`
      : `${close ? 'อีกนิดเดียว! ' : ''}${icon} ${name}นำอยู่ ${n} คะแนน!`,
  },
  phoneLost: 'จอยหลุด',
  // Bluetooth sticks: how-to on the title, restart hint, drop overlay
  sticks: {
    again: 'กดปุ่มเล็กฝั่งขวาเพื่อเริ่มใหม่',
    reconnecting: (hands) => `จอย${hands.length > 1 ? 'ทั้งสองข้าง' : hands[0] === 'L' ? 'ซ้าย' : 'ขวา'}หลุด กำลังต่อใหม่…`,
  },
  howTo: ['แกว่งแขนสลับเป็นจังหวะ = วิ่ง', 'วิ่งต่อเนื่อง = ค่อย ๆ เร่งจนเร็วสุด · หยุดขยับ = ชะลอ', 'สะบัดจอยสองข้างขึ้นพร้อมกันสั้น ๆ = กระโดด', 'ปุ่มใหญ่ซ้าย/ขวา = เปลี่ยนเลน', 'ปุ่มเล็กซ้าย = พัก · ขวา = เริ่ม / วิ่งต่อ'],
  scanToConnect: 'สแกนด้วยมือถือเพื่อใช้เป็นคอนโทรลเลอร์',
  // phone controller page
  phone: {
    pickHand: 'ถือมือถือไว้มือไหน?',
    left: 'ซ้าย',
    right: 'ขวา',
    start: 'เริ่ม',
    hand: (h) => (h === 'L' ? 'มือซ้าย' : 'มือขวา'),
    connecting: 'กำลังเชื่อมต่อ…',
    connected: 'เชื่อมต่อแล้ว',
    reconnecting: 'หลุด กำลังต่อใหม่…',
    rtt: (ms) => `หน่วง ${ms} ms`,
    rate: (hz) => `${hz} ครั้ง/วิ`,
    holdTip: 'ถือมือถือให้แน่น แล้วแกว่งแขนวิ่งอยู่กับที่',
    tapTip: (h) => (h === 'L' ? 'แตะจอ = หลบซ้าย' : 'แตะจอ = หลบขวา'),
    denied: 'ไม่ได้รับสิทธิ์ใช้เซ็นเซอร์',
    deniedHow: 'ปิดแท็บนี้ แล้วเปิดลิงก์ใหม่อีกครั้ง จากนั้นกด เริ่ม แล้วเลือก อนุญาต',
    noSensor: 'ไม่พบเซ็นเซอร์การเคลื่อนไหวในเครื่องนี้',
  },
  // Shop signs along the soi: everyday shops only (nothing sacred, no brands).
  signs: ['ข้าวมันไก่', 'ก๋วยเตี๋ยว', 'ชาเย็น', 'ร้านตัดผม', 'ข้าวต้ม', 'โจ๊ก', 'ส้มตำ', 'หมูปิ้ง',
          'กาแฟสด', 'ซ่อมรถ', 'ร้านยา', 'ซักรีด', 'ข้าวผัด', 'ผลไม้', 'ขนมปัง', 'ร้านชำ'],
};
