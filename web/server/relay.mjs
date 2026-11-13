// Relay: phones -> game over one WebSocket path, plus the built game as static
// files and the tunnel URL for the title-screen QR. Logs every motion sample
// (raw data for the ESP32 stick work later).
import { createServer } from 'node:http';
import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const pad = (n) => String(n).padStart(2, '0');
function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * @param {{ port: number, staticDir: string, logDir: string }} opts port 0 = any free port
 * @returns {Promise<{ port: number, setTunnelUrl(url: string): void, close(): Promise<void> }>}
 */
export async function createRelay({ port, staticDir, logDir }) {
  const root = resolve(staticDir);
  const logPath = join(logDir, `motion-${stamp()}.jsonl`);
  /** @type {import('node:fs').WriteStream|null} made on the first sample, so idle starts leave no empty files */
  let log = null;
  let tunnelUrl = null;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/roomrun-version') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ version: 'bluetooth-1' }));
      return;
    }
    if (url.pathname === '/tunnel-url') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ url: tunnelUrl }));
      return;
    }
    let file;
    try {
      file = resolve(root, '.' + decodeURIComponent(url.pathname));
    } catch {
      file = null;
    }
    if (file && !file.startsWith(root + sep) && file !== root) file = null; // path traversal
    if (file && file === root) file = join(root, 'index.html');
    let ok = false;
    try { ok = !!file && statSync(file).isFile(); } catch { ok = false; }
    if (!ok) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });

  // messages are ~200 bytes; anything big is not ours (the tunnel URL is public)
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  /** @type {Set<import('ws').WebSocket>} */
  const games = new Set();
  /** @type {Map<import('ws').WebSocket, 'L'|'R'>} */
  const phones = new Map();
  // Only real sticks declare dev:'stick'; phone browser pages keep working as inputs.
  const sticks = new Set();
  const hapticPatterns = new Set(['hit', 'caught', 'pack', 'stop']);
  const toSticks = (pattern) => {
    const text = JSON.stringify({ t: 'buzz', pattern });
    for (const stick of sticks) {
      if (stick.readyState === 1 && stick.bufferedAmount === 0) stick.send(text);
    }
  };
  const toGames = (text) => { for (const g of games) if (g.readyState === 1) g.send(text); };

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const text = String(data);
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello' && msg.role === 'game') {
        phones.delete(ws);
        sticks.delete(ws);
        games.add(ws);
        // tell a late-joining game which phones are already here
        for (const hand of phones.values()) ws.send(JSON.stringify({ t: 'hello', role: 'phone', hand }));
      } else if (msg.t === 'hello' && msg.role === 'phone' && (msg.hand === 'L' || msg.hand === 'R')) {
        games.delete(ws);
        phones.set(ws, msg.hand);
        if (msg.dev === 'stick') sticks.add(ws);
        else sticks.delete(ws);
        toGames(text);
      } else if (msg.t === 'buzz' && games.has(ws) && hapticPatterns.has(msg.pattern)) {
        // The relay normalizes the message and sends only the named pattern.
        toSticks(msg.pattern);
      } else if ((msg.t === 'm' || msg.t === 'tap') && phones.has(ws)) {
        // only registered phones, and only as the hand they registered;
        // taps are logged too, so they mark moments in a recording
        const sample = { ...msg, hand: phones.get(ws) };
        toGames(JSON.stringify(sample));
        if (!log) { mkdirSync(logDir, { recursive: true }); log = createWriteStream(logPath, { flags: 'a' }); }
        log.write(JSON.stringify({ ...sample, rt: Date.now() }) + '\n');
      } else if (msg.t === 'ping') {
        ws.send(JSON.stringify({ t: 'pong', id: msg.id, ts: msg.ts }));
        const hand = phones.get(ws);
        if (hand && typeof msg.rtt === 'number') toGames(JSON.stringify({ t: 'rtt', hand, ms: msg.rtt }));
      }
    });
    ws.on('close', () => {
      const wasGame = games.delete(ws);
      phones.delete(ws);
      sticks.delete(ws);
      if (wasGame) toSticks('stop');
    });
    ws.on('error', () => {});
  });

  await new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(port, () => { server.removeListener('error', rej); res(); });
  });
  const addr = server.address();

  return {
    port: typeof addr === 'object' && addr ? addr.port : port,
    setTunnelUrl(url) { tunnelUrl = url; },
    async close() {
      for (const c of wss.clients) c.terminate();
      await new Promise((res) => wss.close(() => res()));
      await new Promise((res) => server.close(() => res()));
      if (log) await new Promise((res) => log.end(res));
    },
  };
}
