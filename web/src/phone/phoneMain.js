// Phone controller page: pick a hand, allow motion, stream every devicemotion
// sample to the relay. Stays awake (Wake Lock) and reconnects on its own.
import '@fontsource/kanit/600.css';
import '@fontsource/kanit/800.css';
import './phone.css';
import strings from '../strings.js';
import { motionMessage, wsUrl } from './protocol.js';

const S = strings.phone;
const root = /** @type {HTMLElement} */ (document.getElementById('phone'));
/** @type {'L'|'R'|null} */
let hand = null;

function pickScreen() {
  root.innerHTML = `
    <h1>${strings.title}</h1>
    <h2>${S.pickHand}</h2>
    <div class="hands"><button data-h="L">${S.left}</button><button data-h="R">${S.right}</button></div>
    <button class="start" disabled>${S.start}</button>`;
  const start = /** @type {HTMLButtonElement} */ (root.querySelector('.start'));
  for (const b of root.querySelectorAll('.hands button')) {
    b.addEventListener('click', () => {
      hand = /** @type {'L'|'R'} */ (/** @type {HTMLElement} */ (b).dataset.h);
      for (const o of root.querySelectorAll('.hands button')) o.classList.toggle('on', o === b);
      start.disabled = false;
    });
  }
  start.addEventListener('click', () => { if (hand) begin(hand); });
}

function message(title, body) {
  root.innerHTML = `<h1>${strings.title}</h1><h2 class="warn">${title}</h2><p>${body}</p>`;
}

/** iPhone asks once per page; must run inside the tap. */
async function askPermission() {
  const DME = /** @type {any} */ (window.DeviceMotionEvent);
  if (!DME) return 'missing';
  if (typeof DME.requestPermission !== 'function') return 'granted'; // Android / desktop
  try { return await DME.requestPermission(); } catch { return 'denied'; }
}

/** @param {'L'|'R'} h */
async function begin(h) {
  const permission = await askPermission();
  if (permission === 'missing') return message(S.noSensor, '');
  if (permission !== 'granted') return message(S.denied, S.deniedHow);

  root.innerHTML = `
    <div class="big">${h}</div>
    <h2>${S.hand(h)}</h2>
    <div class="state wait">${S.connecting}</div>
    <div class="nums"><span class="rtt">${S.rtt('—')}</span><span class="rate">${S.rate(0)}</span></div>
    <p>${S.holdTip}</p>
    <p class="tap">${S.tapTip(h)}</p>
    <p class="warn nosensor" hidden>${S.noSensor}</p>`;
  const stateEl = /** @type {HTMLElement} */ (root.querySelector('.state'));
  const rttEl = /** @type {HTMLElement} */ (root.querySelector('.rtt'));
  const rateEl = /** @type {HTMLElement} */ (root.querySelector('.rate'));
  const noSensorEl = /** @type {HTMLElement} */ (root.querySelector('.nosensor'));
  const setState = (cls, text) => { stateEl.className = `state ${cls}`; stateEl.textContent = text; };

  /** @type {WebSocket|null} */
  let ws = null;
  let lastRtt = /** @type {number|null} */ (null);
  let pingId = 0;
  let samples = 0, totalSamples = 0;

  function connect() {
    ws = new WebSocket(wsUrl(location));
    ws.addEventListener('open', () => {
      setState('ok', S.connected);
      ws?.send(JSON.stringify({ t: 'hello', role: 'phone', hand: h }));
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.t === 'pong') {
        lastRtt = Math.round(performance.now() - msg.ts);
        rttEl.textContent = S.rtt(lastRtt);
      }
    });
    ws.addEventListener('close', () => {
      setState('bad', S.reconnecting);
      ws = null;
      setTimeout(connect, 1000);
    });
  }
  connect();

  // anywhere on the screen: thumb tap mid-run, no aiming
  root.addEventListener('pointerdown', () => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ t: 'tap', hand: h, ts: performance.now() }));
    navigator.vibrate?.(30);
    root.classList.remove('flash');
    void root.offsetWidth; // restart the flash animation
    root.classList.add('flash');
  });

  window.addEventListener('devicemotion', (e) => {
    samples++; totalSamples++;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(motionMessage(h, e, performance.now())));
  });

  setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      const msg = { t: 'ping', id: ++pingId, ts: performance.now() };
      if (lastRtt != null) msg.rtt = lastRtt; // relay passes it to the game's debug panel
      ws.send(JSON.stringify(msg));
    }
    rateEl.textContent = S.rate(samples);
    samples = 0;
  }, 1000);
  // desktops and some browsers expose the API but never fire it
  setTimeout(() => { noSensorEl.hidden = totalSamples > 0; }, 2000);

  keepAwake();
}

/** Screen off = no motion events. Re-request when the page comes back. */
async function keepAwake() {
  const wl = /** @type {any} */ (navigator).wakeLock;
  if (!wl) return;
  const request = () => wl.request('screen').catch(() => {});
  await request();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') request(); });
}

pickScreen();
