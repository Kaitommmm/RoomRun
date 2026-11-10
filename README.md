# RoomRun — ระวังหมาดุ (Rawang Maa Du)

**English** | [ภาษาไทย](README.th.md)

A browser runner controlled by RoomRun handheld ESP32-C3 + MPU6050 Bluetooth Low Energy controllers. Jog in place to escape a dog in a Thai soi. Detected step cadence controls character speed; a hand sensor does not directly measure foot contact, posture, or real-world running speed.

**[Play the latest hosted game](https://roomrun-bluetooth-play.kakar8882516.chatgpt.site/)** — one public HTTPS link for computers and phones, with automatic layout selection and no ChatGPT login.

## Play with Bluetooth controllers

- **Windows/macOS:** open the game in a browser supporting Web Bluetooth, such as Chrome. Windows Edge is also supported. The computer needs a working BLE adapter.
- **Android:** open the game in Chrome.
- **iPhone/iPad:** open the HTTPS game link inside [Bluefy](https://apps.apple.com/app/id1492822055) and allow Bluetooth access.

Turn on a controller, select **L** or **R** in the game's Bluetooth panel, choose its `RoomRun-…` device, then start the game. Disconnect it from another game/device before connecting here. No controller Wi-Fi name, password, or IP configuration is needed. This uses the existing RoomRun BLE firmware; updating the game does not require reflashing it.

One controller can test running and its assigned lane button. Motion jumping requires both controllers connected; use Space on a computer when testing with one controller.

| Action | RoomRun BLE controllers | Keyboard |
|---|---|---|
| Run | Jog in place; detected cadence sets game speed | Alternate A / D |
| Change lane | Main button: L moves left, R moves right | Left / Right arrow |
| Jump | Clear upward movement of both controllers together | Space |
| Start / restart | Small button on either controller (title and caught screens only), or the button in the game panel | R |
| Test vibration | Test button in a connected controller's panel | — |

Developer keys: **C** triggers a dog-pack chase; **backquote** opens the developer tuning panel; **H** hides the HUD for clean video shots.

If a connected controller drops mid-run, the game pauses with a reconnect notice and retries that controller every 2 s; it resumes by itself once the controller is back. **R** on the keyboard restarts without it.

## Settings and feedback

Open **ตั้งค่าเกม** in the Bluetooth panel. The game pauses while settings are open and continues receiving controller samples for live testing. Settings are saved in that browser when storage is available.

- **Exercise / all directions** is the default. It uses linear acceleration across all three axes and three continuous qualifying pulses before running starts. It accepts up/down, sideways, forward/backward and diagonal movement. Opposite halves of a swing are filtered to avoid doubling cadence. Upright, flat and tilted controller mounting is supported; tuning with actual hardware is still necessary.
- **Light play / all directions** is available for controller testing and casual arm movement. The original vertical mode remains selectable.
- Exercise sensitivity has a separate range. Automatic calibration uses three seconds of actual jogging and retains a minimum effort threshold.
- Game speed follows detected cadence, with smoothing and tolerance for an occasional missed pulse. The HUD shows detected controller events per minute and game speed percent. These are game estimates, not fitness measurements.
- Separate music/effect volumes, game vibration, and standard/power-saving graphics settings are available.
- Bluetooth diagnostics, sensor status and optional battery-voltage estimates appear per controller. Battery percent is approximate; charging/full status is not reported by the game.
- **เปิด / ทดสอบเสียง** unlocks/tests sound. On iPhone, also check Silent Mode, media volume and the active headphone/audio route. MP3 alternatives support browsers that cannot decode the original Ogg files.

Vibration feedback is sent for collisions, being caught and the pack chase. Matching BLE firmware and the motor circuit are required.

## Run from source

Requires a Node.js release supported by Vite 8 (Node 20.19+ or 22.12+). Use the lockfile:

```bash
npm ci
npm run dev
```

Open Vite's local URL, normally `http://localhost:5173/`. Bluetooth access requires a supported browser on localhost or an HTTPS origin.

For the local game server:

```bash
npm run build
node server/local.mjs
```

On Windows, after installing dependencies and building, double-click `START_ROOMRUN.cmd`. Keep its window open while playing. The game opens at `http://localhost:8787/`.

`dist/` and `node_modules/` are not committed; build after a fresh clone. The hosted HTTPS game does not require this local server for direct BLE play.

### Optional phones-over-Wi-Fi mode

The original phone-controller route remains available:

```bash
npm run phone
```

This builds the game, starts the relay on port 8787 and opens a Cloudflare quick tunnel. Scan the title-screen QR with each phone, select left/right, allow motion access and hold one phone per hand. The host must remain running and the tunnel URL changes between sessions. Remote HTTPS game pages use direct BLE by default; append `?wifi=1` when deliberately using a compatible relay/tunnel deployment. The relay currently has one shared room and writes motion logs under `logs/`.

## Game rules

The dog follows at a steady speed. Obstacles cost distance: jump over sleeping dogs/water jars, and change lanes around carts/tuk-tuks. Yellow floor warnings indicate jumps; red indicates lane changes. Collect coins and survive periodic pack chases. The run ends when the dog catches the player.

## Development

```bash
npm test
npm run build
```

The suite includes motion/cadence, exercise gating, BLE protocol and connection lifecycle, battery decoding, mobile audio recovery, settings, haptics, game simulation and real WebSocket relay integration. Some restricted environments cannot open local TCP listeners; to run the remaining tests there:

```bash
npm test -- --exclude tests/relay.test.js
```

Source layout:

- `src/sim/`: fixed-step game simulation.
- `src/render/`, `src/hud/`, `src/audio/`: graphics, interface and sound.
- `src/input/`: motion processing, cadence, BLE, relay, keyboard and haptics.
- `src/settings.js`: validated browser-local game preferences.
- `src/phone/`, `phone.html`: optional phone-controller page.
- `server/`: local hosting, WebSocket relay and optional tunnel.
- `art/`, `public/models/`: model-generation scripts and game art.
- `scripts/replay.mjs`: motion-log replay utility.

## Prototype limits and credits

A working single-controller hardware prototype has been tested by the project owner. Cross-device behavior, two-controller jumping and motion tuning across different players still need hardware validation. Hand motion can mimic body movement, so the game cannot verify actual leg activity and makes no health or fitness claims.

The game combines CC0 audio (Kenney/OpenGameArt), Kanit (SIL OFL), and the existing character assets/animations. See [CREDITS.md](CREDITS.md) for source and licence details.
