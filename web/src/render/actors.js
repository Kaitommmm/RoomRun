// Everything that moves: the kid, the boss dog, obstacles and coins, kept in sync
// with the sim. Meshes are keyed by sim id and pooled per kind.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import config from '../config.js';
import { animationFor, loadModel, makeStandIn, addEyes, dogVariant, BOSS_EYES } from './models.js';
import { advanceGallop, gallopPose } from './dogPose.js';
import { jumpSquash, runBob } from './juice.js';
import { chaserBack, showChaser, eyeColor, heelSlot, chaserSide, caughtDogSpot } from './chaserView.js';

const KINDS = ['dog', 'jar', 'cart', 'tuktuk'];
const COIN_Y = 0.85;
/** Heel and pack dogs: the boss mesh, smaller and tan like the sleeping dogs. */
const SMALL_DOG = { scale: 0.75, tint: 0xd9a066 };
/** Boss dog size over its model: it should tower over the heel dogs (Pong, 2026-10-28). */
const BOSS_SCALE = 1.4;
/** Mixamo kid.glb is 0.98 m tall; the game's kid is 1.3 m (2026-10-28). */
const KID_SCALE = 1.33;
/** Stride: one full leg cycle (two steps) per this many metres. */
const STRIDE = 2.6;

function padTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Obstacle and coin meshes cloned from `templates[kind]` and reused. A mesh cloned from an
 * older template (the stand-in, before the GLB loaded) is dropped on return, not pooled.
 * @param {Record<string, THREE.Object3D>} templates
 * @param {THREE.Object3D} root
 */
export function meshPool(templates, root) {
  /** @type {Record<string, THREE.Object3D[]>} */
  const pool = {};
  const from = new WeakMap();
  return {
    take(kind) {
      let obj = (pool[kind] ??= []).pop();
      if (!obj) { obj = templates[kind].clone(); from.set(obj, templates[kind]); }
      obj.visible = true;
      root.add(obj);
      return obj;
    },
    give(kind, obj) {
      root.remove(obj);
      if (from.get(obj) === templates[kind]) (pool[kind] ??= []).push(obj);
    },
  };
}

/**
 * @param {THREE.Scene} scene
 * @param {typeof config} cfg
 */
