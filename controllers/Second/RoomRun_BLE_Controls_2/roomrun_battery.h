#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace RoomRun {
// Default for this NEW controller: equal 100k + 100k divider.
// Calibrate THIS board with USB unplugged: actual BAT volts / VSENSE volts.
// Do not reuse the first controller's 3.917/1.906 calibration without measuring.
constexpr float BATTERY_DIVIDER = 2.0f;
// A voltage-based display scale, NOT a calibrated state-of-charge measurement.
// 0% requests recharge at 3.30V; it is not the cell's absolute discharge limit.
inline uint8_t batteryPercent(float volts) {
  if (!std::isfinite(volts)) return 255;
  const float value = (volts - 3.30f) * (100.0f / 0.90f);
  return uint8_t(std::lround(value < 0 ? 0 : value > 100 ? 100 : value));
}
class BatteryMonitor {
 public:
  bool valid = false;
  uint16_t millivolts = 0;
  uint8_t percent = 255;
  // Eight samples at 125ms spacing, trimmed mean then low-pass filtering.
  bool add(uint32_t adcMv) {
    const float volts = adcMv * BATTERY_DIVIDER / 1000.0f;
    if (!std::isfinite(volts) || volts < 2.80f || volts > 4.35f) {
      count = 0; valid = false; millivolts = 0; percent = 255;
      return true;
    }
    samples[count++] = adcMv;
    if (count != 8) return false;
    count = 0;
    std::sort(samples, samples + 8);
    uint32_t sum = 0;
    for (int i = 1; i < 7; ++i) sum += samples[i];
    const float next = (sum / 6.0f) * BATTERY_DIVIDER;
    filtered = !valid || std::fabs(next - filtered) > 400.0f ? next : filtered + 0.25f * (next - filtered);
    valid = true;
    millivolts = uint16_t(std::lround(filtered));
    percent = batteryPercent(filtered / 1000.0f);
    return true;
  }
 private:
  uint32_t samples[8] = {};
  uint8_t count = 0;
  float filtered = 0;
};
}
