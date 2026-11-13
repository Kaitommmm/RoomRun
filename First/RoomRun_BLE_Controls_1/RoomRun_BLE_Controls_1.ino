// RoomRun BLE CONTROLS 2026-11-13. Small button is sent to the game; offline motor test remains available.
// Same sketch works for L/R; calibrate the battery divider per physical controller.
// No Wi-Fi name, password, IP address or hand setting is required.
// Assign left/right from the Connect buttons in the game.
#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_timer.h>
#include <driver/gpio.h>
#include <atomic>
#include <math.h>
#include "roomrun_logic.h"
#include "roomrun_haptics.h"
#include "roomrun_motor_trace.h"
#include "roomrun_ble_protocol.h"
#include "roomrun_battery.h"

#if !defined(ARDUINO_USB_CDC_ON_BOOT) || !ARDUINO_USB_CDC_ON_BOOT
#error "Enable USB CDC On Boot so D6/D7 remain available for the LED and motor."
#endif

constexpr int BUTTON_LANE = 4, BUTTON_TEST = 5, MOTOR = 20;
constexpr int LED_RED = 10, LED_GREEN = 21;
constexpr int BATTERY_ADC = 3;  // D1/A1, via 100k + 100k divider, 104 capacitor to GND.
constexpr int RED_BRIGHTNESS = 20, GREEN_BRIGHTNESS = 12;
constexpr float G = 9.80665f;
RoomRun::Button laneButton, smallButton;
RoomRun::HapticPlayer motorHaptics;
RoomRun::MotorCommandTrace motorCommandTrace;
uint32_t lastReportedMotorPulse = 0;
portMUX_TYPE motorMux = portMUX_INITIALIZER_UNLOCKED;
esp_timer_handle_t motorTimer = nullptr;
bool motorTimerReady = false;
std::atomic<bool> bleConnected{false}, restartAdvertising{false};
std::atomic<uint32_t> disconnectedAt{0};
BLEServer* bleServer = nullptr;
BLECharacteristic* motionCharacteristic = nullptr;
BLE2902* motionCccd = nullptr;
BLECharacteristic* batteryCharacteristic = nullptr;
BLE2902* batteryCccd = nullptr;
RoomRun::BatteryMonitor battery;
uint32_t lastBatterySample = 0;
uint8_t imuAddress = 0x68;
bool imuReady = false, imuHealthy = false, gravityReady = false;
float gravity[3] = {}, bias[3] = {};
uint16_t sequence = 0;
uint32_t lastSample = 0, lastStatus = 0, lastMotionMs = 0;
uint32_t goodSamples = 0, badSamples = 0;
char deviceName[24] = {};

// Caller holds motorMux. Timestamp after issuing the GPIO command.
void writeMotorLocked(bool high) {
  gpio_set_level(gpio_num_t(MOTOR), high ? 1 : 0);
  motorCommandTrace.record(high, uint32_t(esp_timer_get_time()));
}
void motorTimerTick(void*) {
  const uint32_t now = uint32_t(esp_timer_get_time() / 1000);
  portENTER_CRITICAL(&motorMux);
  writeMotorLocked(motorHaptics.on(now));
  portEXIT_CRITICAL(&motorMux);
}
void stopHaptics() {
  portENTER_CRITICAL(&motorMux);
  motorHaptics.stop();
  writeMotorLocked(false);
  portEXIT_CRITICAL(&motorMux);
}
bool requestHaptic(const char* pattern) {
  if (!motorTimerReady || !pattern) return false;
  const uint32_t now = uint32_t(esp_timer_get_time() / 1000);
  portENTER_CRITICAL(&motorMux);
  const bool accepted = motorHaptics.start(pattern, now);
  portEXIT_CRITICAL(&motorMux);
  return accepted;
}