export function createActors(scene, cfg = config) {
  const root = new THREE.Group();
  scene.add(root);

  // Floor pads say what an obstacle wants: yellow = jump over, red = change lane.
  const padTex = padTexture();
  const padGeo = new THREE.PlaneGeometry(2.3, 1.8).rotateX(-Math.PI / 2);
  const padMat = {
    jump: new THREE.MeshBasicMaterial({ map: padTex, color: 0xffc23a, transparent: true, depthWrite: false }),
    block: new THREE.MeshBasicMaterial({ map: padTex, color: 0xff3048, transparent: true, depthWrite: false }),
  };
  const blobMat = new THREE.MeshBasicMaterial({ map: padTex, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
  const blob = (size) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), blobMat); m.position.y = 0.02; return m; };

  // ---- templates: stand-ins now, swapped for GLBs if they load
  /** @type {Record<string, THREE.Object3D>} */
  const templates = {};
  // the sleeping dog GLB is only 0.8 m long and 0.36 m high: too small to read from the follow camera
  const GROW = { dog: 1.5 }; // 1.6 out-sized the boss dog, 1.4 read too small without the outline
  const grown = (name, m) => { m.scale.multiplyScalar(GROW[name] ?? 1); return m; };
  // the dog GLB lies along +Z (head forward); turn it across the lane like the stand-in, head to +X.
  // Wrapped, because syncTrack sets the holder's rotation for the hit tip-over.
  const across = (name, m) => {
    if (name !== 'dog') return m;
    const g = new THREE.Group();
    m.rotation.y = Math.PI / 2;
    g.add(m);
    return g;
  };
  for (const name of [...KINDS, 'coin']) {
    templates[name] = grown(name, makeStandIn(/** @type {any} */ (name)));
    loadModel(name).then((m) => { if (!m.userData.standIn) templates[name] = grown(name, across(name, m)); });
  }

  // ---- kid
  const kidHolder = new THREE.Group();
  root.add(kidHolder);
  kidHolder.add(blob(1.1));
  let kid = makeStandIn('kid');
  let kidMixer = null;
  /** @type {Record<string, THREE.AnimationAction>} */
  let kidClips = {};
  let kidClip = '';
  const kidModel = new THREE.Group(); // faces -Z (forward); models face +Z
  kidModel.rotation.y = Math.PI;
  kidHolder.add(kidModel);
  kidModel.add(kid);
  loadModel('kid').then((m) => {
    // a kid GLB without Mixamo clips would slide along in a T-pose: keep the animated stand-in
    if (m.userData.standIn || !(m.userData.animations || []).length) return;
    kidModel.remove(kid);
    kid = m;
    kid.scale.setScalar(KID_SCALE);
    kidModel.add(kid);
    const clips = m.userData.animations || [];
    if (clips.length) {
      kidMixer = new THREE.AnimationMixer(kid);
      kidClips = Object.fromEntries(clips.map((c) => [c.name, kidMixer.clipAction(c)]));
    }
  });

  // ---- boss dog: holder (position) > model (faces -Z) > pose (gallop bob/lean/stretch)
  const chaserHolder = new THREE.Group();
  chaserHolder.visible = false;
  root.add(chaserHolder);
  chaserHolder.add(blob(1.3));
  const chaserModel = new THREE.Group();
  chaserModel.rotation.y = Math.PI;
  chaserModel.scale.setScalar(BOSS_SCALE);
  chaserHolder.add(chaserModel);
  const bossPose = new THREE.Group();
  chaserModel.add(bossPose);
  let boss = makeStandIn('bossdog');
  bossPose.add(boss);
  /** rigged boss (Mesh2Motion clips: Run, Bark, Bite, Howl, Idle, Sit); null = code gallop on the stand-in */
  let bossMixer = null;
  /** @type {Record<string, THREE.AnimationAction>} */
  let bossClips = {};
  let bossClip = '';
  /** seconds left of the howl at chase start */
  let howlT = 0;
  loadModel('bossdog').then((m) => {
    if (m.userData.standIn) return;
    addEyes(m, BOSS_EYES);
    bossPose.remove(boss); boss = m; bossPose.add(boss);
    const clips = m.userData.animations || [];
    if (clips.length) {
      bossMixer = new THREE.AnimationMixer(m);
      bossClips = Object.fromEntries(clips.map((c) => [c.name, bossMixer.clipAction(c)]));
    }
  });
  /** 0..1 through a playing clip. */
  const clipFrac = (action) => action.time / action.getClip().duration;
  /** Cross-fade one dog's mixer to a clip (missing clip: keep what plays). */
  function fadeTo(clips, from, to) {
    if (to === from || !clips[to]) return from;
    clips[to].reset().fadeIn(0.2).play();
    if (clips[from]) clips[from].fadeOut(0.2);
    return to;
  }
  const amberEye = new THREE.Color(0xffb020), redEye = new THREE.Color(0xff2020);
  let redness = 0;

  // ---- small running dogs (heel, pack, title): holder (world spot) > model (faces -Z) > pose (gallop)
  /**
   * @typedef {{ holder: THREE.Group, pose: THREE.Group, gallop: number, x: number, z: number,
   *   mode: string, t: number, hop: number, i: number, v?: number,
   *   mixer?: THREE.AnimationMixer, clips?: Record<string, THREE.AnimationAction>, clip?: string }} SmallDog
   */
  /** @returns {SmallDog} */
  function newSmallDog(x, z) {
    const holder = new THREE.Group();
    holder.add(blob(0.8));
    const model = new THREE.Group();
    model.rotation.y = Math.PI;
    holder.add(model);
    const pose = new THREE.Group();
    model.add(pose);
    const body = dogVariant(boss, SMALL_DOG);
    pose.add(body);
    root.add(holder);
    /** @type {SmallDog} */
    const d = { holder, pose, gallop: Math.random() * 6, x, z, mode: 'run', t: 0, hop: 0, i: 0 };
    if (bossMixer) {
      // clones don't carry the clips: bind the boss's clips to this copy
      d.mixer = new THREE.AnimationMixer(body);
      d.clips = Object.fromEntries(boss.userData.animations.map((c) => [c.name, d.mixer.clipAction(c)]));
      d.clip = fadeTo(d.clips, '', 'Run');
      d.mixer.update(Math.random()); // out of step with each other
    }
    return d;
  }
  function dropSmallDog(d) { root.remove(d.holder); }
  /** Gallop (or sit / lie down) and place a small dog at its world spot. */
  function poseSmallDog(d, speedMps, dt) {
    d.hop = Math.max(0, d.hop - dt * 3);
    d.holder.position.set(d.x, Math.sin(d.hop * Math.PI) * 0.5, d.z);
    if (d.mixer) {
      // rigged: Sit clip for sit and lie (lie squashes it flat), Run otherwise
      const still = d.mode === 'sit' || d.mode === 'lie';
      d.clip = fadeTo(d.clips, d.clip, d.mode === 'bark' ? 'Bark' : still ? 'Sit' : 'Run');
      d.clips.Run.timeScale = Math.max(speedMps, 3) / 7;
      d.mixer.update(dt);
      const k = d.mode === 'lie' ? Math.min(1, d.t * 2) : 0;
      // running: a bound per clip loop on top of the clip
      const r = d.clip === 'Run' ? runBob(clipFrac(d.clips.Run)) : { bob: 0, pitch: 0 };
      d.pose.position.y = r.bob;
      d.pose.rotation.set(r.pitch, 0, 0);
      d.pose.scale.set(1 + 0.15 * k, 1 - 0.4 * k, 1);
      return;
    }
    if (d.mode === 'sit' || d.mode === 'bark') {
      // pants, sits, scratches: front up, back squashed, a side wiggle
      d.pose.position.y = 0;
      d.pose.rotation.set(-0.45 * Math.min(1, d.t * 3), 0, Math.sin(d.t * 22) * 0.06);
      d.pose.scale.set(1, 1 + Math.sin(d.t * 14) * 0.03, 0.85);
      return;
    }
    if (d.mode === 'lie') {
      const k = Math.min(1, d.t * 2);
      d.pose.position.y = 0;
      d.pose.rotation.set(0, 0, 0);
      d.pose.scale.set(1 + 0.15 * k, 1 - 0.4 * k, 1);
      return;
    }
    d.gallop = advanceGallop(d.gallop, Math.max(speedMps, 3), dt);
    const g = gallopPose(d.gallop);
    d.pose.position.y = g.bob * 0.6;
    d.pose.rotation.set(g.lean, 0, 0);
    d.pose.scale.set(1, 1 / Math.sqrt(g.stretch), g.stretch);
  }

  /** @type {Map<number, SmallDog>} heel dogs by sim id; leaving ones move to negative keys */
  const heel = new Map();
  let leavingKey = -1;
  /** @type {SmallDog[]} */
  let pack = [];
  /** 'off' | 'intro' | 'chase' | 'giveup' */
  let packMode = 'off', packT = 0;
  /** sleeping dog on the title screen; at the start the same spot's dog runs off */
  let titleDog = null;
  /** @type {SmallDog|null} */
  let titleRunner = null;
  let wakeTitleDog = false;
  /** rigged boss on the title screen; titleBossT = seconds since the start (-1 = not howling) */
  let titleBoss = null, titleBossMixer = null, titleBossT = -1, titleBossClip = '';
  /** @type {Record<string, THREE.AnimationAction>} */
  let titleBossClips = {};

  function dropPack() {
    for (const d of pack) dropSmallDog(d);
    pack = [];
    packMode = 'off';
  }
  function clearSmallDogs() {
    for (const d of heel.values()) dropSmallDog(d);
    heel.clear();
    dropPack();
    if (titleRunner) { dropSmallDog(titleRunner); titleRunner = null; }
  }

  function syncSmallDogs(world, interp, dt) {
    const p = world.player;
    const laneW = cfg.player.laneWidth;
    const kidZ = -interp.z;
    const ease = (from, to, rate) => from + (to - from) * Math.min(1, dt * rate);
    // caught: every small dog sits clear of the boss's grab (the sim is frozen, timers stop)
    const caught = world.phase === 'caught';
    let caughtIdx = 0;
    const sitForCatch = (d) => {
      const spot = caughtDogSpot(caughtIdx++, interp.x, laneW);
      d.x = ease(d.x, spot.x, 4);
      d.z = ease(d.z, kidZ + 0.6 + spot.back, 4); // the kid is pulled back 0.6 m
      if (d.mode !== 'bark') { d.mode = 'bark'; d.t = 0; } // caught cutscene: they bark at him
    };

    // heel dogs follow their slot; one whose time ran out sits where it is and drops out of frame
    const ids = new Set(world.heelDogs.map((h) => h.id));
    for (const [key, d] of [...heel]) {
      if (key > 0 && !ids.has(key)) { heel.delete(key); d.mode = 'tired'; d.t = 0; d.v = p.speedMps; heel.set(leavingKey--, d); }
    }
    world.heelDogs.forEach((h, i) => {
      let d = heel.get(h.id);
      const slot = heelSlot(/** @type {0|1} */ (Math.min(i, 1)), interp.x, laneW);
      if (!d) { d = newSmallDog(slot.x, kidZ + slot.back); d.hop = 1; heel.set(h.id, d); }
      if (caught) { sitForCatch(d); return; }
      d.x = ease(d.x, slot.x, 5);
      d.z = ease(d.z, kidZ + slot.back, 8);
    });
    for (const [key, d] of [...heel]) {
      d.t += dt;
      if (d.mode === 'tired') {
        // slows down panting so the kid gets ahead, then sits and scratches
        d.v *= Math.exp(-dt * 1.2);
        d.z -= d.v * dt;
        if (d.v < 1.5) { d.mode = 'sit'; d.t = 0; }
      }
      if (key < 0 && d.mode === 'sit' && d.t > 2.5) { dropSmallDog(d); heel.delete(key); continue; }
      poseSmallDog(d, key > 0 ? p.speedMps : d.v ?? 0, dt);
    }

    // chase pack: run in from the sides, fall back to the boss, then run with it
    if (packMode !== 'off') {
      packT += dt;
      const fx = cfg.effects;
      if (!pack.length) {
        for (let i = 0; i < fx.packSize; i++) {
          const d = newSmallDog(interp.x + (i % 2 ? -4 : 4), kidZ + 2.5);
          d.i = i;
          pack.push(d);
        }
      }
      if (packMode === 'intro' && packT >= fx.packIntroTime) packMode = 'chase';
      const intro = packMode === 'intro';
      const bossShown = chaserHolder.visible;
      for (const d of pack) {
        d.t += dt;
        const off = (d.i - (pack.length - 1) / 2) * 1.3;
        if (caught) {
          sitForCatch(d);
        } else if (packMode === 'giveup') {
          if (d.t > 0) d.mode = 'lie';
        } else if (intro) {
          d.x = ease(d.x, interp.x + off * 1.1, 4);
          d.z = ease(d.z, kidZ + 0.5 + (d.i % 2) * 0.3, 6);
        } else if (bossShown) {
          d.x = ease(d.x, chaserHolder.position.x + off, 4);
          d.z = ease(d.z, chaserHolder.position.z - 0.3 + (d.i % 2) * 0.3, 4);
        } else {
          d.z = ease(d.z, kidZ + 6, 2); // fall back out of frame
        }
        d.holder.visible = caught || intro || bossShown || packMode === 'giveup' || d.z < kidZ + 4;
        poseSmallDog(d, packMode === 'giveup' ? 0 : p.speedMps, dt);
      }
      if (packMode === 'giveup' && packT > 2) dropPack();
    }

    // title (rigged boss): the boss sits in the soi staring at the kid; at the start it howls
    // and is left behind, since it is the chaser. Without the rig: the old sleeping tan dog.
    if (bossMixer) {
      if (!titleBoss) {
        titleBoss = new THREE.Group();
        titleBoss.add(blob(1.3));
        const body = cloneSkinned(boss);
        body.rotation.y = -0.6;
        body.scale.setScalar(BOSS_SCALE);
        titleBoss.add(body);
        titleBossMixer = new THREE.AnimationMixer(body);
        titleBossClips = Object.fromEntries(boss.userData.animations.map((c) => [c.name, titleBossMixer.clipAction(c)]));
        root.add(titleBoss);
      }
      if (titleDog) titleDog.visible = false;
      if (wakeTitleDog) { wakeTitleDog = false; titleBossT = 0; }
      if (world.phase === 'title') {
        titleBossT = -1;
        titleBoss.position.set(1.7, 0, kidZ - 2.2);
      } else if (titleBossT >= 0) titleBossT += dt;
      if (titleBossT > 3) titleBossT = -1;
      titleBoss.visible = world.phase === 'title' || titleBossT >= 0;
      if (titleBoss.visible) {
        titleBossClip = fadeTo(titleBossClips, titleBossClip, titleBossT >= 0 && titleBossT < 2.3 ? 'Howl' : 'Sit');
        titleBossMixer.update(dt);
      }
      return;
    }
    // title: a sleeping dog beside the start; it wakes and runs off when the run starts
    if (!titleDog || titleDog.userData.src !== templates.dog) {
      // (re)made when the sleeping-dog GLB replaces its stand-in
      if (titleDog) root.remove(titleDog);
      titleDog = templates.dog.clone();
      titleDog.userData.src = templates.dog;
      titleDog.rotation.y = -0.6;
      root.add(titleDog);
    }
    titleDog.visible = world.phase === 'title';
    titleDog.position.set(1.7, 0, kidZ - 1.6);
    if (wakeTitleDog) {
      wakeTitleDog = false;
      titleRunner = newSmallDog(1.7, kidZ - 1.6);
      titleRunner.hop = 1;
    }
    if (titleRunner) {
      titleRunner.t += dt;
      titleRunner.z -= 9 * dt; // faster than a jog: shoots off ahead and to the side
      titleRunner.x = ease(titleRunner.x, 3.6, 1.5);
      poseSmallDog(titleRunner, 9, dt);
      if (titleRunner.t > 2) { dropSmallDog(titleRunner); titleRunner = null; }
    }
  }

  // ---- obstacles and coins, by sim id
  /** @type {Map<number, { obj: THREE.Object3D, pad?: THREE.Mesh, kind: string, hitT: number, side: number }>} */
  const live = new Map();
  const { take, give } = meshPool(templates, root);

  // ---- animation state
  let phase = 0;
  let stepKick = 0;
  let time = 0;
  let chaserX = 0;
  let caughtT = 0;
  let gallop = 0;
  /** seconds left of the boss peek after a hit; peekIn eases 0..1 */
  let peekT = 0, peekIn = 0;
  /** stumble length when it started (1.5 s, or 2 s for a tuk-tuk), for the code tumble */
  let tumbleTotal = 0;
  const seen = new Set();

  let lastX = 0, lean = 0, yaw = 0, jumpT = 1, landT = 1;
  function syncKid(world, interp, dt) {
    const p = world.player;
    // caught: the dog has the shirt and pulls the kid back, tipping him backwards
    const pull = world.phase === 'caught' ? Math.min(1, caughtT / 0.3) : 0;
    kidHolder.position.set(interp.x, 0, -interp.z + pull * 0.6);
    kidHolder.rotation.x = pull * 0.35;
    if (p.stumbleT > tumbleTotal || p.stumbleT === 0) tumbleTotal = p.stumbleT;
    kidModel.position.y = interp.y;
    // lean into lane changes (roll toward the direction of travel)
    const vx = dt > 0 ? (interp.x - lastX) / dt : 0;
    lastX = interp.x;
    lean += (Math.max(-0.35, Math.min(0.35, -vx * 0.025)) - lean) * Math.min(1, dt * 14);
    kidHolder.rotation.z = lean;
    jumpT += dt; landT += dt;
    stepKick = Math.max(0, stepKick - dt * 6);
    const caughtClip = kidClips.caught ? 'caught' : 'idle'; // Mixamo "Terrified" for the cutscene
    const clip = world.phase === 'title' ? 'idle' : world.phase === 'caught' ? caughtClip : animationFor(p);

    if (kidMixer) {
      // stumble = a jogging stagger, not a fall (Pong: lying down felt wrong): the run clip,
      // slowed, with the body pitched forward and wobbling side to side, settling by the end
      const stumbling = clip === 'stumble';
      const want = stumbling ? 'run' : kidClips[clip] ? clip : 'run';
      if (want !== kidClip && kidClips[want]) {
        kidClips[want].reset().fadeIn(0.15).play();
        if (kidClips[kidClip]) kidClips[kidClip].fadeOut(0.15);
        kidClip = want;
      }
      // Sprint clip covers ~1.8 m per cycle at 1x (~3.4 m/s): follow the kid's speed
      if (kidClips.run) kidClips.run.timeScale = stumbling ? 0.7 : Math.max(0.7, Math.min(1.8, p.speedMps / 5));
      const left = stumbling && tumbleTotal > 0 ? p.stumbleT / tumbleTotal : 0; // 1 at the hit, 0 at the end
      // running: lean forward with speed; turn the body toward a lane change
      const drive = clip === 'run' ? 0.1 * Math.min(1, p.speedMps / cfg.player.maxSpeed) : 0;
      const pitch = 0.45 * left * left + drive, roll = Math.sin(time * 13) * 0.18 * left;
      kid.rotation.x += (pitch - kid.rotation.x) * Math.min(1, dt * 18);
      kid.rotation.z += (roll - kid.rotation.z) * Math.min(1, dt * 18);
      yaw += (Math.max(-0.35, Math.min(0.35, -vx * 0.04)) - yaw) * Math.min(1, dt * 12);
      kidModel.rotation.y = Math.PI + yaw;
      // squash/stretch from the feet: jump and landing, a small dip on each real step
      const squash = jumpSquash(jumpT, landT, p.airborne, p.vy / cfg.player.jumpVelocity) ?? (clip === 'run' ? -0.05 * stepKick : 0);
      kid.scale.set(KID_SCALE * (1 - squash * 0.5), KID_SCALE * (1 + squash), KID_SCALE * (1 - squash * 0.5));
      kidMixer.update(dt);
      return;
    }
    const rig = kid.userData.rig;
    if (!rig) return;
    const speed = world.phase === 'running' ? p.speedMps : 0;
    phase += (speed / STRIDE) * Math.PI * 2 * dt * 0.5;
    const amp = clip === 'idle' ? 0 : Math.min(1, 0.25 + speed / cfg.player.maxSpeed);
    const s = Math.sin(phase);
    // blend toward the pose instead of snapping: run <-> jump eases over ~0.1 s
    const ease = (obj, key, to) => { obj[key] += (to - obj[key]) * Math.min(1, dt * 20); };
    if (clip === 'jump') {
      // tuck legs on the way up, reach down for the ground on the way down
      const rise = Math.max(-1, Math.min(1, p.vy / cfg.player.jumpVelocity));
      ease(rig.legs[0].rotation, 'x', 0.4 + 0.5 * rise); ease(rig.legs[1].rotation, 'x', -0.2 - 0.3 * rise);
      ease(rig.arms[0].rotation, 'x', -2.4); ease(rig.arms[1].rotation, 'x', -2.0);
      ease(rig.arms[0].rotation, 'z', -0.3); ease(rig.arms[1].rotation, 'z', 0.3);
      ease(rig.body.position, 'y', 0);
    } else {
      ease(rig.legs[0].rotation, 'x', s * 1.0 * amp); ease(rig.legs[1].rotation, 'x', -s * 1.0 * amp);
      ease(rig.arms[0].rotation, 'x', -s * 1.2 * amp); ease(rig.arms[1].rotation, 'x', s * 1.2 * amp);
      ease(rig.arms[0].rotation, 'z', 0); ease(rig.arms[1].rotation, 'z', 0);
      rig.body.position.y = Math.abs(s) * 0.09 * amp + (clip === 'idle' ? Math.sin(time * 2.5) * 0.01 : 0);
    }
    // squash on each foot plant, stretch between; crouch at take-off, stretch rising, squash on landing
    const squash = jumpSquash(jumpT, landT, clip === 'jump', p.vy / cfg.player.jumpVelocity)
      ?? (clip === 'run' ? 0.05 * Math.cos(phase * 2) * amp - stepKick * 0.06 : 0);
    rig.body.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    rig.body.rotation.x = clip === 'stumble' ? tumblePitch(p.stumbleT) : clip === 'run' ? 0.12 * amp : 0;
    rig.head.rotation.x = clip === 'stumble' ? -0.3 : 0;
    if (clip === 'stumble') {
      // scrambling arms and legs while down
      rig.arms[0].rotation.x = -1.6 + Math.sin(time * 26) * 0.9; rig.arms[1].rotation.x = -1.6 - Math.sin(time * 26) * 0.9;
      rig.legs[0].rotation.x = Math.sin(time * 22) * 0.7; rig.legs[1].rotation.x = -Math.sin(time * 22) * 0.7;
    }
    if (world.phase === 'caught') {
      // pulled back by the shirt: arms flail
      rig.arms[0].rotation.x = -2.6 + Math.sin(time * 24) * 0.6; rig.arms[1].rotation.x = -2.6 - Math.sin(time * 24) * 0.6;
      rig.arms[0].rotation.z = -0.5; rig.arms[1].rotation.z = 0.5;
      rig.body.position.y = Math.abs(Math.sin(time * 18)) * 0.05;
    }
  }

  /** Tumble: fall forward fast, stay down, scramble back up by the end of the stumble. */
  function tumblePitch(stumbleT) {
    const u = tumbleTotal > 0 ? 1 - stumbleT / tumbleTotal : 1;
    if (u < 0.2) return 1.2 * (u / 0.2);
    if (u < 0.65) return 1.2 + Math.sin(time * 30) * 0.05;
    return 1.2 * Math.max(0, 1 - (u - 0.65) / 0.35);
  }

  function syncChaser(world, interp, dt) {
    const ch = world.chaser;
    peekT = Math.max(0, peekT - dt);
    howlT = Math.max(0, howlT - dt);
    const show = showChaser(world, peekT);
    chaserHolder.visible = show || peekIn > 0.01;
    redness += ((eyeColor(world) === 'red' ? 1 : 0) - redness) * Math.min(1, dt * 5);
    for (const e of boss.userData.eyes ?? []) e.material.color.copy(amberEye).lerp(redEye, redness);
    const caught = world.phase === 'caught';
    caughtT = caught ? caughtT + dt : 0;
    // peek: slides in from behind the camera, then back out (real gap untouched)
    const peeking = !ch.visible && !caught && peekT > 0;
    peekIn += ((peeking ? 1 : 0) - peekIn) * Math.min(1, dt * 8);
    if (!chaserHolder.visible) return;
    const lunge = caught ? Math.min(1, caughtT / 0.25) : 0;
    let back = chaserBack(ch.gap, cfg.chaser);
    if (!ch.visible && !caught) back = chaserBack(cfg.chaser.visibleGap * 0.5, cfg.chaser) + (1 - peekIn) * 3;
    back += (0.4 - back) * lunge;
    const side = chaserSide(interp.x);
    const targetX = interp.x + side * (caught ? 0.5 : 0.7); // caught: beside the kid so the head reads on camera
    chaserX += (targetX - chaserX) * Math.min(1, dt * 4);
    // caught: the kid is pulled back 0.6 m, the dog stays just behind him
    chaserHolder.position.set(chaserX, 0, -interp.z + back + (caught ? 0.6 * lunge : 0));
    gallop = advanceGallop(gallop, caught ? 0 : Math.max(ch.speedMps, 4), dt);
    const pose = gallopPose(gallop);
    if (bossMixer) {
      // rigged: clips do the body, code only places it (caught: lunge in beside the kid)
      bossClip = fadeTo(bossClips, bossClip, caught ? 'Bite' : howlT > 0 ? 'Howl' : peeking ? 'Bark' : 'Run');
      if (bossClips.Run) bossClips.Run.timeScale = Math.max(ch.speedMps, 4) / 7;
      bossMixer.update(dt);
      // running: a bound per clip loop on top of the clip
      const r = bossClip === 'Run' ? runBob(clipFrac(bossClips.Run)) : { bob: 0, pitch: 0 };
      bossPose.position.y = r.bob;
      bossPose.rotation.set(r.pitch, 0, 0);
      bossPose.scale.set(1, 1, 1);
      chaserModel.rotation.y = Math.PI + (caught ? side * 0.6 * lunge : 0);
      return;
    }
    if (caught) {
      // rear up, teeth in the back of the shirt, tug side to side
      bossPose.position.y = 0.1 * lunge;
      bossPose.rotation.set(-0.55 * lunge, 0, Math.sin(time * 14) * 0.12 * lunge);
      bossPose.scale.set(1, 1, 1);
      chaserModel.rotation.y = Math.PI + side * 0.6 * lunge; // head turned in toward the shirt
    } else {
      chaserModel.rotation.y = Math.PI;
      bossPose.position.y = pose.bob;
      bossPose.rotation.set(pose.lean, 0, 0);
      bossPose.scale.set(1, 1 / Math.sqrt(pose.stretch), pose.stretch);
    }
  }

  let lastTrack = null;
  function release(id, a) {
    give(a.kind, a.obj);
    if (a.pad) root.remove(a.pad);
    live.delete(id);
  }

  function syncTrack(world, dt) {
    const laneW = cfg.player.laneWidth;
    // ids restart with every run's new track: drop the old run's meshes
    if (world.track !== lastTrack) {
      for (const [id, a] of live) release(id, a);
      lastTrack = world.track;
    }
    seen.clear();
    for (const o of world.track.obstacles) {
      seen.add(o.id);
      let a = live.get(o.id);
      if (!a) {
        const obj = take(o.kind);
        const pad = new THREE.Mesh(padGeo, padMat[o.type]);
        root.add(pad);
        a = { obj, pad, kind: o.kind, hitT: 0, side: o.lane === 0 ? (o.id % 2 ? 1 : -1) : Math.sign(o.lane) };
        live.set(o.id, a);
      }
      const x = o.lane * laneW, z = -o.z;
      a.pad.position.set(x, 0.015, z);
      a.pad.visible = !o.hit;
      if (o.hit) a.hitT += dt;
      // a hit sleeping dog wakes and becomes a heel dog (the lying one just goes, never flies);
      // a hit jar breaks into the splash effects.js draws
      a.obj.visible = !(o.hit && (o.kind === 'dog' || o.kind === 'jar'));
      // hit: shoved aside and tipped over (the run goes on)
      const h = Math.min(1, a.hitT / 0.35);
      const ease = 1 - (1 - h) * (1 - h);
      a.obj.position.set(x + a.side * ease * 1.3, 0, z);
      a.obj.rotation.set(0, 0, -a.side * ease * 0.5);
    }
    for (const c of world.track.coins) {
      seen.add(c.id);
      let a = live.get(c.id);
      if (!a) {
        a = { obj: take('coin'), kind: 'coin', hitT: 0, side: 0 };
        live.set(c.id, a);
      }
      if (c.taken) a.hitT += dt;
      const h = Math.min(1, a.hitT / 0.2);
      a.obj.visible = h < 1;
      a.obj.position.set(c.lane * laneW, COIN_Y + h * 0.7, -c.z);
      a.obj.scale.setScalar(1 + h * 0.6);
      a.obj.rotation.y = time * 3.5 + c.id * 0.7;
    }
    for (const [id, a] of live) if (!seen.has(id)) release(id, a);
  }

  return {
    /**
     * @param {any} world
     * @param {number} alpha unused: positions come pre-interpolated in interp
     * @param {{ z: number, x: number, y: number }} interp player position between sim steps
     * @param {number} dt render seconds since the last sync
     */
    sync(world, alpha, interp, dt) {
      time += dt;
      syncKid(world, interp, dt);
      syncChaser(world, interp, dt);
      syncTrack(world, dt);
      syncSmallDogs(world, interp, dt);
    },
    onEvent(name) {
      if (name === 'run-start') {
        phase = 0; peekT = 0; peekIn = 0;
        wakeTitleDog = titleBoss?.visible || (titleDog?.visible ?? false);
        clearSmallDogs();
      }
      else if (name === 'chase-start') { packMode = 'intro'; packT = 0; howlT = 1.2; }
      else if (name === 'chase-survived') {
        // in view: the pack gives up and lies down, one after another; out of view: just gone
        if (pack.some((d) => d.holder.visible)) { packMode = 'giveup'; packT = 0; for (const d of pack) d.t = -0.3 * d.i; }
        else dropPack();
      }
      else if (name === 'hit') peekT = cfg.effects.peekTime;
      else if (name === 'jump') jumpT = 0;
      else if (name === 'land') landT = 0;
    },
    onSteps(n) {
      if (n <= 0) return;
      stepKick = 1;
      // pull the leg cycle toward the next foot plant so feet land with real steps
      const next = (Math.floor(phase / Math.PI) + 1) * Math.PI;
      phase += (next - phase) * 0.35;
    },
    kidHolder,
    chaserHolder,
  };
}
