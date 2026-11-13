# RoomRun Web

Current source release: 2026-11-14. [คู่มือภาษาไทย](README.th.md)

A Thai-soi runner controlled by two XIAO ESP32C3 + MPU6050 BLE controllers. Select paired upward flick or right-small-button jumping, and running-presence acceleration or swing-effort/cadence speed. Left small pauses; while paused, right small resumes, right main restarts and left main returns to the menu. Title instructions follow settings. Sound unlock/test is in settings.

Firmware: [controllers branch](https://github.com/Kaitommmm/RoomRun/tree/controllers). Full project: [main branch](https://github.com/Kaitommmm/RoomRun/tree/main).

Use Node.js 22.12+ or a supported Vite 8 Node release. On main, run these commands from `web/`; on the web branch, run them from the repository root:

```bash
npm ci
npm run dev
npm test -- --exclude tests/relay.test.js
npm run build
```

Deploy the generated `dist/` folder to HTTPS hosting. Netlify can use branch `web`, build `npm run build`, publish `dist`; the included netlify.toml sets these values. No continuous local relay is needed for BLE play on a public HTTPS site. Local source server after building: `node server/local.mjs`, then http://localhost:8787/.

Desktop Chrome/Edge and Android Chrome support the intended BLE path; iPhone/iPad use Bluefy on HTTPS. Pair each controller with L/R in the game. Reconnect pauses require an explicit right-small resume. Browser-local settings and leaderboard do not transfer between origins. Hand IMUs estimate motion, not actual foot contact or physical running speed.

Validation: 400 tests across 42 files (relay network tests excluded) and production build. Real BLE hardware/browser gameplay and Arduino compilation were not revalidated in this upload. Keep [CREDITS.md](CREDITS.md) with the assets.