void reportMotorPulse() {
  // No Serial calls in the motor timer or critical section. A slow main loop
  // may delay this report without extending the independently timed pulse.
  portENTER_CRITICAL(&motorMux);
  const RoomRun::MotorCommandTrace snapshot = motorCommandTrace;
  portEXIT_CRITICAL(&motorMux);
  if (snapshot.completed == lastReportedMotorPulse) return;
  lastReportedMotorPulse = snapshot.completed;
  Serial.printf("[MOTOR] D7 HIGH command lasted %lu us (~%lu ms); D7 then commanded LOW. Pulse #%lu\n",
    (unsigned long)snapshot.widthUs, (unsigned long)((snapshot.widthUs + 500u) / 1000u),
    (unsigned long)snapshot.completed);
}

class StickServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    stopHaptics();
    bleConnected.store(true);
    restartAdvertising.store(false);
  }
  void onDisconnect(BLEServer*) override {
    bleConnected.store(false);
    stopHaptics();
    if (motionCccd) motionCccd->setNotifications(false);
    if (batteryCccd) batteryCccd->setNotifications(false);
    disconnectedAt.store(millis());
    restartAdvertising.store(true);
  }
};
class StickControlCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    const String value = characteristic->getValue();
    if (!bleConnected.load() || value.length() != 1) return;
    const char* pattern = RoomRunBLE::command(uint8_t(value[0]));
    if (!pattern) return;
    if (uint8_t(value[0]) == 0) stopHaptics();
    else requestHaptic(pattern);
  }
};


bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(imuAddress);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readRegisters(uint8_t reg, uint8_t *buffer, size_t length) {
  Wire.beginTransmission(imuAddress);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(imuAddress, length) != length) return false;
  for (size_t i = 0; i < length; ++i) buffer[i] = Wire.read();
  return true;
}

int16_t signedWord(const uint8_t *bytes) {
  return static_cast<int16_t>((uint16_t(bytes[0]) << 8) | bytes[1]);
}

bool readImu(float *ag, float *gyro) {
  uint8_t data[14];
  if (!readRegisters(0x3B, data, sizeof data)) return false;
  for (int i = 0; i < 3; ++i) {
    ag[i] = signedWord(data + i * 2) * (G / 4096.0f);
    gyro[i] = signedWord(data + 8 + i * 2) * (1.0f / 16.4f);
  }
  return true;
}

bool initImu() {
  uint8_t id = 0;
  if (!readRegisters(0x75, &id, 1) || id != 0x68) {
    imuAddress = 0x69;
    if (!readRegisters(0x75, &id, 1) || id != 0x68) return false;
  }
  if (!writeRegister(0x6B, 0x01) || !writeRegister(0x1A, 0x03) ||
      !writeRegister(0x19, 0x04) || !writeRegister(0x1B, 0x18) ||
      !writeRegister(0x1C, 0x10)) return false;
  delay(100);
  Serial.println("Keep controller still for gyro calibration");
  float ag[3], gyro[3];
  for (int i = 0; i < 150; ++i) {
    if (!readImu(ag, gyro)) return false;
    for (int axis = 0; axis < 3; ++axis) bias[axis] += gyro[axis] / 150.0f;
    delay(5);
  }
  return true;
}

void removeGravity(const float *ag, const float *gyro, float dt, float *linear) {
  const float magnitude = sqrtf(ag[0]*ag[0] + ag[1]*ag[1] + ag[2]*ag[2]);
  if (!gravityReady && magnitude > 1) {
    for (int i = 0; i < 3; ++i) gravity[i] = G * ag[i] / magnitude;
    gravityReady = true;
  }
  const float x = gravity[0], y = gravity[1], z = gravity[2];
  const float wx = radians(gyro[0] - bias[0]), wy = radians(gyro[1] - bias[1]);
  const float wz = radians(gyro[2] - bias[2]);
  gravity[0] += (wz*y - wy*z) * dt;
  gravity[1] += (wx*z - wz*x) * dt;
  gravity[2] += (wy*x - wx*y) * dt;
  if (fabsf(magnitude - G) < 1.0f) {
    for (int i = 0; i < 3; ++i) gravity[i] += 0.03f * (G * ag[i] / magnitude - gravity[i]);
  }
  const float norm = sqrtf(gravity[0]*gravity[0] + gravity[1]*gravity[1] + gravity[2]*gravity[2]);
  for (int i = 0; i < 3; ++i) {
    if (norm > 0.1f) gravity[i] *= G / norm;
    linear[i] = ag[i] - gravity[i];
  }
}





