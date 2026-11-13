// Screen and particle juice: red danger edges, red hit flash, speed lines at
// sprint, coin sparkles, and a different mess per obstacle hit (dog puff, jar
// splash + water on the screen, meatballs + dropped coins). Reads the world,
// reacts to events.
import * as THREE from 'three';
import config from '../config.js';
import { meterFill } from '../hud/format.js';

const SPARKS = 48;
const DEBRIS = 80;

/** Soft white disc; debris sprites tint it. */
function discTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.65, 'rgba(255,255,255,0.95)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Per obstacle: colours, how fast and high pieces fly, how heavy, how big, how long they last. */
const MESS = {
  dog: { colors: [0xd8d2c8, 0xb8b0a4], n: 14, speed: 1.6, up: 1.2, gravity: 1.5, size: 0.55, life: 0.7 },
  jar: { colors: [0x6ec8ff, 0xa8e4ff, 0x8a4a28], n: 34, speed: 4, up: 4.5, gravity: 14, size: 0.22, life: 0.8 },
  cart: { colors: [0x7a4426, 0x9a5a32, 0x5e3218], n: 26, speed: 4.5, up: 5.5, gravity: 14, size: 0.2, life: 1.0 },
  tuktuk: { colors: [0xffd040, 0xff8a20, 0x404040], n: 22, speed: 5, up: 3.5, gravity: 12, size: 0.18, life: 0.6 },
};

