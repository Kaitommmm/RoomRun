import { test, expect } from 'vitest';
import { parseTunnelUrl } from '../server/tunnel.mjs';

test('parseTunnelUrl', () => {
  expect(parseTunnelUrl('INF |  https://red-cat-12.trycloudflare.com  |')).toBe('https://red-cat-12.trycloudflare.com');
  expect(parseTunnelUrl('INF Starting tunnel')).toBeNull();
  // cloudflared also prints its own API host; only the quick-tunnel host counts
  expect(parseTunnelUrl('INF Requesting new quick Tunnel on trycloudflare.com...')).toBeNull();
  expect(parseTunnelUrl('ERR failed https://api.trycloudflare.com/tunnel')).toBeNull();
});