void beginBluetooth() {
  const uint64_t chip = ESP.getEfuseMac();
  snprintf(deviceName, sizeof deviceName, "RoomRun-%06lX", (unsigned long)((chip >> 24) & 0xFFFFFF));
  BLEDevice::init(deviceName);
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new StickServerCallbacks());
  BLEService* service = bleServer->createService(RoomRunBLE::SERVICE);
  motionCharacteristic = service->createCharacteristic(
    RoomRunBLE::MOTION, BLECharacteristic::PROPERTY_NOTIFY);
  motionCccd = new BLE2902();
  motionCharacteristic->addDescriptor(motionCccd);
  BLECharacteristic* control = service->createCharacteristic(
    RoomRunBLE::CONTROL, BLECharacteristic::PROPERTY_WRITE);
  control->setCallbacks(new StickControlCallbacks());
  batteryCharacteristic = service->createCharacteristic(
    RoomRunBLE::BATTERY, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  batteryCccd = new BLE2902();
  batteryCharacteristic->addDescriptor(batteryCccd);
  uint8_t initialBattery[RoomRunBLE::BATTERY_SIZE];
  RoomRunBLE::batteryFrame(initialBattery, false, 0, 255);
  batteryCharacteristic->setValue(initialBattery, sizeof initialBattery);
  service->start();

  BLEAdvertisementData primary, response;
  primary.setFlags(0x06);
  primary.setCompleteServices(BLEUUID(RoomRunBLE::SERVICE));
  response.setName(deviceName);
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->setAdvertisementData(primary);
  advertising->setScanResponseData(response);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.printf("[BLE] Advertising %s\n", deviceName);
}

void updateLeds(uint32_t now) {
  const bool fault = !imuHealthy;
  bool red = fault ? now % 200 < 100 : (!bleConnected.load() && now % 1000 < 500);
  bool green = bleConnected.load() && !fault;
  // While connected: >50% green, 26..50% amber, <=25% red.
  // IMU fault and advertising patterns retain priority. CHARGE LED is independent.
  if (!fault && bleConnected.load()) {
    if (battery.valid) {
      red = battery.percent <= 50;
      green = battery.percent > 25;
    } else {
      red = green = now % 1000 < 500;  // Unknown battery: amber pulse, no false green/full signal.
    }
  }
  static int lastR = -1, lastG = -1;
  const int r = red ? RED_BRIGHTNESS : 0, g = green ? GREEN_BRIGHTNESS : 0;
  if (r != lastR) { analogWrite(LED_RED, r); lastR = r; }
  if (g != lastG) { analogWrite(LED_GREEN, g); lastG = g; }
}