function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,240,180,0.9)');
  grd.addColorStop(1, 'rgba(255,200,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {THREE.Scene} scene
 * @param {HTMLElement} overlayEl full-screen element above the canvas, below the HUD
 * @param {typeof config} cfg
 */
export function createEffects(scene, overlayEl, cfg = config) {
  overlayEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4';
  overlayEl.innerHTML = `
    <canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas>
    <div class="edges" style="position:absolute;inset:0;opacity:0;
      background:radial-gradient(ellipse at center, rgba(255,0,30,0) 52%, rgba(255,0,30,0.35) 75%, rgba(200,0,20,0.85) 100%)"></div>
    <div class="hitflash" style="position:absolute;inset:0;opacity:0;
      background:radial-gradient(ellipse at center, rgba(255,20,40,0) 35%, rgba(255,20,40,0.55) 70%, rgba(220,0,20,0.95) 100%)"></div>
    <div class="drops" style="position:absolute;inset:0;opacity:0;background:
      radial-gradient(circle at 6% 22%, rgba(190,230,255,0.55) 0 3.5%, transparent 4.2%),
      radial-gradient(circle at 12% 70%, rgba(190,230,255,0.5) 0 5%, transparent 5.8%),
      radial-gradient(circle at 4% 88%, rgba(190,230,255,0.45) 0 2.5%, transparent 3.1%),
      radial-gradient(circle at 92% 18%, rgba(190,230,255,0.5) 0 4.5%, transparent 5.2%),
      radial-gradient(circle at 95% 55%, rgba(190,230,255,0.55) 0 3%, transparent 3.6%),
      radial-gradient(circle at 86% 84%, rgba(190,230,255,0.5) 0 6%, transparent 6.8%),
      radial-gradient(circle at 30% 6%, rgba(190,230,255,0.4) 0 2.5%, transparent 3%),
      radial-gradient(circle at 70% 94%, rgba(190,230,255,0.45) 0 3%, transparent 3.6%)"></div>
    <div class="flash" style="position:absolute;inset:0;background:#fff;opacity:0"></div>`;
  const lines = /** @type {HTMLCanvasElement} */ (overlayEl.querySelector('canvas'));
  const edges = /** @type {HTMLElement} */ (overlayEl.querySelector('.edges'));
  const flash = /** @type {HTMLElement} */ (overlayEl.querySelector('.flash'));
  const hitFlash = /** @type {HTMLElement} */ (overlayEl.querySelector('.hitflash'));
  const drops = /** @type {HTMLElement} */ (overlayEl.querySelector('.drops'));
  const g = lines.getContext('2d');

  // speed lines: streaks flying out from the vanishing point
  const streaks = Array.from({ length: 40 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), v: 0.8 + Math.random() }));
  let linesOn = false;

  // coin sparkles: a pool of additive sprites
  const sparkMat = new THREE.SpriteMaterial({ map: sparkTexture(), color: 0xffe070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const sparks = Array.from({ length: SPARKS }, () => {
    const s = new THREE.Sprite(sparkMat.clone());
    s.visible = false;
    scene.add(s);
    return { s, life: 0, vx: 0, vy: 0, vz: 0 };
  });
  let nextSpark = 0;

  // obstacle debris: normal-blended tinted discs (water, meatballs, dust)
  const discTex = discTexture();
  const debris = Array.from({ length: DEBRIS }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, depthWrite: false, transparent: true }));
    s.visible = false;
    scene.add(s);
    return { s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, size: 0.2 };
  });
  let nextDebris = 0;
  /** @type {string[]} obstacle kinds hit since the last frame */
  const pendingMess = [];
  let hitFlashA = 0;
  let dropsA = 0;
  /** coins knocked out of the kid's pocket by a cart, shown as a gold spray */
  let pendingDrop = 0;

  function mess(kind, x, y, z) {
    const m = MESS[kind];
    if (!m) return;
    for (let i = 0; i < m.n; i++) {
      const d = debris[nextDebris++ % DEBRIS];
      const a = Math.random() * Math.PI * 2;
      const sp = m.speed * (0.5 + Math.random() * 0.7);
      d.s.position.set(x, y, z);
      d.vx = Math.cos(a) * sp; d.vy = m.up * (0.5 + Math.random() * 0.7); d.vz = Math.sin(a) * sp * 0.6;
      d.g = m.gravity;
      d.max = d.life = m.life * (0.7 + Math.random() * 0.5);
      d.size = m.size * (0.7 + Math.random() * 0.6);
      d.s.material.color.setHex(m.colors[i % m.colors.length]);
      d.s.visible = true;
    }
  }
  let flashA = 0;
  let edgeA = 0;
  let time = 0;
  let pendingCoins = 0;

  function burst(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const p = sparks[nextSpark++ % SPARKS];
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3;
      p.s.position.set(x, y, z);
      p.vx = Math.cos(a) * sp; p.vy = 2 + Math.random() * 3; p.vz = Math.sin(a) * sp * 0.5;
      p.life = 0.45 + Math.random() * 0.2;
      p.s.visible = true;
    }
  }

  return {
    /** @param {any} world @param {number} dt render seconds (time-scaled) @param {{ z: number, x: number, y: number }} interp */
    update(world, dt, interp) {
      time += dt;
      const running = world.phase === 'running';

      // coin sparkles where the kid is
      if (pendingCoins > 0) {
        burst(interp.x, 1.1 + interp.y, -interp.z - 0.6, 6 * pendingCoins);
        pendingCoins = 0;
      }
      // obstacle mess, just ahead of the kid where the obstacle was
      for (const kind of pendingMess) mess(kind, interp.x, 0.5, -interp.z - 0.5);
      pendingMess.length = 0;
      if (pendingDrop > 0) {
        burst(interp.x, 1.0 + interp.y, -interp.z, pendingDrop);
        pendingDrop = 0;
      }
      for (const d of debris) {
        if (!d.s.visible) continue;
        d.life -= dt;
        if (d.life <= 0) { d.s.visible = false; continue; }
        d.vy -= d.g * dt;
        d.s.position.x += d.vx * dt; d.s.position.y = Math.max(0.05, d.s.position.y + d.vy * dt); d.s.position.z += d.vz * dt;
        // dust puffs grow as they fade; solid bits keep their size
        const grow = d.g < 3 ? 1 + (1 - d.life / d.max) * 1.5 : 1;
        d.s.scale.setScalar(d.size * grow);
        d.s.material.opacity = Math.min(1, (d.life / d.max) * 2.5);
      }
      for (const p of sparks) {
        if (!p.s.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.vy -= 9 * dt;
        p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
        p.s.scale.setScalar(0.35 * Math.min(1, p.life * 3));
        p.s.material.opacity = Math.min(1, p.life * 3);
      }

      // red edges: danger meter strength, pulsing during the chase event
      const fill = running || world.phase === 'caught' ? meterFill(world.chaser.gap, cfg.chaser) : 0;
      const chase = running && world.chase.phase === 'active';
      const target = Math.max(Math.pow(fill, 1.6), chase ? 0.5 + 0.2 * Math.sin(time * 6) : 0);
      edgeA += (target - edgeA) * (1 - Math.exp(-6 * dt));
      edges.style.opacity = edgeA.toFixed(3);

      flashA = Math.max(0, flashA - dt * 4);
      flash.style.opacity = (flashA * 0.55).toFixed(3);
      hitFlashA = Math.max(0, hitFlashA - dt * 2.5);
      hitFlash.style.opacity = hitFlashA.toFixed(3);
      dropsA = Math.max(0, dropsA - dt);
      drops.style.opacity = Math.min(1, dropsA * 2).toFixed(3);

      // speed lines above 80% speed
      const speed = running ? world.player.speedMps / cfg.player.maxSpeed : 0;
      const k = Math.max(0, (speed - 0.8) / 0.2);
      const w = lines.clientWidth, h = lines.clientHeight;
      if (k > 0.01 || linesOn) {
        if (lines.width !== w || lines.height !== h) { lines.width = w; lines.height = h; }
        g.clearRect(0, 0, w, h);
        linesOn = k > 0.01;
        if (linesOn) {
          const cx = w / 2, cy = h * 0.42, maxR = Math.hypot(w, h) * 0.6;
          g.strokeStyle = `rgba(255,255,255,${(0.35 * k).toFixed(3)})`;
          g.lineCap = 'round';
          for (const st of streaks) {
            st.r += st.v * dt * 1.6;
            if (st.r > 1) { st.r = 0.35; st.a = Math.random() * Math.PI * 2; }
            const r0 = maxR * st.r, r1 = r0 + maxR * 0.12 * st.v;
            g.lineWidth = 1.5 + 2.5 * st.r;
            g.beginPath();
            g.moveTo(cx + Math.cos(st.a) * r0, cy + Math.sin(st.a) * r0);
            g.lineTo(cx + Math.cos(st.a) * r1, cy + Math.sin(st.a) * r1);
            g.stroke();
          }
        }
      }
    },
    onEvent(name) {
      if (name === 'hit') hitFlashA = 1;
      else if (name.startsWith('hit-')) {
        const kind = name.slice(4);
        pendingMess.push(kind);
        if (kind === 'jar') dropsA = 1; // water on the "lens" for ~1 s
        if (kind === 'cart') pendingDrop += cfg.effects.cartCoinLoss;
      }
      else if (name === 'run-start') { dropsA = 0; hitFlashA = 0; }
      else if (name === 'caught') flashA = 0.7;
      else if (name === 'coin') pendingCoins++;
    },
  };
}
