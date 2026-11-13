// `npm run phone`: build the game, serve it + the relay on :8787, open a
// Cloudflare quick tunnel and print both links.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRelay } from './relay.mjs';
import { startTunnel } from './tunnel.mjs';

const PORT = 8787;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (build.status !== 0) process.exit(build.status ?? 1);

const relay = await createRelay({ port: PORT, staticDir: join(root, 'dist'), logDir: join(root, 'logs') });
console.log(`\nGame (this computer): http://localhost:${PORT}`);
console.log('Starting Cloudflare tunnel for the phones...');

const tunnel = startTunnel(PORT, (url) => {
  relay.setTunnelUrl(url);
  console.log(`Phone page:           ${url}/phone.html  (also shown as a QR on the title screen)\n`);
});

const stop = async () => { tunnel.kill(); await relay.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