void setup() {
  // D7 can still briefly pull high before the sketch starts, as with the original wiring.
  pinMode(MOTOR, OUTPUT);
  digitalWrite(MOTOR, LOW);
  pinMode(BATTERY_ADC, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(BATTERY_ADC, ADC_11db);
  pinMode(BUTTON_LANE, INPUT_PULLUP);
  pinMode(BUTTON_TEST, INPUT_PULLUP);
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  analogWrite(LED_RED, 0);
  analogWrite(LED_GREEN, 0);
  Serial.begin(115200);
  delay(300);
  Serial.println("\nRoomRun BLE CONTROLS 2026-11-13 | D3 = game control when connected | motor D7/GPIO20");
  Serial.println("[MOTOR] Offline D3 tests the motor. Connected D3 controls the game. Motor reports measure GPIO command time, not vibration.");

  esp_timer_create_args_t timerArgs = {};
  timerArgs.callback = motorTimerTick;
  timerArgs.name = "rr_ble_motor";
  timerArgs.skip_unhandled_events = true;
  if (esp_timer_create(&timerArgs, &motorTimer) == ESP_OK) {
    motorTimerReady = esp_timer_start_periodic(motorTimer, 5000) == ESP_OK;
    if (!motorTimerReady) { esp_timer_delete(motorTimer); motorTimer = nullptr; }
  }
  Serial.println(motorTimerReady ? "[HAPTIC] Timer ready" : "[HAPTIC] Timer failed: motor disabled");
  Wire.begin(6, 7);
  Wire.setTimeOut(20);
  imuReady = imuHealthy = initImu();
  Serial.println(imuReady ? "[IMU] Ready" : "[IMU] NOT FOUND: check wiring then reset");
  beginBluetooth();
  lastSample = millis();
}

void loop() {
  reportMotorPulse();
  uint32_t now = millis();
  if (uint32_t(now - lastBatterySample) >= 125) {
    lastBatterySample = now;
    portENTER_CRITICAL(&motorMux);
    const bool motorActive = motorHaptics.on(uint32_t(esp_timer_get_time() / 1000));
    portEXIT_CRITICAL(&motorMux);
    if (!motorActive && battery.add(analogReadMilliVolts(BATTERY_ADC))) {
      uint8_t data[RoomRunBLE::BATTERY_SIZE];
      RoomRunBLE::batteryFrame(data, battery.valid, battery.millivolts, battery.percent);
      batteryCharacteristic->setValue(data, sizeof data);
      if (bleConnected.load() && batteryCccd->getNotifications()) batteryCharacteristic->notify();
    }
  }
  if (restartAdvertising.load() && !bleConnected.load() &&
      uint32_t(now - disconnectedAt.load()) >= 500) {
    restartAdvertising.store(false);
    BLEDevice::startAdvertising();
    Serial.println("[BLE] Advertising again");
  }

  laneButton.pressed(digitalRead(BUTTON_LANE) == LOW, now);
  if (smallButton.pressed(digitalRead(BUTTON_TEST) == LOW, now)) {
    if (bleConnected.load()) {
      Serial.println("[CONTROL] D3 press sent to game: selected L pauses, selected R starts/resumes");
    } else {
      Serial.println(requestHaptic("test") ? "[HAPTIC] Offline motor test 100 ms" : "[HAPTIC] Offline test not started");
    }
  }

  if (uint32_t(now - lastSample) >= 20) {
    lastSample = now;
    float ag[3] = {}, gyro[3] = {}, linear[3] = {};
    bool valid = false;
    if (imuReady) {
      if (readImu(ag, gyro)) {
        const float dt = lastMotionMs ? fminf(uint32_t(now - lastMotionMs) * 0.001f, 0.05f) : 0.02f;
        lastMotionMs = now;
        removeGravity(ag, gyro, dt, linear);
        valid = true;
        for (uint8_t i = 0; i < 3; ++i)
          valid = valid && isfinite(ag[i]) && isfinite(linear[i]);
      } else {
        gravityReady = false;
        lastMotionMs = 0;
      }
      if (valid) ++goodSamples;
      else ++badSamples;
      imuHealthy = valid;
    }
    if (bleConnected.load() && motionCccd->getNotifications()) {
      uint8_t packet[RoomRunBLE::FRAME_SIZE];
      RoomRunBLE::frame(packet, sequence++, now, laneButton.stable, smallButton.stable, valid, ag, linear);
      motionCharacteristic->setValue(packet, sizeof packet);
      motionCharacteristic->notify();
    }
  }

  now = millis();
  updateLeds(now);
  if (uint32_t(now - lastStatus) >= 5000) {
    lastStatus = now;
    Serial.printf("[STATUS] %s ble=%s imu_ok=%lu imu_failed=%lu\n", deviceName,
      bleConnected.load() ? "CONNECTED" : "ADVERTISING", (unsigned long)goodSamples, (unsigned long)badSamples);
    if (battery.valid) Serial.printf("[BATTERY] %u mV, voltage estimate %u%%, D1/GPIO3\n", unsigned(battery.millivolts), unsigned(battery.percent));
    else Serial.println("[BATTERY] No valid reading: check divider, D1/GPIO3 and GND");
  }
  delay(1);
}
