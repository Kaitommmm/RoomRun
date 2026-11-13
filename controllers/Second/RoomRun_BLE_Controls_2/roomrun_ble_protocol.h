#pragma once
#include <cstdint>
#include <cstddef>
#include <cmath>
namespace RoomRunBLE {
constexpr char SERVICE[] = "d2870001-7b44-4c7b-a142-66d27c9a8b18";
constexpr char MOTION[]  = "d2870002-7b44-4c7b-a142-66d27c9a8b18";
constexpr char CONTROL[] = "d2870003-7b44-4c7b-a142-66d27c9a8b18";
constexpr char BATTERY[] = "d2870004-7b44-4c7b-a142-66d27c9a8b18";
constexpr size_t BATTERY_SIZE = 4;
constexpr size_t FRAME_SIZE = 20;  // fits the 20-byte ATT payload at the default MTU 23
inline const char* command(uint8_t value) {
  switch (value) {
    case 0: return "stop";
    case 1: return "hit";
    case 2: return "caught";
    case 3: return "pack";
    case 4: return "test";
    default: return nullptr;
  }
}
inline void put16(uint8_t* p, uint16_t v) { p[0] = v; p[1] = v >> 8; }
inline void batteryFrame(uint8_t out[BATTERY_SIZE], bool valid, uint16_t mv, uint8_t percent) {
  out[0] = 1;
  out[1] = valid ? percent : 255;
  put16(out + 2, valid ? mv : 0);
}
inline void put32(uint8_t* p, uint32_t v) {
  for (uint8_t i = 0; i < 4; ++i) p[i] = v >> (8 * i);
}
inline int16_t quantize(float value) {
  if (!std::isfinite(value)) return 0;
  value *= 100.0f;
  if (value > 32767.0f) value = 32767.0f;
  if (value < -32768.0f) value = -32768.0f;
  return static_cast<int16_t>(std::lround(value));
}
inline void frame(uint8_t out[FRAME_SIZE], uint16_t seq, uint32_t stamp,
                  bool mainDown, bool smallDown, bool valid,
                  const float ag[3], const float linear[3]) {
  out[0] = 1;
  out[1] = (mainDown ? 1 : 0) | (smallDown ? 2 : 0) | (valid ? 0x80 : 0);
  put16(out + 2, seq);
  put32(out + 4, stamp);
  for (uint8_t i = 0; i < 3; ++i) {
    put16(out + 8 + i * 2, uint16_t(quantize(valid ? ag[i] : 0)));
    put16(out + 14 + i * 2, uint16_t(quantize(valid ? linear[i] : 0)));
  }
}
}

