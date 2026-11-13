# RoomRun — Project context for continuing work

Updated: 2026-11-14. This is a technical handoff for the RoomRun project, not a transcript or backup of the chat.

## Repository and branches

Canonical repository: https://github.com/Kaitommmm/RoomRun

| Branch | Contents |
|---|---|
| main | Combined project: web/ and controllers/, plus overview and Netlify configuration |
| web | Current web source at repository root, assets, tests, docs and Netlify configuration |
| controllers | Complete First/Second Arduino sketches and headers at repository root |

Source checkpoints before this handoff document:
- main: cde52e7af439576d2aa80ac4b7d882639f089021
- web: 3d62ff06ab042297ac62c152af043742087df93a
- controllers: 33d9c6613be52e49548c28923e8f4a2774b66c55

Always fetch current branch heads before editing. These branch layouts are separate snapshots, not automatically synchronized folder views. When updating a release across branches, keep main/web consistent with the web branch and main/controllers consistent with the controllers branch.

## Current agreed behavior

The game is a Thai-soi runner controlled by two BLE handheld controllers.

- การกระโดดเลือกได้: สะบัดจอยสองข้างขึ้นพร้อมกันสั้น ๆ แล้วผ่อนมือ หรือกดปุ่มเล็กขวาขณะเล่น
- ผู้ใช้บอกว่าท่าสะบัดรุ่นนี้โอเคแล้ว อย่าปรับเกณฑ์ใหม่โดยไม่มีเหตุผลจากอาการ/ข้อมูลจริง
- การวิ่งเลือกได้: ค่อย ๆ เร่งตามเวลาที่ตรวจพบการวิ่ง หรือแบบแรงแกว่งและจังหวะ
- โหมดตามเวลาใช้เวลาวิ่งต่อเนื่องประมาณ 6 วินาทีจาก 0 ถึงเต็ม เมื่อไม่พบจังหวะใหม่ประมาณ 650 ms เริ่มชะลอ จากเต็มถึงหยุดประมาณ 1.8 วินาที
- โหมดแรงแกว่งใช้รูปแบบ/ขนาดสัญญาณร่วมกับจังหวะ ไม่ได้เพิ่มความเร็วเพียงเพราะเล่นนาน
- ตั้งค่าจำในเบราว์เซอร์ วิธีเล่นบนหน้าเมนูและข้อความความเร็วเปลี่ยนตามโหมด
- ไม่มีไอเท็มพลังพิเศษ เหรียญปกติ คอมโบ ใกล้พลาด และอันดับในเบราว์เซอร์ยังอยู่

| Situation | Button | Action |
|---|---|---|
| Menu/title | Small right | Start |
| Playing | Main left/right | Change lane |
| Playing | Small left | Pause |
| Playing, button-jump setting | Small right | Jump |
| Paused | Small right | Resume the same round |
| Paused | Main right | Restart |
| Paused | Main left | Return to menu and abandon the current round |

Restart/menu clear the current round's distance, coins and combo; saved leaderboard and settings remain. Returning to menu keeps BLE connections. A lost controller pauses the game and retries connection; the player must explicitly resume with small right.

## Latest UI decisions

- Go to Game button is in the RoomRun Bluetooth header, including the collapsed panel. It folds the panel, closes auxiliary dialogs and focuses the game without restarting the round.
- Button-jump help is exactly “ขณะเล่น: กดปุ่มเล็กขวา”; the D3 label and explanatory suffix were removed from that UI text.
- Small-left and main-right menu instructions use separate lines.
- Sound unlock/test is inside game settings under sound.
- Disconnection label is “จอยหลุด”.
- Keep both running options and both jumping options independently selectable.

## Controllers

Hardware: XIAO ESP32C3 + MPU6050, BLE Controls firmware from 2026-11-13.

- First/RoomRun_BLE_Controls_1: first physical controller, previously RoomRun-28DBBE; battery divider calibration 3.917 / 1.906.
- Second/RoomRun_BLE_Controls_2: second physical controller, previously RoomRun-C0D9BE; battery divider calibration 2.0.
- First/Second identify physical calibration profiles, not fixed L/R roles. Assign L/R in the game's Bluetooth panel.
- Main button: D2/GPIO4 to GND. Small button: D3/GPIO5 to GND.
- Motor through MOSFET: D7/GPIO20. Battery ADC through divider: D1/GPIO3.
- Arduino board: XIAO_ESP32C3. Enable USB CDC On Boot. Serial: 115200.
- Each sketch needs all its local header files. Keep its folder name matching the .ino.
- While connected, the game handles the small button. Offline motor test remains 100 ms.
- Firmware bytes were preserved during the latest GitHub upload; no reflash is needed for web-only UI/settings changes.
- Do not claim an Arduino compile, wiring check or physical controller test unless actually performed.

See controllers/README.md on main or README.md on the controllers branch for setup.

## Development and validation

Use Node.js 22.12+ or a Node release supported by Vite 8.

On main, first enter web/. On the web branch, use the repository root:

```bash
npm ci
npm run dev
npm test -- --exclude tests/relay.test.js
npm run build
```

Current validation: 400 tests in 42 files and production build passed. Relay network tests were excluded in the working environment. Existing large-bundle warning remains. No fresh browser/physical BLE/Arduino validation was performed during the upload.

Hand IMUs estimate hand motion; they cannot prove actual foot contact or distinguish physically identical sensor signals by intent. Do not use synthetic tests as proof of perfect real-world jump recognition. If motion regressions occur, obtain an actual gameplay trace from the in-game recording UI before repeatedly guessing thresholds.

## Hosting

Netlify:
- Recommended source branch: web.
- Build command: npm run build.
- Publish directory: dist.
- The web branch includes netlify.toml. The main branch has a root netlify.toml with base = web.
- Or build locally and upload the generated dist/ to Netlify Drop.
- If the deployment is Private, the owner must select Make public.
- Public BLE play requires a supported browser on HTTPS; a continuously running local server is not needed.
- Origin-local preferences/leaderboard do not migrate automatically from localhost to a new domain.

Actual current Netlify production URL and deployed commit have not been verified here. Ask for/inspect the URL supplied by the user; do not invent a roomrun.netlify.app address. The old ChatGPT-hosted link was not updated because its source Git host DNS was unavailable. A GitHub upload is not itself a website deployment.

## Assets, provenance and safe maintenance

Retain web/CREDITS.md and the original model/audio/art files. Rurtt/RoomRun features were incorporated from commit 75cc070851ea7f4fd9a00daac5577a98812b8bc8; provenance is recorded in tests/fixtures/rurtt-provenance.json.

Do not publish local credentials, account-specific hosting metadata, node_modules, temporary logs or machine-specific workspace files. The repository is public. Keep runtime source and complete firmware in Git; regenerate dist/ from the lockfile.

## Continuing from another device

Read this file, the current README and current code before making changes. Treat this document as a checkpoint, not as evidence that later code has not changed. The source can be retrieved from GitHub without access to the original computer. Flashing/testing USB hardware still requires access to that hardware.

This document does not migrate the original conversation or guarantee cross-device chat synchronization. Start a cloud Work conversation on ChatGPT web if the original local conversation is not available, provide this document's URL, then state the next task.
