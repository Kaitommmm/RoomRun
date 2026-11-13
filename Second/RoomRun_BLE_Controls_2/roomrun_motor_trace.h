#pragma once
#include <cstdint>

namespace RoomRun {
// Call only while motorMux is held. Records software GPIO command edges;
// it does not measure gate voltage, current, rotor movement or vibration.
struct MotorCommandTrace {
  bool high = false;
  uint32_t riseUs = 0, fallUs = 0, widthUs = 0, completed = 0;
  void record(bool next, uint32_t nowUs) {
    if (next == high) return;
    high = next;
    if (next) riseUs = nowUs;
    else {
      fallUs = nowUs;
      widthUs = uint32_t(fallUs - riseUs);
      ++completed;
    }
  }
};
}
