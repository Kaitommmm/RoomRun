// DOM overlay: danger meter, distance, coins, chase banner + countdown,
// title and caught screens, phone badge. Reads the world; never changes it.
import QRCode from 'qrcode';
import './hud.css';
import config from '../config.js';
import strings from '../strings.js';
import { formatMeters, meterFill, chaseSeconds } from './format.js';
import { eyeColor } from '../render/chaserView.js';

/** Boss dog face (CSS only): dark head, torn left ear, amber eyes (red when close), tan muzzle. */
const DOG_FACE = '<div class="dog-face"><i class="ear l"></i><i class="ear r"></i><b></b><b></b><s></s></div>';
/** A small tan dog face per heel dog. */
const HEEL_FACE = '<div class="dog-face heel"><i class="ear l"></i><i class="ear r"></i><b></b><b></b><s></s></div>';

/**
 * @param {HTMLElement} root
 * @param {typeof config} cfg
 */
export function createHud(root, cfg = config) {
  root.id = 'hud';
  root.innerHTML = `
    <div class="play">
      <div class="txt distance"></div>
      <div class="txt coins"><i></i><span></span></div>
      <div class="meter"><div class="fill"></div><div class="face">${DOG_FACE}</div></div>
      <div class="heel-icons"></div>
      <div class="txt gap"></div>
      <div class="txt banner hidden"></div>
      <div class="txt count hidden"></div>
    </div>
    <div class="txt phone-lost hidden"></div>
    <div class="pace-readout hidden" aria-label="จังหวะจอยและความเร็วเกม"></div>
    <div class="screen title-screen">
      <div class="gate-sign"><span class="name"></span></div>
      <div class="txt prompt"></div>
      <div class="txt alt hidden"></div>
      <div class="qr hidden"><canvas></canvas><span class="txt"></span></div>
    </div>
    <div class="screen caught-screen hidden">
      <div class="txt big"></div>
      <div class="stats"><div class="txt d"></div><div class="txt c"></div></div>
      <div class="txt again"></div>
    </div>`;
  const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  const el = {
    play: $('.play'), distance: $('.distance'), coins: $('.coins'), coinsN: $('.coins span'),
    meter: $('.meter'), fill: $('.meter .fill'), face: $('.meter .face'), faceIcon: $('.meter .dog-face'), gap: $('.gap'), heel: $('.heel-icons'),
    banner: $('.banner'), count: $('.count'), phoneLost: $('.phone-lost'), pace: $('.pace-readout'),
    title: $('.title-screen'), alt: $('.title-screen .alt'), qr: $('.qr'), qrCanvas: /** @type {HTMLCanvasElement} */ ($('.qr canvas')),
    caught: $('.caught-screen'), caughtD: $('.caught-screen .d'), caughtC: $('.caught-screen .c'),
  };
  $('.title-screen .name').textContent = cfg.title;
  $('.title-screen .prompt').textContent = strings.startKeyboard;
  el.alt.textContent = strings.startPhone;
  $('.qr span').textContent = strings.scanToConnect;
  $('.caught-screen .big').textContent = strings.caught;
  $('.caught-screen .again').textContent = strings.restart;
  el.phoneLost.textContent = strings.phoneLost;

  // write to the DOM only when a value changes
  const last = new Map(); // `${slot}` or node -> last written value, per kind of write
  const lastText = new Map(), lastShow = new Map(), lastCls = new Map();
  const text = (node, value) => { if (lastText.get(node) !== value) { lastText.set(node, value); node.textContent = value; } };
  const show = (node, on) => { if (lastShow.get(node) !== on) { lastShow.set(node, on); node.classList.toggle('hidden', !on); } };
  const cls = (node, name, on) => {
    const map = lastCls.get(name) || new Map(); lastCls.set(name, map);
    if (map.get(node) !== on) { map.set(node, on); node.classList.toggle(name, on); }
  };
  const restartAnim = (node, name) => { node.classList.remove(name); void node.offsetWidth; node.classList.add(name); };

  let qrUrl = null;
  let cornerTimer = 0;
  let lastCount = -1;

  return {
    setDeviceView(mode) {
      $('.title-screen .prompt').textContent = mode === 'mobile'
        ? 'เชื่อมจอย แล้วแตะเริ่มเกมในแผงจอย' : strings.startKeyboard;
      $('.caught-screen .again').textContent = mode === 'mobile'
        ? 'เปิดแผงจอย แล้วแตะเริ่มเกมใหม่' : strings.restart;
    },
    /** @param {any} world @param {{ phoneLost: boolean, tunnelUrl: string|null, pace?: {stepsPerMinute:number}|null }} extra */
    update(world, extra) {
      const running = world.phase === 'running';
      show(el.title, world.phase === 'title');
      show(el.play, world.phase !== 'title');
      show(el.caught, world.phase === 'caught');
      show(el.phoneLost, !!extra.phoneLost);
      show(el.pace, running && !!extra.pace);
      if (extra.pace) text(el.pace, `จังหวะจอย ${extra.pace.stepsPerMinute} ครั้ง/นาที · ความเร็วเกม ${Math.round(world.player.speedMps / cfg.player.maxSpeed * 100)}%`);

      text(el.distance, formatMeters(world.player.distance));
      text(el.coinsN, String(world.coins));
      const fill = meterFill(world.chaser.gap, cfg.chaser);
      const pct = `${(fill * 100).toFixed(1)}%`;
      if (last.get('fill') !== pct) { last.set('fill', pct); el.fill.style.width = pct; el.face.style.left = pct; }
      text(el.gap, strings.gap(Math.round(world.chaser.gap)));
      cls(el.meter, 'danger', running && fill > 0.7);
      cls(el.meter, 'chase', world.chase.phase === 'active');
      cls(el.faceIcon, 'angry', eyeColor(world) === 'red');
      const heelN = world.phase === 'title' ? 0 : world.heelDogs.length;
      if (last.get('heel') !== heelN) { last.set('heel', heelN); el.heel.innerHTML = HEEL_FACE.repeat(heelN); }

      // chase banner + countdown
      const chase = world.chase.phase;
      show(el.banner, running && chase !== 'idle');
      show(el.count, running && chase !== 'idle');
      if (running && chase !== 'idle') {
        const n = chaseSeconds(world.chase.t);
        text(el.count, String(n));
        cls(el.count, 'warn', chase === 'warning');
        if (n !== lastCount) { lastCount = n; restartAnim(el.count, 'tick'); }
      } else lastCount = -1;

      if (world.phase === 'caught' && world.lastRun) {
        text(el.caughtD, formatMeters(world.lastRun.distance));
        text(el.caughtC, `● ${world.lastRun.coins}`);
      }

      // QR for the phone page, title screen only
      const url = extra.tunnelUrl ? `${extra.tunnelUrl}/phone.html` : null;
      show(el.qr, !!url && world.phase === 'title');
      show(el.alt, !!url && world.phase === 'title');
      if (url && url !== qrUrl) {
        qrUrl = url;
        QRCode.toCanvas(el.qrCanvas, url, { margin: 1, width: 320, color: { dark: '#000000', light: '#ffffff' } })
          .then(() => el.qrCanvas.removeAttribute('style')) // the lib sets an inline 320 px size; hud.css sizes it to the screen
          .catch(() => {});
      }
    },
    onEvent(name) {
      if (name === 'chase-warning') {
        el.banner.textContent = strings.chaseBanner(cfg.chase.activeTime);
        el.banner.classList.remove('corner');
        restartAnim(el.banner, 'slam');
        clearTimeout(cornerTimer);
        cornerTimer = setTimeout(() => el.banner.classList.add('corner'), 2000);
      } else if (name === 'chase-survived') {
        const pop = document.createElement('div');
        pop.className = 'txt pop';
        pop.innerHTML = `${strings.survived}<small>+${cfg.chase.rewardCoins} ●</small>`;
        root.append(pop);
        setTimeout(() => pop.remove(), 2300);
      } else if (name === 'coin') {
        restartAnim(el.coins, 'bump');
      } else if (name === 'run-start' || name === 'caught') {
        clearTimeout(cornerTimer);
      }
    },
  };
}
