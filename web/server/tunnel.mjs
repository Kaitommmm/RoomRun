// Cloudflare quick tunnel: a public https URL for the relay, so iPhones get the
// secure context DeviceMotion needs, on any Wi-Fi (or none: phone on 4G).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const QUICK_HOST = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;

/** @param {string} line one line of cloudflared output @returns {string|null} */
export function parseTunnelUrl(line) {
  return line.match(QUICK_HOST)?.[0] ?? null;
}

/**
 * Spawn `cloudflared tunnel --url http://localhost:<port>`; call onUrl once the
 * quick-tunnel URL shows up in its log. Returns the child so it can be killed.
 * @param {number} port @param {(url: string) => void} onUrl
 */
export function startTunnel(port, onUrl) {
  const child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let found = false;
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => {
      const url = found ? null : parseTunnelUrl(line);
      if (url) { found = true; onUrl(url); }
    });
  }
  child.on('error', (e) => console.error(`cloudflared failed to start: ${e.message} (is it installed and on PATH?)`));
  return child;
}
