#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdio>

namespace RoomRun {
struct Button {
  bool raw = false, stable = false;
  uint32_t changedAt = 0;
  bool pressed(bool down, uint32_t now) {
    if (down != raw) { raw = down; changedAt = now; }
    if (raw != stable && uint32_t(now - changedAt) >= 25) {
      stable = raw;
      return stable;
    }
    return false;
  }
};

struct TestPulse {
  bool active = false;
  uint32_t startedAt = 0;
  void start(uint32_t now) { active = true; startedAt = now; }
  bool on(uint32_t now) {
    if (active && uint32_t(now - startedAt) >= 100) active = false;
    return active;
  }
};

inline int hello(char* out, size_t size, char hand) {
  return snprintf(out, size,
      "{\"t\":\"hello\",\"role\":\"phone\",\"hand\":\"%c\",\"dev\":\"stick\",\"fw\":\"game-ready-2\"}", hand);
}
inline int tap(char* out, size_t size, char hand, uint32_t now) {
  return snprintf(out, size, "{\"t\":\"tap\",\"hand\":\"%c\",\"ts\":%lu}", hand, (unsigned long)now);
}
inline int motion(char* out, size_t size, char hand, uint32_t now,
                  const float a[3], const float ag[3], const float gyro[3]) {
  return snprintf(out, size,
      "{\"t\":\"m\",\"hand\":\"%c\",\"ts\":%lu,\"a\":[%.3f,%.3f,%.3f],\"ag\":[%.3f,%.3f,%.3f],\"r\":[%.3f,%.3f,%.3f]}",
      hand, (unsigned long)now, a[0], a[1], a[2], ag[0], ag[1], ag[2], gyro[0], gyro[1], gyro[2]);
}
}

