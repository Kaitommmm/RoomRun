# RoomRun Controllers — XIAO ESP32C3

เฟิร์มแวร์ BLE Controls รุ่น 13 พฤศจิกายน 2026 สำหรับจอยสองตัว ใช้กับเกม branch [web](https://github.com/Kaitommmm/RoomRun/tree/web) หรือ `main/web` ได้ โดยไม่ต้องตั้ง Wi-Fi/IP

| บอร์ดจริง | Sketch ที่เปิดใน Arduino IDE | ค่าเทียบแรงดันแบต |
|---|---|---|
| ตัวแรก / RoomRun-28DBBE | [First/RoomRun_BLE_Controls_1/RoomRun_BLE_Controls_1.ino](First/RoomRun_BLE_Controls_1/RoomRun_BLE_Controls_1.ino) | `3.917 / 1.906` |
| ตัวที่สอง / RoomRun-C0D9BE | [Second/RoomRun_BLE_Controls_2/RoomRun_BLE_Controls_2.ino](Second/RoomRun_BLE_Controls_2/RoomRun_BLE_Controls_2.ino) | `2.0` |

First/Second เป็นโปรไฟล์ของฮาร์ดแวร์ ไม่ใช่บทบาทมือซ้าย/ขวา เลือก L หรือ R ในเกมตอนเชื่อมจอยได้ ค่าแบตอยู่ใน `roomrun_battery.h` และควรเทียบกับแรงดันจริงของบอร์ดนั้น

## อัปโหลด

1. ดาวน์โหลด branch นี้หรือโฟลเดอร์ `controllers/` จาก main ให้ครบ อย่าย้ายเฉพาะไฟล์ `.ino` เพราะต้องใช้ header ในโฟลเดอร์เดียวกัน
2. ติดตั้ง Arduino IDE และแพ็กเกจบอร์ด esp32 by Espressif Systems
3. เปิด sketch ของบอร์ดที่ต้องการ เลือกบอร์ด `XIAO_ESP32C3` และพอร์ตของบอร์ด
4. เปิด `USB CDC On Boot` ใน Tools เป็น Enabled เพื่อไม่ให้ USB serial รบกวน D6/D7
5. อัปโหลดและเปิด Serial Monitor ที่ 115200 วางจอยนิ่งขณะเริ่มทำงาน ให้ IMU เตรียมพร้อม
6. เปิดเว็บเกม เลือกเชื่อม L/R แล้วเลือกอุปกรณ์ RoomRun ให้ตรงตัว

## ขาที่เฟิร์มแวร์ใช้

| สัญญาณ | ขา XIAO / GPIO |
|---|---|
| ปุ่มใหญ่ | D2 / GPIO4 ลง GND, INPUT_PULLUP |
| ปุ่มเล็ก | D3 / GPIO5 ลง GND, INPUT_PULLUP |
| มอเตอร์ผ่าน MOSFET | D7 / GPIO20 |
| วัดแบตผ่านวงจรแบ่งแรงดัน | D1 / GPIO3 |
| LED แดง | GPIO10 |
| LED เขียว | GPIO21 |

I²C ใช้การตั้งค่าที่อยู่ใน sketch ตรวจ `Wire.begin` ก่อนเปลี่ยนสาย จ่ายแรงดันให้ ADC ผ่านตัวแบ่งแรงดันตามวงจร ไม่ต่อแบตเข้า ADC โดยตรง

ขณะเชื่อมเกม ปุ่มเล็กส่งเหตุการณ์ให้เกมจัดหน้าที่: ซ้ายพัก ขวาเริ่ม/วิ่งต่อหรือกระโดดตามการตั้งค่า เมื่อไม่ได้เชื่อมเกม ปุ่มทดสอบยังใช้การสั่น 100 ms ค่าเปอร์เซ็นต์แบตเป็นค่าประมาณจากแรงดัน ไม่ใช่สถานะการชาร์จ

เฟิร์มแวร์ชุดนี้ตรงกับไฟล์ที่ใช้งานเดิมทุก byte รอบนี้ไม่ได้เปลี่ยนโค้ดหรือคอมไพล์ Arduino ใหม่
