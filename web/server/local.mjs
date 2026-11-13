// One-click local Bluetooth game: uses prebuilt assets, no tunnel or Wi-Fi configuration.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createRelay } from './relay.mjs';
import { openRoomRun } from './openBrowser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'http://localhost:8787/';
try {
  const previous = await fetch(url + 'roomrun-version', { signal: AbortSignal.timeout(800) }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (previous?.version === 'bluetooth-1') {
    openRoomRun(url);
  } else {
    if (!existsSync(join(root, 'dist', 'index.html'))) throw new Error('Game assets are missing. Apply the full update first.');
    const relay = await createRelay({ port: 8787, staticDir: join(root, 'dist'), logDir: join(root, 'logs') });
    console.log('RoomRun Bluetooth — keep this window open while playing.\n' + url);
    openRoomRun(url);
    const stop = async () => { await relay.close(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ?
    'Port 8787 is busy. Close the old RoomRun server window, then open START_ROOMRUN again.' : error.message);
  process.exitCode = 1;
}

