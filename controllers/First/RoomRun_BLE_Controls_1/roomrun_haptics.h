#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace RoomRun {
struct HapticPattern {
  const char* name;
  uint16_t ms[5];
  uint8_t count;
  uint8_t priority;
};
static const HapticPattern HAPTIC_PATTERNS[] = {
  {"test", {100, 0, 0, 0, 0}, 1, 0},
  {"hit", {120, 0, 0, 0, 0}, 1, 1},
  {"pack", {150, 100, 150, 100, 150}, 5, 2},
  {"caught", {600, 0, 0, 0, 0}, 1, 3},
};

// Relay emits exactly these compact JSON frames. Unknown/partial frames are ignored.
inline const char* parseHaptic(const char* message, size_t length) {
  static const char* const frames[] = {
    "{\"t\":\"buzz\",\"pattern\":\"hit\"}",
    "{\"t\":\"buzz\",\"pattern\":\"pack\"}",
    "{\"t\":\"buzz\",\"pattern\":\"caught\"}",
    "{\"t\":\"buzz\",\"pattern\":\"stop\"}",
  };
  static const char* const names[] = {"hit", "pack", "caught", "stop"};
  if (!message) return nullptr;
  for (size_t i = 0; i < 4; ++i) {
    if (length == strlen(frames[i]) && memcmp(message, frames[i], length) == 0) return names[i];
  }
  return nullptr;
}

class HapticPlayer {
  const HapticPattern* current = nullptr;
  uint32_t began = 0;
public:
  void stop() { current = nullptr; }
  bool on(uint32_t now) {
    if (!current) return false;
    uint32_t elapsed = now - began;  // handles millis wraparound
    for (uint8_t i = 0; i < current->count; ++i) {
      if (elapsed < current->ms[i]) return (i % 2) == 0;
      elapsed -= current->ms[i];
    }
    current = nullptr;
    return false;
  }
  bool start(const char* name, uint32_t now) {
    if (!name) return false;
    if (strcmp(name, "stop") == 0) { stop(); return true; }
    const HapticPattern* next = nullptr;
    for (const auto& pattern : HAPTIC_PATTERNS) {
      if (strcmp(name, pattern.name) == 0) { next = &pattern; break; }
    }
    if (!next) return false;
    on(now);  // expire an old pattern before checking priorities
    if (current && next->priority <= current->priority) return false;
    current = next;
    began = now;
    return true;
  }
};
}

