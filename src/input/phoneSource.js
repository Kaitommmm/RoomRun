// Phones as an input source: WebSocket to the relay, samples into the motion
// detector on the game clock.
//
// Clock: each phone stamps samples with its own performance.now(). Per hand,
// offset = min(receive - ts) seen so far, i.e. the least-delayed sample; ts +
// offset puts samples on the game clock with the network jitter taken out.
// The phone clock restarts on a page reload (hello resets the offset) and can
// stall while the screen is locked (samples arrive persistently late: re-baseline).
import config from '../config.js';

const GRAVITY_SMOOTH = 0.1; // low-pass for phones that only report accelerationIncludingGravity
const LATE_MS = 500; // a sample this much later than the baseline predicts is "late"
const LATE_RUN = 10; // this many late samples in a row: the phone clock jumped, re-baseline
const FUTURE_MS = 5000; // samples claiming to arrive this much early are bogus

/**
 * @param {{ url?: string, detector: ReturnType<typeof import('./motion.js').createMotionDetector>, cfg?: typeof config.phone }} opts
 *   url: relay WebSocket; omit to feed handleMessage yourself (tests)
 */
export function createPhoneSource({ url, detector, cfg = config.phone }) {
  const offset = { L: Infinity, R: Infinity };
  const gravity = { L: null, R: null };
  /** @type {Record<'L'|'R', number|null>} */
  const rtt = { L: null, R: null };
  const late = { L: 0, R: 0 };
  /** last motion sample per hand, game clock; hands never seen stay -Infinity */
  const lastSample = { L: -Infinity, R: -Infinity };
  let everConnected = false;
  /** @type {-1|0|1} lane from a phone tap, waiting for the next read */
  let tapLane = 0;
  let gameSocket = null;
  let activeSocket = null;
  let retryTimer = null;
  let disposed = false;
  const hapticPatterns = new Set(['hit', 'caught', 'pack', 'stop']);

  function sendHaptic(pattern) {
    // Drop feedback while offline or congested; never replay it on reconnect.
    if (!hapticPatterns.has(pattern) || gameSocket?.readyState !== 1 || gameSocket.bufferedAmount > 0) return false;
    try {
      gameSocket.send(JSON.stringify({ t: 'buzz', pattern }));
      return true;
    } catch { return false; }
  }

  /** @param {any} msg @param {number} recvMs game clock at arrival */
  function handleMessage(msg, recvMs = performance.now()) {
    if (!msg || typeof msg !== 'object') return;
    const hand = msg.hand === 'L' || msg.hand === 'R' ? msg.hand : null;
    if (msg.t === 'rtt' && hand && typeof msg.ms === 'number') {
      rtt[hand] = msg.ms;
    } else if (msg.t === 'tap' && hand) {
      // tap anywhere on the left phone = lane left, right phone = lane right
      tapLane = hand === 'L' ? -1 : 1;
    } else if (msg.t === 'hello' && hand) {
      // (re)connected phone page: its clock may have restarted
      offset[hand] = Infinity;
      gravity[hand] = null;
      late[hand] = 0;
    } else if (msg.t === 'm' && hand && Number.isFinite(msg.ts)) {
      const delay = recvMs - msg.ts;
      if (Number.isFinite(offset[hand]) && delay < offset[hand] - FUTURE_MS) return;
      late[hand] = delay - offset[hand] > LATE_MS ? late[hand] + 1 : 0;
      offset[hand] = late[hand] >= LATE_RUN ? delay : Math.min(offset[hand], delay);
      if (late[hand] >= LATE_RUN) late[hand] = 0;
      lastSample[hand] = recvMs;
      everConnected = true;
      let a = msg.a;
      if ((!a || a.some((x) => x == null)) && Array.isArray(msg.ag) && msg.ag.every((x) => typeof x === 'number')) {
        // no linear acceleration on this phone: take gravity out ourselves
        const g = (gravity[hand] ??= [...msg.ag]);
        for (let i = 0; i < 3; i++) g[i] += (msg.ag[i] - g[i]) * GRAVITY_SMOOTH;
        a = msg.ag.map((x, i) => x - g[i]);
      }
      detector.push({ hand, ts: msg.ts + offset[hand], a, ag: msg.ag });
    }
  }

  if (url) {
    const open = () => {
      if (disposed) return;
      const ws = new WebSocket(url);
      activeSocket = ws;
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ t: 'hello', role: 'game' }));
        gameSocket = ws;
      });
      ws.addEventListener('message', (ev) => {
        try { handleMessage(JSON.parse(String(ev.data))); } catch { /* not ours */ }
      });
      // relay not running yet, or restarted: keep trying quietly
      ws.addEventListener('error', () => {});
      ws.addEventListener('close', () => {
        if (gameSocket === ws) gameSocket = null;
        if (activeSocket === ws) activeSocket = null;
        if (!disposed) retryTimer = setTimeout(open, 2000);
      });
    };
    open();
  }

  return {
    handleMessage,
    reset() { tapLane = 0; detector.reset(); },
    sendHaptic,
    dispose() {
      disposed = true;
      clearTimeout(retryTimer);
      const ws = activeSocket;
      gameSocket = activeSocket = null;
      try { ws?.close(); } catch { /* connection already closed */ }
    },
    rtt,
    /** True once any phone has sent motion: lets the HUD tell "lost" from "never used". */
    get everConnected() { return everConnected; },
    /** False until a phone sends motion, and when any phone that has sent motion goes quiet. */
    connected(nowMs) {
      const seen = /** @type {const} */ (['L', 'R']).filter((h) => lastSample[h] > -Infinity);
      return seen.length > 0 && seen.every((h) => nowMs - lastSample[h] <= cfg.disconnectAfterMs);
    },
    read(nowMs) {
      const frame = detector.read(nowMs);
      if (tapLane && !frame.laneDelta) frame.laneDelta = tapLane;
      tapLane = 0;
      return frame;
    },
  };
}
